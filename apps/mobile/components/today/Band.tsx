// Today's bands (design 2026-10-11, the kit's `TodayParts.jsx`). The drawn
// sections alternate by position between the page and a full-bleed band in
// the plain fill, whatever order Customize Today keeps; a section that draws
// nothing takes no position. Inside a band, cards step up to raised, and the
// chips and buttons on them step down to the fill, so nothing matches its
// ground. The band tells what it holds through a context, since a card deep
// in a section cannot see which ground it stands on.

import { createContext, useContext, type ReactNode } from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";

const isAndroid = Platform.OS === "android";

const BandContext = createContext(false);

/** Whether the component is drawn inside a band. */
export function useInBand(): boolean {
  return useContext(BandContext);
}

/** The band's own fill: Android's low container, the plain fill elsewhere. */
export const BAND_FILL = isAndroid ? "bg-a-c-low" : "bg-surface-fill";

/** A card's ground: the band's fill on the page, raised inside a band. */
export function groundClass(inBand: boolean): string {
  return inBand ? "bg-surface-raised" : BAND_FILL;
}

/** A chip's or a button's ground on a card: raised on the page, the fill in a band. */
export function onCardClass(inBand: boolean): string {
  return inBand ? BAND_FILL : "bg-surface-raised";
}

/** One drawn section. Odd positions are bands: 20 above the content and 24
 *  below, the gutter at the sides; the first keeps the page's own top. */
export function Band({ index, children }: { index: number; children: ReactNode }) {
  const inBand = index % 2 === 1;
  return (
    <BandContext.Provider value={inBand}>
      <View className={`px-gutter-screen pb-space-8 ${inBand ? BAND_FILL : ""} ${index === 0 ? "pt-space-3" : "pt-space-7"}`}>
        {children}
      </View>
    </BandContext.Provider>
  );
}

/** A card on whichever ground the band gives it. */
export function Ground({ className = "", style, children }: { className?: string; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const inBand = useInBand();
  return (
    <View className={`${groundClass(inBand)} ${className}`} style={style}>
      {children}
    </View>
  );
}
