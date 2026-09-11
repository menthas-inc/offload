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

import { useState } from "react";
import { Icon } from "../Icon";
import styles from "../../app/(shell)/shell.module.css";
import {
  NOTE_BUDGET,
  NOTE_CHARS,
  NOTE_BODY_CHARS,
  addNote,
  deleteNote,
  editNote,
  foldedNotes,
  muteNote,
  restoreNote,
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
  onChanged: () => void;
  onUndo: (message: string, undo: () => Promise<unknown>) => void;
}

/** The date on a row, derived rather than stored, so a weekday can never
 *  disagree with the calendar. */
function when(note: Note): string | null {
  const at = note.occursAt ?? note.dueAt;
  if (!at) return null;
  return new Date(at).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
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
  onChanged,
  onUndo,
}: Props) {
  // Who is reading, from the member list the bundle already carries. Decides
  // which rows offer delete, because deleting is the author's alone and
  // everybody else gets mute.
  const viewerId = members.find((member) => member.isYou)?.accountId ?? null;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState<string | null>(null);
  const [folded, setFolded] = useState<Note[] | null>(null);

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
    setBodyDraft(note.body);
  }

  function close(): void {
    onAdding(false);
    setEditingId(null);
    setDraft("");
    setBodyDraft(null);
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

  async function save(): Promise<void> {
    const text = draft.trim();
    if (text.length === 0) return close();

    if (adding) {
      await addNote(threadId, text);
      close();
      onChanged();
      return;
    }

    if (!editing) return close();
    const previousBody = editing.body;
    const result = await editNote(
      editing.id,
      text,
      bodyDraft === previousBody ? undefined : bodyDraft
    );
    close();
    if (!result) return;
    // Reversible by writing the previous value back, which is what puts an
    // edit on the OFF-6 allowlist rather than under a confirmation.
    const { previous } = result;
    onUndo("Note changed", async () => {
      await editNote(editing.id, previous, previousBody);
      onChanged();
    });
    onChanged();
  }

  async function remove(note: Note): Promise<void> {
    close();
    if (!(await deleteNote(note.id))) return;
    onChanged();
    // Never the note's text: a toast is a few words and this runs to 200
    // characters.
    onUndo("Note deleted", async () => {
      await restoreNote(note.id);
      onChanged();
    });
  }

  async function mute(note: Note): Promise<void> {
    close();
    if (!(await muteNote(note.id, !note.muted))) return;
    onChanged();
  }

  async function showFolded(): Promise<void> {
    if (folded) return setFolded(null);
    const result = await foldedNotes(threadId);
    setFolded(result?.notes ?? []);
  }

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
    <span className={styles.noteOpen}>
      <textarea
        className={styles.noteField}
        value={draft}
        maxLength={NOTE_CHARS}
        rows={2}
        autoFocus
        placeholder="What is true about this thread?"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
          // Enter saves, shift-Enter is a new line. A note is one sentence.
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void save();
          }
        }}
      />

      {/* The rest of what was dumped, when there is any. Only drawn for a note
          that has a body: offering an empty second field on every note would
          make a sentence look like a form. */}
      {bodyDraft !== null ? (
        <textarea
          className={styles.noteField}
          value={bodyDraft}
          maxLength={NOTE_BODY_CHARS}
          rows={5}
          onChange={(event) => setBodyDraft(event.target.value)}
        />
      ) : null}

      <span className={styles.noteActions}>
        <span className={styles.noteCount}>
          {draft.length}/{NOTE_CHARS}
        </span>

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
        {note?.muted ? (
          <button type="button" className={styles.noteAction} onClick={() => void mute(note)}>
            Unmute
          </button>
        ) : note && canDelete(note) ? (
          <button
            type="button"
            className={styles.noteAction}
            data-tone="danger"
            onClick={() => void remove(note)}
          >
            Delete
          </button>
        ) : note ? (
          <button type="button" className={styles.noteAction} onClick={() => void mute(note)}>
            Mute
          </button>
        ) : null}

        <button type="button" className={styles.noteAction} onClick={close}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.noteSave}
          disabled={draft.trim().length === 0}
          onClick={() => void save()}
        >
          Save
        </button>
      </span>
    </span>
  );

  const row = (note: Note, readOnly = false) => {
    const name = author(note);
    const date = when(note);
    const tone = note.muted ? "muted" : note.origin === "learned" ? "accent" : "neutral";
    const quietRow = readOnly || !instructing.has(note.id);

    return (
      <button
        key={note.id}
        type="button"
        className={styles.noteRow}
        data-tone={tone}
        data-quiet={quietRow ? true : undefined}
        data-arrived={arrived?.has(note.id) ? true : undefined}
        onClick={() => (readOnly ? undefined : open_(note))}
      >
        {note.origin === "learned" ? (
          <>
            <Icon name="sparkles" size={14} className={styles.noteGlyph} />
            {/* The glyph alone is not a state, and the row has no other place
                to say it. */}
            <span className={styles.hidden}>offload wrote this. </span>
          </>
        ) : null}
        <span className={styles.noteText}>
          {note.text}
          {date ? <span className={styles.noteBy}> {date}</span> : null}
          {note.body ? <span className={styles.noteBy}> more</span> : null}
          {name ? <span className={styles.noteBy}> {name}</span> : null}
          {note.muted ? <span className={styles.noteBy}> Muted</span> : null}
          {quietRow && !readOnly ? (
            <span className={styles.noteBy}> Not reaching offload</span>
          ) : null}
        </span>
      </button>
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
              setBodyDraft(null);
              onAdding(true);
            }}
          >
            <Icon name="plus" size={15} />
          </button>
        )}
      </h2>

      <div className={styles.notes}>
        {notes.map((note) => {
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
          return row(note);
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
          {folded ? <div className={styles.notes}>{folded.map((note) => row(note, true))}</div> : null}
        </>
      ) : null}
    </>
  );
}
