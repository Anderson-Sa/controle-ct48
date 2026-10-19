package br.com.pda.ct48

import android.app.Activity
import android.app.ActivityManager
import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.widget.EditText
import android.widget.GridLayout
import android.widget.TextView
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.concurrent.thread

/**
 * Tela inicial do CT48: bloqueio com leitura do QR de liberação, ou lista dos apps da empresa
 * quando liberado. Liberado, a mesma tela lê o QR de devolução do ADM.
 */
class BloqueioActivity : Activity() {

    private val prefs by lazy { Prefs(this) }
    private val principal = Handler(Looper.getMainLooper())
    private lateinit var scanner: Scanner
    private var validando = false
    private val teclado = StringBuilder()   // leitor configurado como teclado (wedge) ou testes no emulador
    private var appsMostrados: List<String>? = null
    private var avisarDevolucao = false   // mostra "devolvido" quando a tela de bloqueio voltar

    private val aoMudarEstado = Runnable { principal.post { render() } }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_bloqueio)
        Kiosk.configurar(this)
        scanner = Scanner(this) { principal.post { aoLer(it) } }
        if (BuildConfig.DEBUG) {
            findViewById<View>(R.id.b_aparelho).setOnLongClickListener { menuTestes(); true }
        }
    }

    override fun onResume() {
        super.onResume()
        if (!prefs.registrado) {
            startActivity(Intent(this, RegistroActivity::class.java))
            return
        }
        entrarNoQuiosque()
        MonitorService.iniciar(this)
        Estado.ouvir(aoMudarEstado)
        render()
        MonitorService.consultarAgora(this)
    }

    override fun onPause() {
        Estado.parar(aoMudarEstado)
        scanner.desligar()
        super.onPause()
    }

    private fun entrarNoQuiosque() {
        if (!Kiosk.ehDono(this)) return
        val am = getSystemService(ActivityManager::class.java)
        if (am.lockTaskModeState == ActivityManager.LOCK_TASK_MODE_NONE) startLockTask()
    }

    @Deprecated("Botão voltar não sai da tela inicial")
    override fun onBackPressed() { /* ignorado de propósito */ }

    private fun render() {
        if (!prefs.registrado) {
            startActivity(Intent(this, RegistroActivity::class.java))
            return
        }
        val e = Estado.atual
        val nome = e.nome ?: prefs.nome ?: "CT48"
        val conexao = if (Estado.online) "● ONLINE" else "○ SEM CONEXÃO COM O SERVIDOR"

        findViewById<View>(R.id.tela_bloqueio).visibility = if (e.liberado) View.GONE else View.VISIBLE
        findViewById<View>(R.id.tela_liberado).visibility = if (e.liberado) View.VISIBLE else View.GONE

        // O leitor fica com este app só enquanto a tela inicial está aberta (onPause solta para o WMS)
        scanner.ligar()
        if (e.liberado) {
            findViewById<TextView>(R.id.l_aparelho).text = nome.uppercase()
            findViewById<TextView>(R.id.l_pessoa).text = e.pessoa ?: ""
            val desde = if (e.desde > 0) " · desde " + SimpleDateFormat("HH:mm", Locale("pt", "BR")).format(Date(e.desde)) else ""
            findViewById<TextView>(R.id.l_detalhe).text = (e.ident ?: "") + desde
            findViewById<TextView>(R.id.l_conexao).text = conexao
            mostrarApps(e.apps)
        } else {
            findViewById<TextView>(R.id.b_aparelho).text = nome.uppercase()
            findViewById<TextView>(R.id.b_conexao).text = conexao
            val emManutencao = e.manutencao != null
            findViewById<TextView>(R.id.b_titulo).setText(if (emManutencao) R.string.manutencao_titulo else R.string.bloqueado_titulo)
            findViewById<TextView>(R.id.b_instrucao).setText(if (emManutencao) R.string.manutencao_instrucao else R.string.bloqueado_instrucao)
            if (avisarDevolucao) {
                avisarDevolucao = false
                mensagem("Aparelho devolvido. Obrigado!", R.color.ok)
                principal.postDelayed({ if (!validando) esconderMensagem() }, 5000)
            }
        }
    }

    private fun mostrarApps(pacotes: List<String>) {
        if (pacotes == appsMostrados) return
        appsMostrados = pacotes
        val grade = findViewById<GridLayout>(R.id.l_apps)
        grade.removeAllViews()
        val pm = packageManager
        val tam = resources.displayMetrics.widthPixels / 3 - 24
        var algum = false
        for (pacote in pacotes) {
            val abrir = pm.getLaunchIntentForPackage(pacote) ?: continue
            val info = runCatching { pm.getApplicationInfo(pacote, 0) }.getOrNull() ?: continue
            val icone = pm.getApplicationIcon(info).apply { setBounds(0, 0, 120, 120) }
            grade.addView(TextView(this).apply {
                text = pm.getApplicationLabel(info)
                gravity = Gravity.CENTER
                textSize = 14f
                setTextColor(getColor(R.color.texto))
                setCompoundDrawables(null, icone, null, null)
                compoundDrawablePadding = 12
                setPadding(8, 20, 8, 20)
                setWidth(tam)
                isClickable = true
                setOnClickListener { startActivity(abrir) }
            })
            algum = true
        }
        findViewById<View>(R.id.l_vazio).visibility = if (algum) View.GONE else View.VISIBLE
    }

    /* ---------- Leitura do QR ---------- */

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action != KeyEvent.ACTION_DOWN) return super.dispatchKeyEvent(event)
        if (event.keyCode == KeyEvent.KEYCODE_ENTER && teclado.isNotEmpty()) {
            aoLer(teclado.toString()); teclado.clear()
            return true
        }
        val c = event.unicodeChar
        if (c > 0) { teclado.append(c.toChar()); return true }
        return super.dispatchKeyEvent(event)
    }

    private fun aoLer(conteudo: String) {
        if (validando) return
        val servidor = prefs.servidor ?: return
        val devolucao = conteudo.startsWith("PDA|DEV|")
        val liberado = Estado.atual.liberado
        if (devolucao != liberado) {
            mensagem(
                if (liberado) "Este aparelho já está liberado. Para devolver, leia o QR de devolução do ADM."
                else "Este é o QR de devolução. Para usar o aparelho, peça ao ADM o QR de liberação.",
                R.color.erro
            )
            principal.postDelayed({ if (!validando) esconderMensagem() }, 5000)
            return
        }
        validando = true
        mensagem("Validando no servidor…", R.color.texto)
        thread {
            val rota = if (devolucao) "/api/dispositivo/devolver" else "/api/dispositivo/liberar"
            val (ok, msg) = try {
                val r = Api(servidor, prefs.token).post(rota, JSONObject().put("conteudo", conteudo))
                r.optBoolean("ok") to r.optString("msg", "Resposta inválida do servidor.")
            } catch (e: ApiErro) {
                false to (e.message ?: "Erro no servidor.")
            }
            principal.post {
                validando = false
                mensagem(if (ok && devolucao) "Devolvido. Bloqueando o aparelho…" else msg, if (ok) R.color.ok else R.color.erro)
                if (ok) {
                    avisarDevolucao = devolucao
                    // O MonitorService aplica o bloqueio (fecha os apps da empresa) ao receber o novo estado
                    MonitorService.consultarAgora(this)
                } else principal.postDelayed({ if (!validando) esconderMensagem() }, 5000)
            }
        }
    }

    /** A mensagem aparece na tela que está à vista: bloqueio ou liberado. */
    private fun campoMensagem(): TextView =
        findViewById(if (Estado.atual.liberado) R.id.l_msg else R.id.b_msg)

    private fun mensagem(texto: String, cor: Int) {
        esconderMensagem()
        campoMensagem().apply {
            text = texto
            setTextColor(getColor(cor))
            visibility = View.VISIBLE
        }
    }

    private fun esconderMensagem() {
        findViewById<View>(R.id.b_msg).visibility = View.INVISIBLE
        findViewById<View>(R.id.l_msg).visibility = View.GONE
    }

    /* ---------- Só em builds de teste: toque longo no nome do aparelho ---------- */

    private fun menuTestes() {
        AlertDialog.Builder(this)
            .setTitle("Testes")
            .setItems(arrayOf("Digitar conteúdo do QR", "Sair do modo quiosque e remover Device Owner")) { _, i ->
                when (i) {
                    0 -> {
                        val campo = EditText(this).apply { hint = "PDA|LIB|… ou PDA|DEV|…" }
                        AlertDialog.Builder(this).setView(campo)
                            .setPositiveButton("Ler") { _, _ -> aoLer(campo.text.toString().trim()) }
                            .setNegativeButton("Cancelar", null).show()
                    }
                    1 -> {
                        runCatching { stopLockTask() }
                        Kiosk.removerDono(this)
                    }
                }
            }
            .show()
    }
}
