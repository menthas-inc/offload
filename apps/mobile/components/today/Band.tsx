// Today's sections (de-banded for the prism field, 046, 2026-10-20). The
// alternating full-bleed bands are gone: every section sits flat on the page so
// the field shows between the cards, and every card is raised and opaque so its
// text never lands on the bare field. The old banding is preserved as the
// "inside a band" ground (cards raised, chips and buttons on them stepped to the
// fill), pinned on for every section through the context rather than alternated.
// `groundClass`, `onCardClass`, `useInBand` and `BAND_FILL` are unchanged, so
// the rows shared with other screens (ContentRow, DateChip) are untouched: off
// Today there is still no BandContext and they read the page ground as before.

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

/** One drawn section, flat on the page (046). No band fill; cards are raised
 *  everywhere (`inBand` pinned true). `index` only sets the top: the first
 *  section keeps the page's own top, the rest a space-7 gap. */
export function Band({ index, children }: { index: number; children: ReactNode }) {
  return (
    <BandContext.Provider value={true}>
      <View className={`px-gutter-screen pb-space-8 ${index === 0 ? "pt-space-3" : "pt-space-7"}`}>
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
