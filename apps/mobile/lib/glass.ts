// The plate's tint on Android (046). expo-blur's Android BlurView paints its own
// overlay under ours, so the graded tint's stops are reduced to land on the
// token values combined instead of stacking two tints.

/** The alpha to paint over a layer already `under` opaque, so that the two
 *  together reach `target`. 0 when the layer underneath already reaches it. */
export function stackedAlpha(target: number, under: number): number {
  if (under >= 1) return 0;
  return Math.max(0, 1 - (1 - target) / (1 - under));
}

/** What the Android BlurView already paints under the plate tint. expo-blur 57
 *  (`TintStyle.kt`) maps `systemUltraThinMaterialLight` to near-white at
 *  0.78 × intensity/100 and `systemUltraThinMaterialDark` to grey at
 *  0.55 × intensity/100. Re-check on an expo-blur upgrade. */
export function androidOverlay(dark: boolean, intensity: number): number {
  return (dark ? 0.55 : 0.78) * (intensity / 100);
}
