"use client";

// What a thread holds about itself.
//
// **Rows, from the `MemoryRow` contract**, extended by 014 for what a note now
// carries: a date, a body, and whether it is still reaching offload. They were
// chips until 5 September 2026, and the chip was wrong for the reason the
// contract states: a note is a sentence up to 200 characters, and a chip is
// built for a tag.
//
// The open row holds its own editor **in place of its text line**, not under a
// copy of it: the thing you clicked is visibly the thing you are editing, and
// the note is never on screen twice.
//
// **Nothing here refuses a note.** 008 drew a cap line at ten and hid the add
// control beneath it. A hundred is a prompt budget rather than a wall, so what
// replaces the cap line is the opposite kind of sentence: not "you may not add
// another" but "these ones are not reaching offload", next to the rows that
// resolve it.

import { useClock } from "../../lib/clock";
import { useState } from "react";
import { Icon } from "../Icon";
import styles from "../../app/(shell)/shell.module.css";
import { ReorderHandle, type RowReorder } from "./RowTools";
import { useToast } from "../shell/Toast";
import { MoveOver } from "../shell/MoveSheet";
import { moveNote } from "../../lib/loose";
import { perform, type Writes } from "../../lib/optimistic";
import { reorderPlan, type ReorderWrite } from "../../lib/widgets";
import {
  NOTE_BUDGET,
  NOTE_CHARS,
  addNote,
  deleteNote,
  editNote,
  foldedNotes,
  isProvisional,
  muteNote,
  provisionalNote,
  restoreNote,
  setNotePriority,
  type Member,
  type Note,
} from "../../lib/threads";

interface Props {
  threadId: string;
  notes: Note[];
  /** Active and folded. The second draws the history control and nothing else. */
  counts: { active: number; folded: number };
  members: Member[];
  /** Notes that arrived while this screen was open, marked for a moment. */
  arrived?: Set<string>;
  /** Whether the new-note editor is open. Owned by the thread rather than by
   *  this section, because the pane head's More menu opens it too, and because
   *  a thread with no notes draws nothing here: without a way in from outside,
   *  the first note on a thread could only come from telling offload. */
  adding: boolean;
  onAdding: (adding: boolean) => void;
  /** The notes are the thread's. Every change here is drawn through this
   *  before it is sent, and the thread's own reload settles it. */
  onNotes: (update: (notes: Note[]) => Note[]) => void;
  /** The thread's count of writes in flight, shared so a note's write holds
   *  the thread's reload back the same as a row's does. */
  writes: Writes;
}

/** The date on a row, derived rather than stored, so a weekday can never
 *  disagree with the calendar. */
function when(note: Note, zone: string | null): string | null {
  const at = note.occursAt ?? note.dueAt;
  if (!at) return null;
  // 023. A bare day is a date and reads as one everywhere; a timed note lands
  // on its day in the account's clock.
  return new Date(at).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(note.allDay ? { timeZone: "UTC" } : zone ? { timeZone: zone } : {}),
  });
}

export function Notes({
  threadId,
  notes,
  counts,
  members,
  arrived,
  adding,
  onAdding,
  onNotes,
  writes,
}: Props) {
  const { zone } = useClock();
  const toast = useToast();
  // Who is reading, from the member list the bundle already carries. Decides
  // which rows offer delete, because deleting is the author's alone and
  // everybody else gets mute.
  const viewerId = members.find((member) => member.isYou)?.accountId ?? null;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [folded, setFolded] = useState<Note[] | null>(null);
  // Which row is being dragged, and which one the pointer is over. The active
  // list only: folded history is read, not arranged.
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // 028. The note whose Move sheet is open.
  const [moving, setMoving] = useState<Note | null>(null);

  const shared = members.length > 1;
  const editing = notes.find((note) => note.id === editingId) ?? null;

  // **Which notes are not reaching offload.** The budget takes the most
  // recently written, so anything outside that set is on the thread and out of
  // the prompt. Computed here rather than sent, because it is the same rule the
  // server applies at assembly and duplicating the rule is cheaper than a field
  // that can be stale by the time it is drawn.
  const instructing = new Set(
    [...notes]
      .sort((a, b) => b.writtenAt.localeCompare(a.writtenAt))
      .slice(0, NOTE_BUDGET)
      .map((note) => note.id)
  );
  const quiet = notes.length - instructing.size;

  // A note whose author has deleted their account carries no name, and that
  // reads as somebody who left rather than as yours, because every live
  // member's note does carry one.
  function author(note: Note): string | null {
    if (!shared || note.authorId === null) return null;
    return members.find((m) => m.accountId === note.authorId)?.displayName ?? null;
  }

  /** `open_` rather than `open`, because `open` is a global on Window and
   *  shadowing it inside a component that also has a boolean called `open` is
   *  how a click handler ends up calling the wrong thing. */
  function open_(note: Note): void {
    onAdding(false);
    setEditingId(note.id);
    setDraft(note.text);
  }

  function close(): void {
    onAdding(false);
    setEditingId(null);
    setDraft("");
  }

  /** Deleting is the author's, per OFF-3, with one exception: **a note nobody
   *  owns is everybody's.** Its author deleted their account or left the
   *  thread, so the rule that protects a contribution has nobody left to
   *  protect, and what it produces instead is a sentence still steering the
   *  model that no remaining member can remove. `authorIsMember` is computed
   *  server-side and the endpoint enforces the same predicate, so this cannot
   *  draw a control the server will refuse. */
  function canDelete(note: Note): boolean {
    return note.authorId === viewerId || !note.authorIsMember;
  }

  // ---------------------------------------------------------------- writes
  //
  // Drawn first, sent second, through the thread's `perform`: the row changes
  // at the press and comes back with a word if the server refuses.

  const patch = (noteId: string, fields: Partial<Note>): void =>
    onNotes((current) => current.map((note) => (note.id === noteId ? { ...note, ...fields } : note)));

  function save(): void {
    const text = draft.trim();
    if (text.length === 0) return close();

    if (adding) {
      // The note is drawn at the press with a made-up id, and the server's
      // note replaces it whole when the write lands: it carries the fields
      // the screen could only guess at.
      const note = provisionalNote(text, viewerId);
      close();
      void perform(
        {
          apply: () => onNotes((current) => [...current, note]),
          revert: () => onNotes((current) => current.filter((one) => one.id !== note.id)),
          write: async () => {
            const result = await addNote(threadId, text);
            if (!result) return false;
            onNotes((current) => current.map((one) => (one.id === note.id ? result.note : one)));
            return true;
          },
          failed: "Couldn't add that",
        },
        toast,
        writes,
      );
      return;
    }

    if (!editing) return close();
    const previous = editing.text;
    close();
    // Reversible by writing the previous value back, which is what puts an
    // edit on the OFF-6 allowlist rather than under a confirmation.
    void perform(
      {
        // The text alone: a note's details are no longer drawn or edited
        // (2026-09-29), and what is stored there is left as it is.
        apply: () => patch(editing.id, { text }),
        revert: () => patch(editing.id, { text: previous }),
        write: () => editNote(editing.id, text).then((result) => result !== null),
        unwrite: () => editNote(editing.id, previous).then((result) => result !== null),
        did: "Note changed",
        failed: "Couldn't change the note",
        unfailed: "Couldn't put the note back",
      },
      toast,
      writes,
    );
  }

  function remove(note: Note): void {
    close();
    const at = notes.findIndex((one) => one.id === note.id);
    void perform(
      {
        apply: () => onNotes((current) => current.filter((one) => one.id !== note.id)),
        revert: () =>
          onNotes((current) =>
            current.some((one) => one.id === note.id)
              ? current
              : [...current.slice(0, at), note, ...current.slice(at)],
          ),
        write: () => deleteNote(note.id),
        unwrite: () => restoreNote(note.id),
        // Never the note's text: a toast is a few words and this runs to 200
        // characters.
        did: "Note deleted",
        failed: "Couldn't delete the note",
        unfailed: "Couldn't put the note back",
      },
      toast,
      writes,
    );
  }

  /** No Undo: the same control, pressed again, is the undo. */
  function mute(note: Note): void {
    close();
    void perform(
      {
        apply: () => patch(note.id, { muted: !note.muted }),
        revert: () => patch(note.id, { muted: note.muted }),
        write: () => muteNote(note.id, !note.muted),
        failed: note.muted ? "Couldn't unmute the note" : "Couldn't mute the note",
      },
      toast,
      writes,
    );
  }

  /** 028. To another thread, by its author, as a row moves. It leaves this
   *  list at the press; Undo is the same move back. A thread that already
   *  holds the same words refuses it, and says so. */
  function move(note: Note, to: { id: string; name: string }): void {
    setMoving(null);
    close();
    const at = notes.findIndex((one) => one.id === note.id);
    let duplicate = false;
    void perform(
      {
        apply: () => onNotes((current) => current.filter((one) => one.id !== note.id)),
        revert: () =>
          onNotes((current) =>
            current.some((one) => one.id === note.id) ? current : [...current.slice(0, at), note, ...current.slice(at)],
          ),
        write: async () => {
          const result = await moveNote(note.id, to.id);
          duplicate = !result.ok && result.duplicate;
          return result.ok;
        },
        unwrite: async () => (await moveNote(note.id, threadId)).ok,
        did: `Moved to ${to.name}`,
        // Read once the write is refused, so it can name the duplicate.
        get failed() {
          return duplicate ? `That's already in ${to.name}` : "Couldn't move that";
        },
        unfailed: "Couldn't put that back",
      },
      toast,
      writes,
    );
  }

  async function showFolded(): Promise<void> {
    if (folded) return setFolded(null);
    const result = await foldedNotes(threadId);
    setFolded(result?.notes ?? []);
  }

  /** A note was dragged somewhere else in the section.
   *
   *  The same arithmetic To do uses, on the same scale, through the note's
   *  own endpoint. It moves the row and nothing else: not when the note was
   *  written, which is what precedence turns on, so a note dragged to the top
   *  is not thereby the newest thing said. */
  function reorder(writes_: ReorderWrite[]): void {
    close();
    const set = (pick: (write: ReorderWrite) => number): void =>
      onNotes((current) =>
        current.map((note) => {
          const write = writes_.find((one) => one.id === note.id);
          return write ? { ...note, priority: pick(write) } : note;
        }),
      );
    const all = async (pick: (write: ReorderWrite) => number): Promise<boolean> => {
      const results = await Promise.all(writes_.map((one) => setNotePriority(one.id, pick(one))));
      return results.every((result) => result !== null);
    };
    void perform(
      {
        apply: () => set((write) => write.priority),
        revert: () => set((write) => write.previous),
        write: () => all((write) => write.priority),
        unwrite: () => all((write) => write.previous),
        did: "Moved",
        failed: "Couldn't move that",
        unfailed: "Couldn't put that back",
      },
      toast,
      writes,
    );
  }

  function moveTo(fromId: string, toIndex: number): void {
    // Only what the server has can be arranged: a note drawn at the press
    // has no priority to write yet and is left out of the plan.
    const settled = notes.filter((note) => !isProvisional(note.id));
    const from = settled.findIndex((note) => note.id === fromId);
    if (from < 0 || toIndex < 0 || toIndex >= settled.length) return;
    const { writes: plan } = reorderPlan(settled, from, toIndex);
    if (plan.length > 0) reorder(plan);
  }

  const reorderFor = (note: Note, index: number): RowReorder => {
    const fromIndex = dragging ? notes.findIndex((one) => one.id === dragging) : -1;
    return {
      over:
        dragging && dragging !== note.id && over === note.id
          ? fromIndex < index
            ? "below"
            : "above"
          : null,
      dragging: dragging === note.id,
      onDragStart: () => setDragging(note.id),
      onDragEnd: () => {
        setDragging(null);
        setOver(null);
      },
      onDragOver: () => setOver(note.id),
      onDrop: () => {
        if (dragging) moveTo(dragging, index);
        setDragging(null);
        setOver(null);
      },
      onStep: (delta) => moveTo(note.id, index + delta),
    };
  };

  // Nothing to show and nothing being written: draw nothing at all. A heading
  // over an empty row is a section announcing its own absence, which is the
  // same thing the standing summary already refuses to do.
  //
  // **So a thread with no notes has no way to type the first one**, and that is
  // the accepted cost of the two rules the product owner set: empty sections
  // are hidden, and there is no add control anywhere else, because a bare plus
  // on the pane said nothing about what it added. The first note on a thread
  // comes from dumping something, which is the product's usual way in. Every
  // one after that can be typed here.
  if (notes.length === 0 && !adding && counts.folded === 0) return null;

  const editor = (note: Note | null) => (
    <NoteEditor
      draft={draft}
      onDraft={setDraft}
      onSave={save}
      onCancel={close}
      way={note ? (note.muted ? "unmute" : canDelete(note) ? "delete" : "mute") : null}
      onDelete={() => note && remove(note)}
      onMute={() => note && mute(note)}
      // 028. A note moves between threads as a row does: its author's, or
      // anybody's once its author has gone, the same rule as delete.
      onMove={note && canDelete(note) && !isProvisional(note.id) ? () => setMoving(note) : undefined}
      // Its words are its author's to change, on the terms delete has.
      readOnly={note !== null && !canDelete(note)}
    />
  );

  // The row is a div holding a button and, on the active list, a handle. It
  // was one button until 2026-09-16, and a handle inside a button is a control
  // inside a control, which no browser will focus and no screen reader will
  // announce. The text keeps the click; the handle keeps the drag.
  const row = (note: Note, index: number, readOnly = false) => {
    const name = author(note);
    const date = when(note, zone);
    const tone = note.muted ? "muted" : note.origin === "learned" ? "accent" : "neutral";
    const quietRow = readOnly || !instructing.has(note.id);
    // A note drawn at the press neither opens nor moves until the server has
    // it: there is nothing yet to open or move.
    const inert = readOnly || isProvisional(note.id);
    const reorder = inert ? null : reorderFor(note, index);

    return (
      <div
        key={note.id}
        className={styles.noteRow}
        data-tone={tone}
        data-quiet={quietRow ? true : undefined}
        data-arrived={arrived?.has(note.id) ? true : undefined}
        data-drag-row={reorder ? true : undefined}
        data-dragging={reorder?.dragging ? true : undefined}
        data-over={reorder?.over ?? undefined}
        onDragOver={
          reorder
            ? (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                reorder.onDragOver();
              }
            : undefined
        }
        onDrop={
          reorder
            ? (event) => {
                event.preventDefault();
                reorder.onDrop();
              }
            : undefined
        }
      >
        {/* The move area, leading the row. Always drawn, no container. */}
        {reorder ? <ReorderHandle title={note.text} reorder={reorder} /> : null}
        <button
          type="button"
          className={styles.noteMain}
          disabled={readOnly}
          onClick={() => (inert ? undefined : open_(note))}
        >
          {note.origin === "learned" ? (
            <>
              <Icon name="sparkles" size={14} className={styles.noteGlyph} />
              {/* The glyph alone is not a state, and the row has no other
                  place to say it. */}
              <span className={styles.hidden}>offload wrote this. </span>
            </>
          ) : null}
          <span className={styles.noteText}>
            {note.text}
            {date ? <span className={styles.noteBy}> {date}</span> : null}
            {name ? <span className={styles.noteBy}> {name}</span> : null}
            {note.muted ? <span className={styles.noteBy}> Muted</span> : null}
            {quietRow && !readOnly ? (
              <span className={styles.noteBy}> Not reaching offload</span>
            ) : null}
          </span>
        </button>
      </div>
    );
  };

  return (
    <>
      <h2 className={styles.section}>
        Notes
        {/* No zero. Writing the first one is the only way to see this section
            with nothing in it, and a count of none beside the editor you are
            typing into is the same noise as an empty heading. */}
        {notes.length > 0 ? <em className={styles.sectionCount}>{notes.length}</em> : null}
        {/* The way in, once the section already draws. A thread with none of
            its own still draws nothing here, per the note above the early
            return: the pane head's More menu is the way in for that case. */}
        {adding ? null : (
          <button
            type="button"
            className={styles.sectionAdd}
            aria-label="Add a note"
            title="Add"
            onClick={() => {
              setEditingId(null);
              setDraft("");
              onAdding(true);
            }}
          >
            <Icon name="plus" size={15} />
          </button>
        )}
      </h2>

      <div className={styles.notes}>
        {notes.map((note, index) => {
          if (editingId === note.id) {
            return (
              <div
                key={note.id}
                className={styles.noteRow}
                data-tone={note.muted ? "muted" : note.origin === "learned" ? "accent" : "neutral"}
                data-open={true}
              >
                {editor(note)}
              </div>
            );
          }
          return row(note, index);
        })}

        {adding ? (
          <div className={styles.noteRow} data-tone="neutral" data-open={true}>
            {editor(null)}
          </div>
        ) : null}
      </div>

      {/* Over the budget, and the sentence sits next to what resolves it: the
          rows above, which delete from their own editor. Never a refusal, and
          never a number somebody has to work out for themselves. */}
      {quiet > 0 ? (
        <p className={styles.noteFull}>
          {quiet} of these are not reaching offload. Delete the ones that have stopped being true.
        </p>
      ) : null}

      {/* What the daily job folded. Counted rather than hidden: offload
          rewriting sentences somebody typed and saying nothing about it is the
          version of this feature nobody would trust. Read, not worked with,
          which is why these rows do not open. */}
      {counts.folded > 0 ? (
        <>
          <button type="button" className={styles.showMore} onClick={() => void showFolded()}>
            {folded ? "Hide" : `Show ${counts.folded} folded`}
          </button>
          {folded ? (
            <div className={styles.notes}>
              {folded.map((note, index) => row(note, index, true))}
            </div>
          ) : null}
        </>
      ) : null}

      {moving ? (
        <MoveOver exceptThreadId={threadId} onClose={() => setMoving(null)} onPick={(thread) => move(moving, thread)} />
      ) : null}
    </>
  );
}

/** The open note: its text, one way out, Cancel and Save, and Move where the
 *  note can move. The thread's Notes section and Not in a thread both draw it,
 *  in place of the row that was clicked. */
export function NoteEditor({
  draft,
  onDraft,
  onSave,
  onCancel,
  way,
  onDelete,
  onMute,
  onMove,
  readOnly = false,
  placeholder = "What is true about this thread?",
}: {
  /** Somebody else's note: words to read, with Mute and no Save. The server
   *  refuses the edit, so the field never offers one. */
  readOnly?: boolean;
  draft: string;
  onDraft: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
  /** Which one way out the note offers, or none for a new note. */
  way: "delete" | "mute" | "unmute" | null;
  onDelete: () => void;
  onMute: () => void;
  onMove?: (() => void) | undefined;
  /** 028. Not in a thread asks its own question: there is no thread for the
   *  note to be true about. */
  placeholder?: string;
}) {
  return (
    <span className={styles.noteOpen}>
      <textarea
        className={styles.noteField}
        value={draft}
        maxLength={NOTE_CHARS}
        rows={2}
        autoFocus
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(event) => onDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
          // Enter saves, shift-Enter is a new line. A note is one sentence.
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (!readOnly) onSave();
          }
        }}
      />

      <span className={styles.noteActions}>
        {readOnly ? (
          <span className={styles.noteCount} />
        ) : (
          <span className={styles.noteCount}>
            {draft.length}/{NOTE_CHARS}
          </span>
        )}

        {/* One control, never two. Delete and mute are the same intent at
            different strengths, and offering both makes somebody choose
            between them for no reason: if you can remove it, mute is a worse
            version of that, and if you cannot, mute is the whole of what you
            have.

            Muted wins over both, whoever is asking. Mute is co-owned and
            reversible by anyone, so a note somebody quieted has to be
            un-quietable by anyone, including its author. Without that a muted
            note of your own would offer only Delete, and the way back from a
            reversible action would be a destructive one. */}
        {way === "unmute" ? (
          <button type="button" className={styles.noteAction} onClick={onMute}>
            Unmute
          </button>
        ) : way === "delete" ? (
          <button type="button" className={styles.noteAction} data-tone="danger" onClick={onDelete}>
            Delete
          </button>
        ) : way === "mute" ? (
          <button type="button" className={styles.noteAction} onClick={onMute}>
            Mute
          </button>
        ) : null}

        {onMove ? (
          <button type="button" className={styles.noteAction} onClick={onMove}>
            Move
          </button>
        ) : null}

        <button type="button" className={styles.noteAction} onClick={onCancel}>
          {readOnly ? "Close" : "Cancel"}
        </button>
        {readOnly ? null : (
          <button type="button" className={styles.noteSave} disabled={draft.trim().length === 0} onClick={onSave}>
            Save
          </button>
        )}
      </span>
    </span>
  );
}
