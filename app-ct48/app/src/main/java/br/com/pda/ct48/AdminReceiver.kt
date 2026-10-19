package br.com.pda.ct48

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent

/** Receptor de administrador do aparelho. O app precisa ser o Device Owner para travar o CT48. */
class AdminReceiver : DeviceAdminReceiver() {
    override fun onEnabled(context: Context, intent: Intent) {
        Kiosk.configurar(context)
    }
}
