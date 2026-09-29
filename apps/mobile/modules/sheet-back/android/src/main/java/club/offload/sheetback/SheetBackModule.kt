// Predictive back for the phones' sheets (30 September 2026).
//
// React Native hands JS a back press and nothing before it, so a sheet cannot
// follow a back swipe from BackHandler. This registers one OnBackPressedCallback
// on the activity while a sheet is open and forwards the swipe's progress,
// its cancel and its commit. JS decides which sheet it belongs to.
//
// Re-added each time it is enabled, so it is always the most recent callback
// on the dispatcher, which is the one Android asks first. Disabled, it lets
// React Native's own callback take back as before.

package club.offload.sheetback

import androidx.activity.BackEventCompat
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SheetBackModule : Module() {
  private val callback = object : OnBackPressedCallback(false) {
    override fun handleOnBackStarted(backEvent: BackEventCompat) {
      sendEvent("onBackStarted", mapOf("progress" to backEvent.progress))
    }

    override fun handleOnBackProgressed(backEvent: BackEventCompat) {
      sendEvent("onBackProgressed", mapOf("progress" to backEvent.progress))
    }

    override fun handleOnBackCancelled() {
      sendEvent("onBackCancelled", emptyMap<String, Any>())
    }

    override fun handleOnBackPressed() {
      sendEvent("onBackInvoked", emptyMap<String, Any>())
    }
  }

  override fun definition() = ModuleDefinition {
    Name("SheetBack")

    Events("onBackStarted", "onBackProgressed", "onBackCancelled", "onBackInvoked")

    Function("setEnabled") { enabled: Boolean ->
      val activity = appContext.currentActivity as? ComponentActivity ?: return@Function
      activity.runOnUiThread {
        callback.remove()
        callback.isEnabled = enabled
        if (enabled) activity.onBackPressedDispatcher.addCallback(callback)
      }
    }

    OnDestroy {
      appContext.currentActivity?.runOnUiThread { callback.remove() }
    }
  }
}
