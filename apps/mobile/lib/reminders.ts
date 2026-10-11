// 042. Remind me on one thing, on the phones.
//
// Where the switch draws and when the bell shows are the shared rules in
// `@offload/widgets`. This is what the switch writes: for the author,
// `reminders`, which stops every reminder for that thing for good or puts
// them back; for anybody else, 023's way out of `isReminder` and nothing
// more. A row's write is folded into its sheet's one Save; a note's and a
// memory's go through `PUT /v1/reminders`, since their words are written
// through routes of their own.

import { bellOn, type Reminders } from "@offload/widgets";
import { send } from "./api";
import type { Reversible } from "./optimistic";
import { editNote, type ContentPatch, type ContentSnapshot, type Note } from "./threads";

interface Remindable {
  reminders?: Reminders | undefined;
  isReminder?: boolean | undefined;
}

/** Where the switch starts: as the bell is, for the author; while somebody
 *  asked, for anybody else. */
export function remindOf(row: Remindable, isAuthor: boolean): boolean {
  return isAuthor ? bellOn(row) : row.isReminder === true;
}

/** What Save writes for the switch, or nothing when it did not move. The
 *  author's stop is `reminders: "off"`, which the server also takes as
 *  `isReminder` off; nobody's switch ever writes `isReminder` on. */
export function remindWrite(row: Remindable, isAuthor: boolean, remind: boolean): Pick<ContentPatch, "reminders" | "isReminder"> {
  if (remind === remindOf(row, isAuthor)) return {};
  if (isAuthor) return { reminders: remind ? "on" : "off" };
  return remind ? {} : { isReminder: false };
}

/** What the screen draws ahead of the server for the switch's part of a
 *  patch. */
export function drawnRemind(patch: ContentPatch): { reminders?: Reminders; isReminder?: boolean } {
  const drawn: { reminders?: Reminders; isReminder?: boolean } = {};
  if (patch.reminders !== undefined) drawn.reminders = patch.reminders;
  if (patch.reminders === "off") drawn.isReminder = false;
  if (patch.isReminder !== undefined) drawn.isReminder = patch.isReminder;
  return drawn;
}

/** Undo: the snapshot sent back as it is. A null `reminders` is what anybody
 *  but the author, or a thing with nothing to remind about, was sent, and the
 *  route takes it as leave alone. */
export function undoPatch(previous: ContentSnapshot): ContentPatch {
  return { ...previous };
}

/** A note's or a memory's switch. Author-only on the server, which answers
 *  anybody else with the 404 a missing thing gets. */
export async function putReminders(of: "note" | "memory", id: string, on: boolean): Promise<boolean> {
  const { status } = await send<{ ok: true }>("/v1/reminders", { method: "PUT", body: JSON.stringify({ of, id, on }) });
  return status === 200;
}

type NoteFields = Partial<Pick<Note, "text" | "reminders">>;

/** The note editor's Save: the switch and the words as two writes, drawn
 *  together and put back apart. The switch goes first, so a refused switch
 *  sends no words; when the switch lands and the words do not, only the
 *  words are put back, since the server holds the switch. Undo takes the
 *  words back first, and a refused switch leaves only the switch redrawn. */
export function noteSave(
  note: Pick<Note, "id" | "text" | "reminders">,
  text: string,
  remind: boolean | undefined,
  draw: (fields: NoteFields) => void,
): Reversible {
  const on = remind === true;
  const switched = remind !== undefined && on !== (note.reminders === "on");
  // Only the switch moved: its write alone, with the same Undo.
  const worded = !switched || text !== note.text;
  const now: NoteFields = { ...(worded ? { text } : {}), ...(switched ? { reminders: on ? "on" : "off" } : {}) };
  const was: NoteFields = { ...(worded ? { text: note.text } : {}), ...(switched ? { reminders: note.reminders } : {}) };
  // What the server holds from a write, or an undo, that stopped halfway.
  let landed: NoteFields = {};
  let undone: NoteFields = {};
  return {
    apply: () => {
      draw({ ...now, ...undone });
      undone = {};
    },
    revert: () => {
      draw({ ...was, ...landed });
      landed = {};
    },
    write: async () => {
      landed = {};
      if (switched && !(await putReminders("note", note.id, on))) return false;
      if (worded && (await editNote(note.id, text)) === null) {
        if (switched) landed = { reminders: now.reminders };
        return false;
      }
      return true;
    },
    unwrite: async () => {
      undone = {};
      if (worded && (await editNote(note.id, note.text)) === null) return false;
      if (switched && !(await putReminders("note", note.id, !on))) {
        if (worded) undone = { text: note.text };
        return false;
      }
      return true;
    },
    did: worded ? "Note changed" : "Saved",
    failed: worded ? "Couldn't change the note" : "Couldn't save that",
    unfailed: worded ? "Couldn't put the note back" : "Couldn't put it back",
  };
}
