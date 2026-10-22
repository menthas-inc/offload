import { createRef } from "react";
import type { View } from "react-native";

// What the plate's Android blur samples (046): the screens, wrapped once in a
// `BlurTargetView` in the root layout. A view cannot blur its own parent, and
// the plate is the screens' sibling, so the ref crosses between them here.
// iOS needs none: its system blur samples whatever is behind it.
export const glassTarget = createRef<View>();
