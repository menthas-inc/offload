// The conversation sheet's state, apart from its animation (30 September 2026).
//
// Two things hold the sheet up: a pin, and a live conversation that is open.
// Kept pure so the transitions are tested; the provider holds the values.

export interface SheetState {
  /** A `+` is pinned to the composer. */
  pinned: boolean;
  /** There is a conversation to show. */
  live: boolean;
  /** It was raised and not yet put away. */
  open: boolean;
}

export function raisedOf(state: SheetState): boolean {
  return state.pinned || (state.live && state.open);
}

/** The sheet reached its closed edge under a finger or back: both reasons it
 *  was up end together, and the conversation itself is kept. */
export function settled(state: SheetState): SheetState {
  return { ...state, pinned: false, open: false };
}
