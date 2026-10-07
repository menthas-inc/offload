// 041. The JS face of the module that hands a PDF to the platform's own
// viewer: Quick Look on iOS, an ACTION_VIEW intent on Android. Null on a build
// made before the module existed, where `lib/pdf-open.ts` says the PDF did not
// open.

import { requireOptionalNativeModule } from "expo";

export interface PdfOpenModule {
  /** Opens the file at `uri`. On iOS it resolves when the viewer closes; on
   *  Android once the viewer has been started, or with `no_viewer` when no
   *  app on the phone opens a PDF. */
  open(uri: string): Promise<"opened" | "no_viewer">;
  /** Android: take back the read grant the viewer was given. */
  revoke?(uri: string): void;
}

export default requireOptionalNativeModule<PdfOpenModule>("PdfOpen");
