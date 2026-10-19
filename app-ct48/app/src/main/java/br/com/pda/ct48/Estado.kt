package br.com.pda.ct48

import java.util.concurrent.CopyOnWriteArraySet

data class EstadoAparelho(
    val liberado: Boolean,
    val nome: String?,
    val pessoa: String?,
    val ident: String?,
    val desde: Long,
    val apps: List<String>,
    /** Marcado pelo ADM como em manutenção, quebrado ou perdido: não pode ser liberado. */
    val manutencao: String? = null
) {
    companion object {
        val BLOQUEADO = EstadoAparelho(false, null, null, null, 0, emptyList())
    }
}

/**
 * Último estado recebido do servidor, compartilhado entre o serviço e a tela.
 * Começa bloqueado: depois de reiniciar, o aparelho só libera quando o servidor confirmar.
 */
object Estado {
    @Volatile var atual: EstadoAparelho = EstadoAparelho.BLOQUEADO
        private set
    @Volatile var online: Boolean = false
        private set

    private val ouvintes = CopyOnWriteArraySet<Runnable>()

    fun ouvir(r: Runnable) { ouvintes.add(r) }
    fun parar(r: Runnable) { ouvintes.remove(r) }

    /** novo = null mantém o estado anterior (ex.: sem sinal no meio do galpão). */
    fun atualizar(novo: EstadoAparelho?, online: Boolean) {
        if (novo != null) atual = novo
        this.online = online
        ouvintes.forEach { it.run() }
    }
}
