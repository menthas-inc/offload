// 041. A PDF in the app's own cache, shown in Quick Look over whatever is on
// screen. The promise resolves when the viewer is dismissed, so the caller
// deletes the copy the moment nobody is looking at it.

import ExpoModulesCore
import QuickLook

public class PdfOpenModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PdfOpen")

    AsyncFunction("open") { (uri: String, promise: Promise) in
      guard let url = URL(string: uri), url.isFileURL else {
        promise.reject("bad_uri", "Not a file in the app's storage.")
        return
      }
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("no_screen", "Nothing on screen to present over.")
        return
      }
      let source = PreviewSource(url: url) { promise.resolve("opened") }
      let controller = QLPreviewController()
      controller.dataSource = source
      controller.delegate = source
      // The controller holds its data source weakly; this keeps it alive for
      // as long as the controller is.
      objc_setAssociatedObject(controller, &PreviewSource.key, source, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
      presenter.present(controller, animated: true)
    }.runOnQueue(.main)
  }
}

private final class PreviewSource: NSObject, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
  static var key: UInt8 = 0
  private let url: URL
  private let done: () -> Void
  private var finished = false

  init(url: URL, done: @escaping () -> Void) {
    self.url = url
    self.done = done
  }

  func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }

  func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
    url as NSURL
  }

  // Read only: no markup, no saving back over the copy.
  func previewController(_ controller: QLPreviewController, editingModeFor previewItem: QLPreviewItem) -> QLPreviewItemEditingMode {
    .disabled
  }

  func previewControllerDidDismiss(_ controller: QLPreviewController) {
    guard !finished else { return }
    finished = true
    done()
  }
}
