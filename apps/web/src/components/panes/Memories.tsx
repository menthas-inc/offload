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
  onChanged: () => void;
  onUndo: (message: string, undo: () => Promise<unknown>) => void;
}

export function Memories({ threadId, memories, members, onChanged, onUndo }: Props) {
  // Who is reading, from the member list the bundle already carries. Decides
  // which chips offer delete, because deleting is the author's alone and
  // everybody else gets mute.
  const viewerId = members.find((member) => member.isYou)?.accountId ?? null;
  const [adding, setAdding] = useState(false);
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

  function open(memory: Memory): void {
    setAdding(false);
    setEditingId(memory.id);
    setDraft(memory.text);
  }

  function close(): void {
    setAdding(false);
    setEditingId(null);
    setDraft("");
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

  return (
    <>
      <h2 className={styles.section}>
        Memories
        {memories.length > 0 ? (
          <em className={styles.sectionCount}>{memories.length}</em>
        ) : null}
      </h2>

      <div className={styles.memories}>
        {memories.map((memory) => {
          const name = author(memory);
          return (
            <button
              key={memory.id}
              type="button"
              className={styles.memoryChip}
              // Moss for something offload worked out, which is the kits' own
              // rule for the mark. Outline once muted, so a rule that is off
              // does not read like one that is on.
              data-tone={memory.muted ? "muted" : memory.origin === "learned" ? "accent" : "neutral"}
              onClick={() => open(memory)}
            >
              {memory.origin === "learned" ? (
                <>
                  <Icon name="sparkles" size={13} />
                  {/* The glyph alone is not a state. `Chip` has no aria-label,
                      so the alternative goes in the label itself. */}
                  <span className={styles.hidden}>offload wrote this. </span>
                </>
              ) : null}
              <span className={styles.memoryText}>{chipLabel(memory.text)}</span>
              {name ? <span className={styles.memoryBy}>{name}</span> : null}
              {memory.muted ? <span className={styles.memoryBy}>Muted</span> : null}
            </button>
          );
        })}

        {/* At the cap the control is gone and the sentence is in its place.
            `Chip` has no disabled state, and inventing one for this screen
            would be a divergence with nothing to gain: the sentence says the
            same thing and names what to do about it. */}
        {full ? (
          <p className={styles.memoryFull}>
            This thread already holds {MAX_MEMORIES}. Delete one to add another.
          </p>
        ) : (
          <button
            type="button"
            className={styles.memoryChip}
            data-tone="add"
            onClick={() => {
              setEditingId(null);
              setDraft("");
              setAdding(true);
            }}
          >
            <Icon name="plus" size={13} />
            Add
          </button>
        )}
      </div>

      {adding || editing ? (
        <div className={styles.memoryEditor}>
          <textarea
            className={styles.memoryField}
            value={draft}
            maxLength={MEMORY_CHARS}
            rows={2}
            autoFocus
            placeholder="How should this thread be handled?"
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className={styles.memoryActions}>
            <span className={styles.memoryCount}>
              {draft.length}/{MEMORY_CHARS}
            </span>

            {/* Mute is what every member gets. Delete is the author's alone,
                per OFF-3, so the control is not drawn for anybody else rather
                than drawn and refused. */}
            {editing ? (
              <button
                type="button"
                className={styles.memoryAction}
                onClick={() => void mute(editing)}
              >
                {editing.muted ? "Unmute" : "Mute"}
              </button>
            ) : null}
            {editing && editing.authorId === viewerId ? (
              <button
                type="button"
                className={styles.memoryAction}
                onClick={() => void remove(editing)}
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
          </div>
        </div>
      ) : null}
    </>
  );
}
