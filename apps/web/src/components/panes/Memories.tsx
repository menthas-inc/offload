"use client";

// The standing rules a thread holds about itself.
//
// **Rows, from the `MemoryRow` contract.** They were chips until 5 September
// 2026, and the chip was wrong for the reason the contract now states: a memory
// is a sentence up to 200 characters, and a chip is built for a tag. It is
// `nowrap` with no max-width, so this truncated every rule to a window you had
// to click to read. A row sets the whole thing, wrapped.
//
// The open row holds its own editor **in place of its text line**, not under a
// copy of it: the thing you clicked is visibly the thing you are editing, and
// the memory is never on screen twice.
//
// `Chip` gained a `disabled` state in the same pass, which the contract offers
// for the at-cap Add control. Not taken: the contract's own note says to say
// why it is unavailable in copy nearby rather than leave a dead pill, and with
// rows the sentence alone says it and names what to do. Logged as a divergence.

import { useState } from "react";
import { Icon } from "../Icon";
import styles from "../../app/(shell)/shell.module.css";
import {
  MAX_MEMORIES,
  MEMORY_CHARS,
  addMemory,
  deleteMemory,
  editMemory,
  muteMemory,
  restoreMemory,
  type Member,
  type Memory,
} from "../../lib/threads";

interface Props {
  threadId: string;
  memories: Memory[];
  members: Member[];
  /** Memories that arrived while this screen was open, marked for a moment. */
  arrived?: Set<string>;
  onChanged: () => void;
  onUndo: (message: string, undo: () => Promise<unknown>) => void;
}

export function Memories({ threadId, memories, members, arrived, onChanged, onUndo }: Props) {
  const [adding, setAdding] = useState(false);
  // Who is reading, from the member list the bundle already carries. Decides
  // which chips offer delete, because deleting is the author's alone and
  // everybody else gets mute.
  const viewerId = members.find((member) => member.isYou)?.accountId ?? null;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const full = memories.length >= MAX_MEMORIES;
  const shared = members.length > 1;
  const editing = memories.find((memory) => memory.id === editingId) ?? null;

  // A memory whose author has deleted their account carries no name, and that
  // reads as somebody who left rather than as yours, because every live
  // member's memory does carry one.
  function author(memory: Memory): string | null {
    if (!shared || memory.authorId === null) return null;
    return members.find((m) => m.accountId === memory.authorId)?.displayName ?? null;
  }

  /** `open_` rather than `open`, because `open` is a global on Window and
   *  shadowing it inside a component that also has a boolean called `open` is
   *  how a click handler ends up calling the wrong thing. */
  function open_(memory: Memory): void {
    setAdding(false);
    setEditingId(memory.id);
    setDraft(memory.text);
  }

  function close(): void {
    setAdding(false);
    setEditingId(null);
    setDraft("");
  }

  /** Deleting is the author's, per OFF-3, with one exception: **a memory
   *  nobody owns is everybody's.** Its author deleted their account or left the
   *  thread, so the rule that protects a contribution has nobody left to
   *  protect, and what it produces instead is a rule still steering the model
   *  that no remaining member can remove. `authorIsMember` is computed
   *  server-side and the endpoint enforces the same predicate, so this cannot
   *  draw a control the server will refuse. */
  function canDelete(memory: Memory): boolean {
    return memory.authorId === viewerId || !memory.authorIsMember;
  }

  async function save(): Promise<void> {
    const text = draft.trim();
    if (text.length === 0) return close();

    if (adding) {
      const result = await addMemory(threadId, text);
      close();
      if (result && "full" in result) return;
      onChanged();
      return;
    }

    if (!editing) return close();
    const result = await editMemory(editing.id, text);
    close();
    if (!result) return;
    // Reversible by writing the previous value back, which is what puts an
    // edit on the OFF-6 allowlist rather than under a confirmation.
    const { previous } = result;
    onUndo("Memory changed", async () => {
      await editMemory(editing.id, previous);
      onChanged();
    });
    onChanged();
  }

  async function remove(memory: Memory): Promise<void> {
    close();
    if (!(await deleteMemory(memory.id))) return;
    onChanged();
    // Never the memory's text: a toast is a few words and this runs to 200
    // characters.
    onUndo("Memory deleted", async () => {
      await restoreMemory(memory.id);
      onChanged();
    });
  }

  async function mute(memory: Memory): Promise<void> {
    close();
    if (!(await muteMemory(memory.id, !memory.muted))) return;
    onChanged();
  }

  // Nothing to show and nothing being written: draw nothing at all. A heading
  // over an empty row is a section announcing its own absence, which is the
  // same thing the standing summary already refuses to do.
  //
  // **So a thread with no memories has no way to type the first one**, and
  // that is the accepted cost of the two rules the product owner set: empty
  // sections are hidden, and there is no add control anywhere else, because a
  // bare plus on the pane said nothing about what it added. The first memory
  // on a thread comes from telling offload, which is the product's usual way
  // in and the thing `add_memory` exists for. Every one after that can be
  // typed here.
  if (memories.length === 0 && !adding) return null;

  const editor = (memory: Memory | null) => (
    <span className={styles.memoryOpen}>
      <textarea
        className={styles.memoryField}
        value={draft}
        maxLength={MEMORY_CHARS}
        rows={2}
        autoFocus
        placeholder="How should this thread be handled?"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
          // Enter saves, shift-Enter is a new line. A rule is one sentence.
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void save();
          }
        }}
      />
      <span className={styles.memoryActions}>
        <span className={styles.memoryCount}>
          {draft.length}/{MEMORY_CHARS}
        </span>

        {/* One control, never two. Delete and mute are the same intent at
            different strengths, and offering both makes somebody choose
            between them for no reason: if you can remove it, mute is a worse
            version of that, and if you cannot, mute is the whole of what you
            have.

            Muted wins over both, whoever is asking. Mute is co-owned and
            reversible by anyone, so a memory somebody quieted has to be
            un-quietable by anyone, including its author. Without that a muted
            memory of your own would offer only Delete, and the way back from a
            reversible action would be a destructive one. */}
        {memory?.muted ? (
          <button
            type="button"
            className={styles.memoryAction}
            onClick={() => void mute(memory)}
          >
            Unmute
          </button>
        ) : memory && canDelete(memory) ? (
          <button
            type="button"
            className={styles.memoryAction}
            data-tone="danger"
            onClick={() => void remove(memory)}
          >
            Delete
          </button>
        ) : memory ? (
          <button
            type="button"
            className={styles.memoryAction}
            onClick={() => void mute(memory)}
          >
            Mute
          </button>
        ) : null}

        <button type="button" className={styles.memoryAction} onClick={close}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.memorySave}
          disabled={draft.trim().length === 0}
          onClick={() => void save()}
        >
          Save
        </button>
      </span>
    </span>
  );

  return (
    <>
      <h2 className={styles.section}>
        Memories
        {/* No zero. Writing the first one is the only way to see this section
            with nothing in it, and a count of none beside the editor you are
            typing into is the same noise as an empty heading. */}
        {memories.length > 0 ? (
          <em className={styles.sectionCount}>{memories.length}</em>
        ) : null}
      </h2>

      <div className={styles.memories}>
        {memories.map((memory) => {
          const name = author(memory);
          const open = editingId === memory.id;
          const tone = memory.muted ? "muted" : memory.origin === "learned" ? "accent" : "neutral";

          if (open) {
            return (
              <div key={memory.id} className={styles.memoryRow} data-tone={tone} data-open={true}>
                {editor(memory)}
              </div>
            );
          }

          return (
            <button
              key={memory.id}
              type="button"
              className={styles.memoryRow}
              data-tone={tone}
              data-arrived={arrived?.has(memory.id) ? true : undefined}
              onClick={() => open_(memory)}
            >
              {memory.origin === "learned" ? (
                <>
                  <Icon name="sparkles" size={14} className={styles.memoryGlyph} />
                  {/* The glyph alone is not a state, and the row has no other
                      place to say it. */}
                  <span className={styles.hidden}>offload wrote this. </span>
                </>
              ) : null}
              <span className={styles.memoryText}>
                {memory.text}
                {name ? <span className={styles.memoryBy}> {name}</span> : null}
                {memory.muted ? <span className={styles.memoryBy}> Muted</span> : null}
              </span>
            </button>
          );
        })}

        {adding ? (
          <div className={styles.memoryRow} data-tone="neutral" data-open={true}>
            {editor(null)}
          </div>
        ) : null}
      </div>

      {full ? (
        /* At the cap the control is gone and the sentence is in its place. The
           `Chip` contract now has a disabled state and its own note says to put
           the reason in copy nearby rather than leave a dead pill, so the
           sentence does the whole job. */
        <p className={styles.memoryFull}>
          This thread already holds {MAX_MEMORIES}. Delete one to add another.
        </p>
      ) : adding ? null : (
        <button
          type="button"
          className={styles.chip}
          onClick={() => {
            setEditingId(null);
            setDraft("");
            setAdding(true);
          }}
          style={{ marginTop: "var(--space-4)" }}
        >
          <Icon name="plus" size={13} />
          Add
        </button>
      )}
    </>
  );
}
