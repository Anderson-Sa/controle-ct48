package br.com.pda.ct48

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

class ApiErro(mensagem: String, val status: Int = 0) : Exception(mensagem)

/** Cliente HTTP do servidor. Chamar sempre fora da thread principal. */
class Api(private val base: String, private val token: String? = null) {

    fun get(caminho: String) = chamar("GET", caminho, null)

    fun post(caminho: String, corpo: JSONObject) = chamar("POST", caminho, corpo)

    private fun chamar(metodo: String, caminho: String, corpo: JSONObject?): JSONObject {
        val c = try {
            URL(base.trimEnd('/') + caminho).openConnection() as HttpURLConnection
        } catch (e: Exception) {
            throw ApiErro("Endereço do servidor inválido.")
        }
        try {
            c.requestMethod = metodo
            c.connectTimeout = 5000
            c.readTimeout = 8000
            c.setRequestProperty("Accept", "application/json")
            token?.let { c.setRequestProperty("Authorization", "Bearer $it") }
            if (corpo != null) {
                c.doOutput = true
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                c.outputStream.use { it.write(corpo.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = c.responseCode
            val fluxo = if (status < 400) c.inputStream else c.errorStream
            val texto = fluxo?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            val json = runCatching { JSONObject(texto) }.getOrElse { JSONObject() }
            if (status >= 400) throw ApiErro(json.optString("erro", "Erro $status no servidor."), status)
            return json
        } catch (e: IOException) {
            throw ApiErro("Sem conexão com o servidor.")
        } finally {
            c.disconnect()
        }
    }
}
