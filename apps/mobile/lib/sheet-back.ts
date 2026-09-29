// Android back, for whichever sheet is on top (30 September 2026).
//
// A back swipe pulls the top sheet down with the finger, a cancelled one lets
// it spring back, and a committed one closes it. Sheets register in the order
// they open, so the last one open is the one back belongs to, and with none
// open back goes to the screen as it always did.
//
// The swipe's progress comes from `modules/sheet-back`, which only a build
// made since this change carries. Without it a back press still closes the
// top sheet, through BackHandler, with no swipe to follow.

import { useEffect, useRef } from "react";
import { BackHandler, Platform } from "react-native";
import SheetBack from "../modules/sheet-back";

export interface BackHandlers {
  /** The swipe has begun. */
  start: () => void;
  /** 0 to 1 across the swipe. */
  progress: (swipe: number) => void;
  /** Let go short of the commit: spring back. */
  cancel: () => void;
  /** Committed: close. */
  invoke: () => void;
}

const stack: { current: BackHandlers }[] = [];
const top = () => stack[stack.length - 1]?.current;

let wired = false;
function wire(): void {
  if (wired || Platform.OS !== "android") return;
  wired = true;
  if (SheetBack) {
    SheetBack.addListener("onBackStarted", () => top()?.start());
    SheetBack.addListener("onBackProgressed", (event) => top()?.progress(event.progress ?? 0));
    SheetBack.addListener("onBackCancelled", () => top()?.cancel());
    SheetBack.addListener("onBackInvoked", () => top()?.invoke());
    return;
  }
  BackHandler.addEventListener("hardwareBackPress", () => {
    const handlers = top();
    if (!handlers) return false;
    handlers.invoke();
    return true;
  });
}

/** Back closes this sheet while `active`, and follows the swipe on the way. */
export function useSheetBack(active: boolean, handlers: BackHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!active || Platform.OS !== "android") return;
    wire();
    const entry = ref;
    stack.push(entry);
    SheetBack?.setEnabled(true);
    return () => {
      const at = stack.indexOf(entry);
      if (at >= 0) stack.splice(at, 1);
      SheetBack?.setEnabled(stack.length > 0);
    };
  }, [active]);
}
