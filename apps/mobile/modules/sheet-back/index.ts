// The JS face of the Android predictive back module. Null on iOS, and on an
// Android build made before the module existed, where `lib/sheet-back.ts`
// falls back to BackHandler.

import { requireOptionalNativeModule } from "expo";

type BackEvent = "onBackStarted" | "onBackProgressed" | "onBackCancelled" | "onBackInvoked";

export interface SheetBackModule {
  setEnabled(enabled: boolean): void;
  addListener(event: BackEvent, listener: (event: { progress?: number }) => void): { remove: () => void };
}

export default requireOptionalNativeModule<SheetBackModule>("SheetBack");
