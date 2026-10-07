// 041. A PDF in the app's own cache, handed to whichever app on the phone
// opens PDFs, through a content uri the viewer may read and nothing else.
// The grant is taken back, and the copy deleted, when offload comes forward
// again; `lib/pdf-open.ts` does both.

package club.offload.pdfopen

import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class PdfOpenModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PdfOpen")

    AsyncFunction("open") { uri: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("no context")
      val file = File(Uri.parse(uri).path ?: throw IllegalArgumentException("not a file"))
      val content = FileProvider.getUriForFile(context, "${context.packageName}.pdfopen", file)
      val intent = Intent(Intent.ACTION_VIEW)
        .setDataAndType(content, "application/pdf")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      if (intent.resolveActivity(context.packageManager) == null) return@AsyncFunction "no_viewer"
      val activity = appContext.currentActivity
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
      "opened"
    }

    Function("revoke") { uri: String ->
      val context = appContext.reactContext ?: return@Function
      val path = Uri.parse(uri).path ?: return@Function
      val content = FileProvider.getUriForFile(context, "${context.packageName}.pdfopen", File(path))
      context.revokeUriPermission(content, Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
  }
}
