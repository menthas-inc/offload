// A thread's sections fold (the owner, 2026-10-17).
//
// To do, Files and Notes fold from their heading. Files starts folded, since
// photos take the most of the page and are the least read in passing. What a
// section was left as is the device's, for the account, and holds across
// threads: one value, kept by each client in its own store. Decided once here
// so the phones and the web cannot disagree about the defaults.

export type FoldSection = "todo" | "files" | "notes";
export type Folds = Record<FoldSection, boolean>;

export const FOLDED_AT_FIRST: Folds = { todo: false, files: true, notes: false };

/** What was kept, over the defaults. Anything that is not a fold is dropped. */
export function foldsFrom(raw: string | null | undefined): Folds {
  const folds = { ...FOLDED_AT_FIRST };
  if (!raw) return folds;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return folds;
    for (const section of Object.keys(FOLDED_AT_FIRST) as FoldSection[]) {
      const value = (parsed as Record<string, unknown>)[section];
      if (typeof value === "boolean") folds[section] = value;
    }
  } catch {
    // Unreadable: the defaults.
  }
  return folds;
}

/** The value to keep once one section moves. */
export function foldsWith(folds: Folds, section: FoldSection, folded: boolean): string {
  return JSON.stringify({ ...folds, [section]: folded });
}
