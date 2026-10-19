package br.com.pda.ct48

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.UserManager

/**
 * Políticas de Device Owner. O aparelho fica sempre em modo quiosque (lock task):
 * bloqueado, só este app abre; liberado, abrem também os apps da empresa configurados no servidor.
 */
object Kiosk {

    fun admin(ctx: Context) = ComponentName(ctx, AdminReceiver::class.java)

    private fun dpm(ctx: Context) = ctx.getSystemService(DevicePolicyManager::class.java)

    fun ehDono(ctx: Context) = dpm(ctx).isDeviceOwnerApp(ctx.packageName)

    fun configurar(ctx: Context) {
        if (!ehDono(ctx)) return
        val d = dpm(ctx)
        val a = admin(ctx)

        // O próprio Device Owner concede as permissões, sem perguntar ao funcionário
        val permissoes = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.READ_PHONE_STATE
        )
        if (Build.VERSION.SDK_INT >= 33) permissoes += Manifest.permission.POST_NOTIFICATIONS
        permissoes.forEach {
            d.setPermissionGrantState(a, ctx.packageName, it, DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED)
        }
        d.setLocationEnabled(a, true)

        // Em testes (debug) não trava reset de fábrica nem modo seguro, para não perder o aparelho
        if (!BuildConfig.DEBUG) {
            listOf(UserManager.DISALLOW_FACTORY_RESET, UserManager.DISALLOW_SAFE_BOOT, UserManager.DISALLOW_ADD_USER)
                .forEach { d.addUserRestriction(a, it) }
        }

        // Sem barra de notificações nem tela de recentes; Home volta para este app; botão liga/desliga funciona
        d.setLockTaskFeatures(a, DevicePolicyManager.LOCK_TASK_FEATURE_HOME or DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS)

        val home = IntentFilter(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            addCategory(Intent.CATEGORY_DEFAULT)
        }
        d.addPersistentPreferredActivity(a, home, ComponentName(ctx, BloqueioActivity::class.java))

        permitirApps(ctx, Estado.atual.let { if (it.liberado) it.apps else emptyList() })
    }

    /**
     * Define quem pode rodar no modo quiosque. Ao tirar um app da lista,
     * o Android fecha esse app na hora: é assim que o bloqueio remoto tira o funcionário do WMS.
     */
    fun permitirApps(ctx: Context, pacotes: List<String>) {
        if (!ehDono(ctx)) return
        dpm(ctx).setLockTaskPackages(admin(ctx), (listOf(ctx.packageName) + pacotes).distinct().toTypedArray())
    }

    /** Só para testes: tira o app de Device Owner para poder desinstalar. */
    fun removerDono(ctx: Context) {
        if (!ehDono(ctx)) return
        val d = dpm(ctx)
        val a = admin(ctx)
        d.clearPackagePersistentPreferredActivities(a, ctx.packageName)
        d.setLockTaskPackages(a, emptyArray())
        @Suppress("DEPRECATION")
        d.clearDeviceOwnerApp(ctx.packageName)
    }
}
