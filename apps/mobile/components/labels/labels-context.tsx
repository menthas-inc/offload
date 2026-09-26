// 025. What a row needs to draw its marks and its tag tool, from the screen
// that holds the thread. A context rather than props, because a row is drawn
// by the thread's list, by every widget and by the rail's day, and all three
// would otherwise carry the same three props down. Absent on Today, which
// draws a row's marks beside the thread's name itself.

import { createContext, useContext } from "react";
import type { ContentRow } from "../../lib/threads";
import type { Label } from "../../lib/labels";

export interface RowLabels {
  labels: Map<string, Label>;
  onLabel: (row: ContentRow) => void;
  onOpenLabel: (labelId: string) => void;
}

export const RowLabelsContext = createContext<RowLabels | null>(null);

export const useRowLabels = (): RowLabels | null => useContext(RowLabelsContext);
