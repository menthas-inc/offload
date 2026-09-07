// Two letters standing in for a person.
//
// **One rule, on the server.** It was inside `routes/threads.ts`, used for the
// faces on a shared thread, and 010 needs the same two letters on the settings
// index. Three clients each splitting a name is three chances to disagree about
// "Ana de Sousa", and the disagreement is invisible until two surfaces show a
// different avatar for the same person.
//
// Computed rather than stored, because it is derived from a name that can
// change and a stored copy would be a second thing to keep in step.

/** First and last initial, or the first two letters of a single name.
 *
 *  `?` for an empty name, which is what a person with no display name gets
 *  everywhere: the settings index shows their email beside it, and a thread
 *  member shows "Someone". Neither invents a letter. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts.at(-1)![0]!).toUpperCase();
}
