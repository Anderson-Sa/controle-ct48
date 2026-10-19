package br.com.pda.ct48

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import org.json.JSONObject

/**
 * Roda o tempo todo em primeiro plano: consulta o estado no servidor (liberado/bloqueado)
 * e envia a posição. É quem aplica o bloqueio quando o ADM devolve ou bloqueia remotamente.
 */
class MonitorService : Service() {

    private lateinit var thread: HandlerThread
    private lateinit var h: Handler
    private val prefs by lazy { Prefs(this) }

    private var intervaloEstadoMs = 10_000L
    private var intervaloPosicaoMs = 30_000L
    private var ultimaPosicao = 0L
    @Volatile private var local: Location? = null

    private val ouvinteLocal = LocationListener { novo ->
        val atual = local
        // Fica com a leitura mais recente, a não ser que seja bem menos precisa que uma de menos de 30 s atrás
        if (atual == null || novo.time - atual.time > 30_000 || novo.accuracy <= atual.accuracy) local = novo
    }

    private val ciclo = object : Runnable {
        override fun run() {
            consultar()
            h.removeCallbacks(this)
            h.postDelayed(this, intervaloEstadoMs)
        }
    }

    override fun onCreate() {
        super.onCreate()
        criarCanal()
        startForeground(1, notificacao(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        thread = HandlerThread("monitor").also { it.start() }
        h = Handler(thread.looper)
        iniciarLocalizacao()
        h.post(ciclo)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACAO_CONSULTAR) h.post(ciclo)
        return START_STICKY
    }

    override fun onDestroy() {
        runCatching { getSystemService(LocationManager::class.java).removeUpdates(ouvinteLocal) }
        h.removeCallbacksAndMessages(null)
        thread.quitSafely()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun consultar() {
        val servidor = prefs.servidor
        val token = prefs.token
        if (servidor.isNullOrBlank() || token.isNullOrBlank()) {
            aplicar(EstadoAparelho.BLOQUEADO, online = false)
            return
        }
        val api = Api(servidor, token)
        try {
            val j = api.get("/api/dispositivo/estado")
            intervaloEstadoMs = j.optLong("intervaloEstadoSegundos", 10).coerceIn(3, 120) * 1000
            intervaloPosicaoMs = j.optLong("intervaloPosicaoSegundos", 30).coerceIn(10, 600) * 1000
            val pessoa = j.optJSONObject("pessoa")
            val apps = j.optJSONArray("apps")?.let { a -> List(a.length()) { a.getString(it) } } ?: emptyList()
            val nome = j.optString("nome").ifBlank { null }
            if (nome != null && nome != prefs.nome) prefs.nome = nome
            aplicar(
                EstadoAparelho(
                    liberado = j.optBoolean("liberado"),
                    nome = nome,
                    pessoa = pessoa?.optString("nome"),
                    ident = pessoa?.optString("ident"),
                    desde = j.optLong("desde", 0),
                    apps = apps,
                    manutencao = if (j.isNull("manutencao")) null else j.optString("manutencao").ifBlank { null }
                ),
                online = true
            )
            if (System.currentTimeMillis() - ultimaPosicao >= intervaloPosicaoMs) enviarPosicao(api)
        } catch (e: ApiErro) {
            if (e.status == 401) {
                // Registro revogado no painel ("Registrar de novo"): volta para a tela de registro, bloqueado
                prefs.token = null
                aplicar(EstadoAparelho.BLOQUEADO, online = false)
            } else {
                // Sem sinal: mantém o último estado conhecido, para não travar quem está trabalhando
                Estado.atualizar(null, online = false)
            }
        }
    }

    private fun aplicar(novo: EstadoAparelho, online: Boolean) {
        val antes = Estado.atual
        Estado.atualizar(novo, online)
        if (antes.liberado == novo.liberado && antes.apps == novo.apps) return
        Kiosk.permitirApps(this, if (novo.liberado) novo.apps else emptyList())
        if (antes.liberado && !novo.liberado) {
            // Traz a tela de bloqueio para frente (os apps da empresa já foram fechados pelo Kiosk)
            startActivity(Intent(this, BloqueioActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    private fun enviarPosicao(api: Api) {
        val j = JSONObject()
        local?.takeIf { System.currentTimeMillis() - it.time < 120_000 }?.let {
            j.put("lat", it.latitude)
            j.put("lng", it.longitude)
            j.put("precisao", it.accuracy.toDouble())
        }
        bssid()?.let { j.put("bssid", it) }
        // Bateria vai junto: o painel mostra o nível e alerta quando estiver baixa
        getSystemService(BatteryManager::class.java)?.let { bm ->
            val nivel = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
            if (nivel in 0..100) {
                j.put("bateria", nivel)
                j.put("carregando", bm.isCharging)
            }
        }
        if (j.length() == 0) return
        runCatching { api.post("/api/dispositivo/posicao", j) }.onSuccess { ultimaPosicao = System.currentTimeMillis() }
    }

    @Suppress("DEPRECATION")
    private fun bssid(): String? {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return null
        val b = getSystemService(WifiManager::class.java)?.connectionInfo?.bssid ?: return null
        return b.lowercase().takeIf { it != "02:00:00:00:00:00" }
    }

    @SuppressLint("MissingPermission")
    private fun iniciarLocalizacao() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return
        val lm = getSystemService(LocationManager::class.java)
        for (provedor in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)) {
            if (lm.isProviderEnabled(provedor)) {
                lm.requestLocationUpdates(provedor, 15_000L, 5f, ouvinteLocal, thread.looper)
            }
        }
    }

    private fun criarCanal() {
        val canal = NotificationChannel(CANAL, getString(R.string.canal_nome), NotificationManager.IMPORTANCE_LOW)
        getSystemService(NotificationManager::class.java).createNotificationChannel(canal)
    }

    private fun notificacao(): Notification =
        Notification.Builder(this, CANAL)
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.notificacao_texto))
            .setOngoing(true)
            .build()

    companion object {
        private const val CANAL = "monitor"
        private const val ACAO_CONSULTAR = "br.com.pda.ct48.CONSULTAR"

        fun iniciar(ctx: Context) {
            ctx.startForegroundService(Intent(ctx, MonitorService::class.java))
        }

        /** Pede uma consulta imediata (ex.: logo depois de ler o QR). */
        fun consultarAgora(ctx: Context) {
            ctx.startForegroundService(Intent(ctx, MonitorService::class.java).setAction(ACAO_CONSULTAR))
        }
    }
}
