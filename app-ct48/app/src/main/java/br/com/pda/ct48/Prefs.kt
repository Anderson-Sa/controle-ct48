package br.com.pda.ct48

import android.content.Context

/** Dados de registro do aparelho no servidor. */
class Prefs(ctx: Context) {
    private val p = ctx.getSharedPreferences("ct48", Context.MODE_PRIVATE)

    var servidor: String?
        get() = p.getString("servidor", null)
        set(v) = p.edit().putString("servidor", v).apply()

    var token: String?
        get() = p.getString("token", null)
        set(v) = p.edit().putString("token", v).apply()

    var nome: String?
        get() = p.getString("nome", null)
        set(v) = p.edit().putString("nome", v).apply()

    val registrado: Boolean
        get() = !servidor.isNullOrBlank() && !token.isNullOrBlank()
}
