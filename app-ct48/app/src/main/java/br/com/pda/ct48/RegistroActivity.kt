package br.com.pda.ct48

import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import org.json.JSONObject
import kotlin.concurrent.thread

/** Primeiro uso: liga o aparelho ao servidor com o código gerado no painel do ADM. */
class RegistroActivity : Activity() {

    private val prefs by lazy { Prefs(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_registro)

        val campoServidor = findViewById<EditText>(R.id.r_servidor)
        val campoCodigo = findViewById<EditText>(R.id.r_codigo)
        val botao = findViewById<Button>(R.id.r_botao)
        val msg = findViewById<TextView>(R.id.r_msg)

        prefs.servidor?.let { campoServidor.setText(it) }
        val sn = numeroSerie()
        findViewById<TextView>(R.id.r_sn).text =
            if (sn != null) "SN $sn · ${Build.MODEL}" else "SN indisponível · ${Build.MODEL}"
        if (!Kiosk.ehDono(this)) {
            msg.text = "Atenção: o app ainda não é administrador do aparelho (Device Owner). O bloqueio não vai funcionar."
            msg.setTextColor(getColor(R.color.destaque))
        }

        botao.setOnClickListener {
            val servidor = campoServidor.text.toString().trim().trimEnd('/')
            val codigo = campoCodigo.text.toString().trim().uppercase()
            if (!servidor.startsWith("http://") && !servidor.startsWith("https://")) {
                msg.text = "Digite o endereço completo, começando com http:// ou https://"
                msg.setTextColor(getColor(R.color.erro))
                return@setOnClickListener
            }
            if (codigo.length != 8) {
                msg.text = "O código tem 8 letras e números."
                msg.setTextColor(getColor(R.color.erro))
                return@setOnClickListener
            }
            botao.isEnabled = false
            msg.text = "Registrando…"
            msg.setTextColor(getColor(R.color.texto))
            thread {
                val corpo = JSONObject().put("codigo", codigo).put("modelo", Build.MODEL)
                sn?.let { corpo.put("sn", it) }
                val resultado = runCatching { Api(servidor).post("/api/dispositivo/registrar", corpo) }
                runOnUiThread {
                    botao.isEnabled = true
                    resultado.onSuccess { r ->
                        prefs.servidor = servidor
                        prefs.token = r.getString("token")
                        prefs.nome = r.optString("nome")
                        finish()
                    }.onFailure { e ->
                        msg.text = e.message ?: "Não foi possível registrar."
                        msg.setTextColor(getColor(R.color.erro))
                    }
                }
            }
        }
    }

    @Deprecated("Botão voltar não sai do registro")
    override fun onBackPressed() { /* ignorado de propósito */ }

    /** O Device Owner tem acesso ao número de série; sem isso, o SN fica em branco no painel. */
    private fun numeroSerie(): String? =
        runCatching { Build.getSerial() }.getOrNull()?.takeIf { it.isNotBlank() && it != Build.UNKNOWN }
}
