// Writes the screen has already drawn.
//
// Every write in a thread used to go "send, wait, reload, then move the row",
// which is two round trips before a checkbox ticks. Now the screen draws the
// change, sends the write, and the request's one remaining job is to disagree:
// when it does, the screen is put back and a toast says so, with the same
// action offered again beside it.
//
// **Undo is offered the moment the change is drawn**, not when the server
// confirms it. The eight seconds are the person's. If the write then fails, the
// Undo toast is replaced by the failure, and if Undo is pressed before the
// write has landed, the undo waits for it: two writes to one row in flight at
// once would race on the server and the second could land first.
//
// `useWrites`, the count of what is in flight, is a React hook and stays in
// each client.

export interface ToastAction {
  label: string;
  onPress: () => void | Promise<void>;
}

/** Where an Undo is drawn (2026-10-18): `slot` in the place a thing left,
 *  `under` a thing that stayed and changed, `plate` above the composer when
 *  nothing on screen did. Keyed by the thing's id. */
export type UndoForm = "slot" | "under" | "plate";

export interface Place {
  id: string;
  /** The action's own glyph: archive, trash-2, bell, check and so on. */
  icon: string;
  form: UndoForm;
}

/** What a screen's toast offers, and all this file needs of it. A word with a
 *  place is drawn in place; one without is the toast. */
export interface Toaster {
  show: (message: string, action?: ToastAction, place?: Place) => void;
}

export interface Writes {
  /** Count a write in flight, and reload once none is. */
  track: (write: Promise<boolean>) => Promise<boolean>;
  /** Whether nothing is in flight, checked before a reload is applied. */
  idle: () => boolean;
}

/** One change, drawn first and written second.
 *
 *  `apply` and `revert` draw it and undraw it; `write` and `unwrite` do it and
 *  take it back on the server. The words are the toasts: `did` once it is
 *  drawn, offering Undo when `unwrite` exists; `failed` when the write is
 *  refused, offering Retry; `unfailed` when the undo is. */
export interface Reversible {
  apply: () => void;
  revert: () => void;
  write: () => Promise<boolean>;
  unwrite?: () => Promise<boolean>;
  did?: string;
  failed: string;
  unfailed?: string;
  /** The word on the failure's action, Retry unless the op says otherwise.
   *  Null offers none: a refusal that trying again cannot change. */
  retry?: string | null;
  /** Where its Undo and its failure are drawn. Without one, the toast. */
  place?: Place;
}

/** Draw it, write it, and put it back with a word if the server refuses. */
export async function perform(op: Reversible, toast: Toaster, writes: Writes): Promise<boolean> {
  op.apply();
  const written = writes.track(op.write());
  if (op.did) {
    toast.show(
      op.did,
      op.unwrite
        ? {
            label: "Undo",
            onPress: async () => {
              if (await written) await reverse(op, toast, writes);
            },
          }
        : undefined,
      // A confirmation with no Undo stays a toast: there is nothing to draw in place.
      op.unwrite ? op.place : undefined,
    );
  }
  if (await written) return true;
  op.revert();
  // Read after the write, which may have settled on a truer word.
  if (op.retry === null) toast.show(op.failed, undefined, op.place);
  else toast.show(op.failed, { label: op.retry ?? "Retry", onPress: () => void perform(op, toast, writes) }, op.place);
  return false;
}

/** Undraw it and take it back, and redraw it with a word if that is refused. */
export async function reverse(op: Reversible, toast: Toaster, writes: Writes): Promise<boolean> {
  if (!op.unwrite) return false;
  op.revert();
  if (await writes.track(op.unwrite())) return true;
  op.apply();
  toast.show(op.unfailed ?? op.failed, {
    label: op.retry ?? "Retry",
    onPress: () => void reverse(op, toast, writes),
  }, op.place);
  return false;
}
