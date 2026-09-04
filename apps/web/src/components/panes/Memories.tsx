"use client";

// The standing rules a thread holds about itself.
//
// **No kit draws this.** `find-kit.sh thread` finds `WThing`, which has no
// memories section, and the nearest chip rows are `WMemories` and `WPerson`'s
// "What offload knows". Both are stale: they pass `Chip variant="soft"`, a prop
// the governed contract does not declare, retired in the design system's readme
// because the soft tints sat too close to paper to read as colour at chip size.
// So this is built against the component contracts with the kits as shape
// reference, which is the opposite of the usual failure here: the kits were
// read whole, and the kits are behind.
//
// Two consequences of the real `Chip` contract worth knowing before editing
// this file:
//
//   - **There is no disabled state.** `Chip` decides interactivity from whether
//     it has a click handler, so an add chip with no handler looks exactly like
//     one with a handler. At the cap the control is replaced by the sentence
//     instead of being greyed out, which also puts the way forward next to
//     where the affordance was.
//   - **`Chip` holds a tag, not a sentence.** It is `nowrap` with no max-width
//     and no ellipsis, and every label in every kit is under twenty characters.
//     A memory runs to sixty on the chip, so the width and the ellipsis belong
//     here rather than to the component.

import { useState } from "react";
import { Icon } from "../Icon";
import styles from "../../app/(shell)/shell.module.css";
import {
  MAX_MEMORIES,
  MEMORY_CHARS,
  addMemory,
  chipLabel,
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
  /** True when the pane head's add control was pressed. The section draws
   *  nothing when the thread has no memories, so the way in has to come from
   *  outside it. */
  adding: boolean;
  onAddingChange: (adding: boolean) => void;
  /** Memories that arrived while this screen was open, marked for a moment. */
  arrived?: Set<string>;
  onChanged: () => void;
  onUndo: (message: string, undo: () => Promise<unknown>) => void;
}

export function Memories({
  threadId,
  memories,
  members,
  adding,
  onAddingChange,
  arrived,
  onChanged,
  onUndo,
}: Props) {
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
    onAddingChange(false);
    setEditingId(memory.id);
    setDraft(memory.text);
  }

  function close(): void {
    onAddingChange(false);
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
  // same thing the standing summary already refuses to do. The way in when
  // there are none is the add control in the pane head.
  if (memories.length === 0 && !adding) return null;

  const editor = (memory: Memory | null) => (
    // Grid rows from 0fr to 1fr, so the height animates without a magic
    // number. `max-height` would need a guess big enough for the longest
    // memory, and a guess that is too big makes the close look slow.
    <span className={styles.memoryDrawer} data-open={true}>
      <span className={styles.memoryDrawerInner}>
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

          {/* Mute is what every member gets. Delete is the author's alone
              unless the author is gone, so the control is not drawn for
              anybody else rather than drawn and refused. */}
          {memory ? (
            <button
              type="button"
              className={styles.memoryAction}
              onClick={() => void mute(memory)}
            >
              {memory.muted ? "Unmute" : "Mute"}
            </button>
          ) : null}
          {memory && canDelete(memory) ? (
            <button
              type="button"
              className={styles.memoryAction}
              onClick={() => void remove(memory)}
            >
              Delete
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
    </span>
  );

  return (
    <>
      <h2 className={styles.section}>
        Memories
        <em className={styles.sectionCount}>{memories.length}</em>
      </h2>

      <div className={styles.memories}>
        {memories.map((memory) => {
          const name = author(memory);
          const open = editingId === memory.id;
          return (
            // The editor lives inside the chip it belongs to, so the chip
            // grows to hold it. It used to sit at the foot of the section,
            // which read as editing the last memory whichever one you had
            // clicked.
            <span
              key={memory.id}
              className={styles.memoryItem}
              // On the container as well as the chip, so opening it keeps the
              // tone rather than turning grey.
              data-tone={
                memory.muted ? "muted" : memory.origin === "learned" ? "accent" : "neutral"
              }
              data-open={open ? true : undefined}
              data-arrived={arrived?.has(memory.id) ? true : undefined}
            >
              <button
                type="button"
                className={styles.memoryChip}
                data-tone={
                  memory.muted ? "muted" : memory.origin === "learned" ? "accent" : "neutral"
                }
                data-open={open ? true : undefined}
                onClick={() => (open ? close() : open_(memory))}
              >
                {memory.origin === "learned" ? (
                  <>
                    <Icon name="sparkles" size={13} />
                    {/* The glyph alone is not a state. `Chip` has no
                        aria-label, so the alternative goes in the label. */}
                    <span className={styles.hidden}>offload wrote this. </span>
                  </>
                ) : null}
                <span className={styles.memoryText}>{chipLabel(memory.text)}</span>
                {name ? <span className={styles.memoryBy}>{name}</span> : null}
                {memory.muted ? <span className={styles.memoryBy}>Muted</span> : null}
              </button>
              {open ? editor(memory) : null}
            </span>
          );
        })}

        {adding ? (
          <span className={styles.memoryItem} data-tone="add" data-open={true}>
            {editor(null)}
          </span>
        ) : full ? (
          <p className={styles.memoryFull}>
            This thread already holds {MAX_MEMORIES}. Delete one to add another.
          </p>
        ) : null}
      </div>
    </>
  );
}
