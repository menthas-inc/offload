// The composer's box, and when it is open for height. 2026-09-26, on the
// phones; the web since 2026-10-07, where the same oscillation was reported.
//
// The box is a pill while the words fit on one line beside the controls and
// a column once they are taller. Measured height alone oscillated on the
// Pixel: a wrap beside the controls opened the box to full width, where the
// same words fit on one line, which closed it, which wrapped them again. So
// the height opens the box and only an empty draft closes it.

export function staysOpen(state: { open: boolean; tallNow: boolean; draft: string }): boolean {
  if (state.draft.trim().length === 0) return false;
  return state.open || state.tallNow;
}

