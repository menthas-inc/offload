// 049. The row or note Search opened a thread at.
//
// The thread draws everything in one ScrollView and its rows sit inside
// widgets, layout sections and the notes, so there is no index to scroll to.
// The screen provides the id; the one row or note that matches it reports its
// view once laid out, and the screen measures it against the scroll view. A
// fold holding it reads the id too and stays open.

import { createContext, useContext, useRef } from "react";
import type { View } from "react-native";

export const Reveal = createContext<{ id: string | null; found: (view: View) => void }>({ id: null, found: () => undefined });

export function useRevealId(): string | null {
  return useContext(Reveal).id;
}

/** A ref and onLayout for the element that draws `id`, when it is the one. */
export function useRevealed(id: string): { ref?: (view: View | null) => void; onLayout?: () => void } {
  const reveal = useContext(Reveal);
  const view = useRef<View | null>(null);
  if (reveal.id !== id) return {};
  return {
    ref: (one) => {
      view.current = one;
    },
    onLayout: () => {
      if (view.current) reveal.found(view.current);
    },
  };
}
