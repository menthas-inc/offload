// How much of the bottom of every screen the plate covers.
//
// The plate is mounted above the router and painted over whatever screen is
// up, so a screen's scroll content ends underneath it unless the screen leaves
// room. Each page padded its scroll by one spacing token and the plate is a
// composer, a tab row, a folded conversation title when there is one, and the
// safe area: three times that, and the last rows of every thread were
// unreachable. The plate measures itself here and every page ends with
// `PlateSpace`, so the room is whatever the plate actually is.

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";

interface PlateInset {
  inset: number;
  setInset: (height: number) => void;
}

const PlateInsetContext = createContext<PlateInset>({ inset: 0, setInset: () => {} });

export function PlateInsetProvider({ children }: { children: ReactNode }) {
  const [inset, setInset] = useState(0);
  const value = useMemo(() => ({ inset, setInset }), [inset]);
  return <PlateInsetContext.Provider value={value}>{children}</PlateInsetContext.Provider>;
}

export const useSetPlateInset = (): ((height: number) => void) =>
  useContext(PlateInsetContext).setInset;

/** 030. How much the plate covers, for a map's padding. */
export const usePlateInset = (): number => useContext(PlateInsetContext).inset;

/** The last child of a page's scroll: room for the plate. */
export function PlateSpace() {
  const { inset } = useContext(PlateInsetContext);
  return <View style={{ height: inset }} />;
}
