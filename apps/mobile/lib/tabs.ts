// The tabs under the keyboard. 027.
//
// The tab bar fades from 1 to 0 over the keyboard's first 60pt of rise, driven
// by the keyboard's own animated height, and back on the way down. A raised
// sheet already fades it; the bar takes whichever fade is further along, so
// the two never fight. A worklet, read on the UI thread every frame.

/** How far the keyboard rises before the tabs are gone. */
export const TAB_FADE_PT = 60;

/** `sheet` is the raised sheet's progress, 0 to 1. `keyboard` is the
 *  keyboard's animated height, which is negative while it is up. */
export function tabOpacity(sheet: number, keyboard: number): number {
  "worklet";
  const rise = Math.min(1, Math.max(0, -keyboard / TAB_FADE_PT));
  return Math.min(1 - sheet, 1 - rise);
}
