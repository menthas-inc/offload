// The prism bloom, behind everything before you are in.
//
// The second of the field's two allowed surfaces: inside the bottom plate, and
// here. Radial rather than banded, and **no veil**, because nothing on a gate
// screen is small text over the field: the lockup, the two provider buttons and
// one line of copy all sit well clear of `--text-tertiary`.
//
// **It warps as the screen appears**, which is the only arrival a gate has.
//
// *A divergence, logged.* The design system mounts one bloom in a `GateShell`
// around sign-in, the refusal, the tutorial and connect, so it warps once for
// the whole of first run. Here those are four separate Expo Router routes, and
// the only way to mount one component across them is a shared navigator whose
// screens would then have to be transparent. The thing that rule is protecting
// against is a warp at every step, and it does not happen: first run's tutorial,
// name, consent and connect are internal state inside one screen, so navigating
// between them mounts nothing. What is left is a warp when the gate appears and
// a warp when first run appears, which is what "the screen appearing" means.

import type { ReactNode } from "react";
import { View } from "react-native";
import { PrismField } from "./PrismField";

export function GateBackdrop({ children }: { children: ReactNode }) {
  return (
    <View className="flex-1 overflow-hidden">
      <PrismField variant="bloom" veil="none" arriveOnMount />
      {children}
    </View>
  );
}
