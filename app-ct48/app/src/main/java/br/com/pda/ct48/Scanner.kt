package br.com.pda.ct48

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.util.Log

/**
 * Leitor de código do Urovo CT48.
 *
 * O serviço de leitura da Urovo entrega cada leitura de um destes jeitos, conforme a configuração
 * do aparelho (Configurações > Scanner > Modo de saída):
 *  - Intent (broadcast): ação "android.intent.ACTION_DECODE_DATA", texto em "barcode_string".
 *    Firmwares antigos usam "urovo.rcv.message" com os bytes em "barocode" (com esse erro de grafia).
 *  - Teclado (wedge): o código chega como teclas digitadas. A BloqueioActivity também trata esse caso.
 *
 * Enquanto a tela inicial está aberta, este leitor coloca o scanner em modo Intent pela classe
 * android.device.ScanManager, que vem no firmware da Urovo (chamada por reflexão, sem SDK no projeto).
 * Ao sair, devolve o modo que estava antes, para não atrapalhar o WMS. Se a classe não existir
 * (emulador ou outro aparelho), nada quebra: sobra o modo teclado.
 *
 * Conferir no CT48 real: o nome da ação de broadcast pode ter sido trocado na configuração do scanner.
 */
class Scanner(private val ctx: Context, private val aoLer: (String) -> Unit) {

    private var ligado = false
    private var modoAnterior: Int? = null
    private val scanManager: Any? by lazy {
        runCatching { Class.forName("android.device.ScanManager").getDeclaredConstructor().newInstance() }
            .onFailure { Log.i(TAG, "ScanManager da Urovo não encontrado; usando só o modo teclado") }
            .getOrNull()
    }

    private val receptor = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            val texto = i.getStringExtra(EXTRA_TEXTO)
                ?: bytesParaTexto(i.getByteArrayExtra(EXTRA_BYTES), i.getIntExtra(EXTRA_TAMANHO, -1))
                ?: bytesParaTexto(i.getByteArrayExtra(EXTRA_BYTES_ANTIGO), i.getIntExtra(EXTRA_TAMANHO, -1))
            texto?.trim()?.takeIf { it.isNotEmpty() }?.let(aoLer)
        }
    }

    fun ligar() {
        if (ligado) return
        val filtro = IntentFilter().apply {
            addAction(ACAO_LEITURA)
            addAction(ACAO_LEITURA_ANTIGA)
        }
        // O broadcast vem do serviço do scanner (outro app do sistema), por isso precisa ser exportado
        ctx.registerReceiver(receptor, filtro, Context.RECEIVER_EXPORTED)
        ligado = true

        scanManager?.let { sm ->
            runCatching {
                sm.chamar("openScanner")
                if (modoAnterior == null) modoAnterior = sm.chamar("getOutputMode") as? Int
                sm.chamar("switchOutputMode", MODO_INTENT)
            }.onFailure { Log.w(TAG, "Não foi possível pôr o scanner em modo Intent", it) }
        }
    }

    fun desligar() {
        if (!ligado) return
        runCatching { ctx.unregisterReceiver(receptor) }
        ligado = false
        // Devolve o modo que o aparelho usava (o WMS costuma ler como teclado)
        val anterior = modoAnterior ?: return
        scanManager?.let { sm ->
            runCatching { sm.chamar("switchOutputMode", anterior) }
                .onFailure { Log.w(TAG, "Não foi possível devolver o modo do scanner", it) }
        }
        modoAnterior = null
    }

    private fun bytesParaTexto(bytes: ByteArray?, tamanho: Int): String? {
        if (bytes == null) return null
        val n = if (tamanho in 0..bytes.size) tamanho else bytes.size
        return String(bytes, 0, n, Charsets.UTF_8)
    }

    /** Chama um método do ScanManager por nome; argumentos Int viram o tipo primitivo int. */
    private fun Any.chamar(metodo: String, vararg args: Int): Any? {
        val tipos = Array<Class<*>>(args.size) { Int::class.javaPrimitiveType!! }
        return javaClass.getMethod(metodo, *tipos).invoke(this, *args.toTypedArray())
    }

    private companion object {
        const val TAG = "Scanner"
        const val ACAO_LEITURA = "android.intent.ACTION_DECODE_DATA"
        const val ACAO_LEITURA_ANTIGA = "urovo.rcv.message"
        const val EXTRA_TEXTO = "barcode_string"
        const val EXTRA_BYTES = "barcode"
        const val EXTRA_BYTES_ANTIGO = "barocode"
        const val EXTRA_TAMANHO = "length"
        const val MODO_INTENT = 0   // ScanManager: 0 = saída por Intent, 1 = saída como teclado
    }
}
