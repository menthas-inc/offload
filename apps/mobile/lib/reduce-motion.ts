import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

// The one reader of Reduce Motion on the phones (046), mirroring the web's
// single reader (`apps/web/src/lib/reduced-motion.ts`). Read once and again on
// every change, because turning it on mid-session means it now. Every animation
// that can be stilled consumes this rather than keeping its own copy.
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (live) setReduce(on);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduce;
}
