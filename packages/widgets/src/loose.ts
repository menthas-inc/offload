// 028. Not in a thread: the words both clients draw from the same rules.
//
// The web and the phones each had a copy of these, one with the suggestion's
// name taking its arguments the other way round. One copy, so a reword
// reaches both. The entry shapes stay with each client, because the rows in
// them do; these only read the parts they need. "Loose" is the code's word
// only; nothing a person reads says it.

export type ChipKey = "todo" | "link" | "photo" | "note" | "event" | "place" | "voice" | "file";

export interface Face {
  accountId: string;
  initials: string;
  displayName: string;
}

/** 037. A thread as a chip and a toast name it. */
export interface ThreadRef {
  id: string;
  name: string;
  icon: string;
  hue: number;
}

/** One button under a row. The thread's or the proposal's name is the
 *  server's current reading, so a rename since draws the new name. */
export type Suggestion =
  | {
      id: string;
      kind: "move";
      thread: ThreadRef;
      /** At most two of the thread's other members, empty when it is not
       *  shared. */
      faces: Face[];
      /** How many more beyond the faces. */
      more: number;
    }
  | { id: string; kind: "create"; proposal: { id: string; name: string; count: number } };

const CHIP_OF_TYPE: Record<string, ChipKey> = {
  task: "todo",
  link: "link",
  image: "photo",
  screenshot: "photo",
  event: "event",
  location: "place",
  voice: "voice",
  file: "file",
};

/** The part of either client's entry that decides its chip. Each client's
 *  own entry type fits it, so neither has to share its row shape. */
export type ChipEntry = { kind: "note" } | { kind: "content"; row: { type: string } };

/** Which chip an entry is under. A type this table does not know is under
 *  none, rather than counted as a file it is not. */
export function chipOf(entry: ChipEntry): ChipKey | null {
  return entry.kind === "note" ? "note" : (CHIP_OF_TYPE[entry.row.type] ?? null);
}

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** *These three look like they belong together.* A proposal holds two to
 *  ten. */
export function countInWords(n: number): string {
  return WORDS[n] ?? String(n);
}

/** The suggestion button's accessible name: the action, never the label. */
export function suggestionName(title: string, suggestion: Suggestion): string {
  return suggestion.kind === "move"
    ? `Move ${title} to ${suggestion.thread.name}`
    : `Create ${suggestion.proposal.name} and move ${suggestion.proposal.count} into it`;
}

/** Who will see it, for a move into a shared thread: the faces are hidden
 *  from assistive tech, which hears this instead. */
export function sharedHint(suggestion: Extract<Suggestion, { kind: "move" }>): string | undefined {
  const names = suggestion.faces.slice(0, 2).map((face) => face.displayName);
  if (names.length === 0) return undefined;
  return suggestion.more > 0 ? `Shared with ${names.join(", ")} and ${suggestion.more} more` : `Shared with ${names.join(" and ")}`;
}
