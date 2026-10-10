"use client";

// 028. What a row not in a thread can do, written once for the group on My
// threads and for the full list, as `useTodayRows` is for Today's two cards.
//
// A content row acts exactly as it does on the thread page: the hover tools
// edit and delete, the edit modal carries Move, and Delete asks in the row's
// place first. A note opens the thread page's note editor in place, with Move.
// A suggestion accepts or dismisses at the press. Every write is drawn first
// and sent second through `perform`, with the thread page's words, and the
// list reloads once nothing is in flight.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "../shell/Toast";
import { MoveOver } from "../shell/MoveSheet";
import { EditModal } from "../panes/EditModal";
import { NoteEditor } from "../panes/Notes";
import type { RowHandlers } from "../panes/ContentRowView";
import { CreateThreadModal, type CreateChoice } from "./CreateThreadModal";
import { perform, useWrites, type Writes } from "../../lib/optimistic";
import { useClock } from "../../lib/clock";
import { drawnEdit, undoOf } from "../../lib/row-edit";
import {
  completeContent,
  deleteContent,
  deleteNote,
  editContent,
  editNote,
  moveContent,
  muteNote,
  restoreNote,
  setArchived,
  type ContentPatch,
  type ContentRow,
  type ContentSnapshot,
  type Note,
} from "../../lib/threads";
import {
  acceptSuggestion,
  createFromProposal,
  dismissSuggestion,
  entryKey,
  moveNote,
  undoProposal,
  undoSuggestion,
  withEntry,
  withoutEntry,
  type LooseEntry,
  type LooseSummary,
} from "../../lib/loose";

/** 028's failures offer Try again, as the phones' do. */
export const RETRY = "Try again";

export interface LooseRows {
  handlers: RowHandlers;
  /** A to-do's checkbox. */
  tick: (row: ContentRow) => void;
  accept: (entry: LooseEntry) => void;
  dismiss: (entry: LooseEntry) => void;
  /** The note open in its editor, by id. */
  editingNote: string | null;
  openNote: (note: Note) => void;
  /** The thread page's note editor, for the open note. */
  noteEditor: (note: Note) => React.ReactNode;
  /** The modals and the move sheet, wherever the list puts them. */
  overlays: React.ReactNode;
  writes: Writes;
}

export function useLooseRows<S extends LooseSummary>(
  list: S,
  setList: (update: (current: S) => S) => void,
  reload: () => Promise<void>,
): LooseRows {
  const toast = useToast();
  const router = useRouter();
  const { zone } = useClock();
  const writes = useWrites(reload);
  const [asking, setAsking] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<ContentRow | null>(null);
  const [creating, setCreating] = useState<{ id: string; name: string } | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [movingNote, setMovingNote] = useState<Note | null>(null);

  // ------------------------------------------------------------ the list

  const keyOf = (kind: "content" | "note", id: string) => `${kind}:${id}`;
  const find = (key: string): LooseEntry | undefined => list.rows.find((one) => entryKey(one) === key);
  const drop = (entry: LooseEntry) => setList((current) => withoutEntry(current, entry));
  const put = (entry: LooseEntry, at: number) => setList((current) => withEntry(current, entry, at));
  const patch = (key: string, update: (entry: LooseEntry) => LooseEntry) =>
    setList((current) => ({ ...current, rows: current.rows.map((one) => (entryKey(one) === key ? update(one) : one)) }));
  const patchRow = (id: string, fields: Partial<ContentRow>) =>
    patch(keyOf("content", id), (one) => (one.kind === "content" ? { ...one, row: { ...one.row, ...fields } } : one));
  const patchNote = (id: string, fields: Partial<Note>) =>
    patch(keyOf("note", id), (one) => (one.kind === "note" ? { ...one, note: { ...one.note, ...fields } } : one));

  /** Out of the list at the press, back where it was if refused or undone.
   *  A row this list is not holding (the full list's archived rows) is only
   *  written, and the reload draws it. */
  function leave(
    entry: LooseEntry | undefined,
    op: {
      write: () => Promise<boolean>;
      unwrite?: () => Promise<boolean>;
      did?: string;
      failed: string;
      unfailed?: string;
      retry?: string | null;
    },
  ): void {
    const at = entry ? list.rows.findIndex((one) => entryKey(one) === entryKey(entry)) : -1;
    void perform(
      {
        apply: () => (entry && at >= 0 ? drop(entry) : undefined),
        revert: () => (entry && at >= 0 ? put(entry, at) : undefined),
        write: op.write,
        ...(op.unwrite ? { unwrite: op.unwrite } : {}),
        ...(op.did ? { did: op.did } : {}),
        get failed() {
          return op.failed;
        },
        ...(op.unfailed ? { unfailed: op.unfailed } : {}),
        // Read when the write has settled, as `failed` is.
        get retry() {
          return op.retry === undefined ? RETRY : op.retry;
        },
      },
      toast,
      writes,
    );
  }

  // ------------------------------------------------------- content rows

  function remove(row: ContentRow): void {
    setAsking(null);
    leave(find(keyOf("content", row.id)), {
      write: () => deleteContent(row.id),
      unwrite: () => setArchived(row.id, false),
      did: "Deleted, gone in a moment",
      failed: "Couldn't delete that",
      unfailed: "Couldn't put that back",
    });
  }

  /** A ticked to-do is done and is not in this list, so it leaves at the
   *  press, and Undo is the way back since the box goes with it. */
  function tick(row: ContentRow): void {
    leave(find(keyOf("content", row.id)), {
      write: () => completeContent(row.id, true),
      unwrite: () => completeContent(row.id, false),
      did: "Ticked off",
      failed: "Couldn't tick that off",
      unfailed: "Couldn't put that back",
    });
  }

  /** Somebody else's row offers Archive rather than Delete, which the
   *  default thread never has, since nobody else is in it; and an archived
   *  row offers Put back, on the full list's archived rows. The row's tools
   *  are the thread page's and so is this. */
  function archive(row: ContentRow): void {
    const archived = row.archivedAt !== null;
    leave(find(keyOf("content", row.id)), {
      write: () => setArchived(row.id, !archived),
      unwrite: () => setArchived(row.id, archived),
      did: archived ? "Put back" : "Archived",
      failed: archived ? "Couldn't put that back" : "Couldn't archive that",
      unfailed: archived ? "Couldn't archive that" : "Couldn't put that back",
    });
  }

  function edit(row: ContentRow, change: ContentPatch): void {
    const { drawn, before } = drawnEdit(row, change, zone);
    let previous: ContentSnapshot | null = null;
    void perform(
      {
        apply: () => patchRow(row.id, drawn),
        revert: () => patchRow(row.id, before),
        write: () =>
          editContent(row.id, change).then((result) => {
            if (!result) return false;
            previous = result.previous;
            return true;
          }),
        unwrite: () => (previous ? editContent(row.id, undoOf(previous)) : Promise.resolve(null)).then((result) => result !== null),
        did: "Saved",
        failed: "Couldn't save that",
        unfailed: "Couldn't put it back",
        retry: RETRY,
      },
      toast,
      writes,
    );
  }

  /** Move, from the edit modal: the row leaves as a deleted row does. */
  function move(row: ContentRow, to: { id: string; name: string }): void {
    let from: string | null = null;
    leave(find(keyOf("content", row.id)), {
      write: async () => {
        const moved = await moveContent(row.id, to.id);
        from = moved?.previous.threadId ?? null;
        return moved !== null;
      },
      unwrite: async () => (from ? (await moveContent(row.id, from)) !== null : false),
      did: `Moved to ${to.name}`,
      failed: "Couldn't move that",
      unfailed: "Couldn't put that back",
    });
  }

  // ---------------------------------------------------------------- notes

  function closeNote(): void {
    setEditingNote(null);
    setNoteDraft("");
  }

  function saveNote(note: Note): void {
    const text = noteDraft.trim();
    closeNote();
    if (!text || text === note.text) return;
    void perform(
      {
        apply: () => patchNote(note.id, { text }),
        revert: () => patchNote(note.id, { text: note.text }),
        write: () => editNote(note.id, text).then((result) => result !== null),
        unwrite: () => editNote(note.id, note.text).then((result) => result !== null),
        did: "Note changed",
        failed: "Couldn't change the note",
        unfailed: "Couldn't put the note back",
        retry: RETRY,
      },
      toast,
      writes,
    );
  }

  function removeNote(note: Note): void {
    closeNote();
    const entry = find(keyOf("note", note.id));
    if (!entry) return;
    leave(entry, {
      write: () => deleteNote(note.id),
      unwrite: () => restoreNote(note.id),
      did: "Note deleted",
      failed: "Couldn't delete the note",
      unfailed: "Couldn't put the note back",
    });
  }

  function muteOne(note: Note): void {
    closeNote();
    void perform(
      {
        apply: () => patchNote(note.id, { muted: !note.muted }),
        revert: () => patchNote(note.id, { muted: note.muted }),
        write: () => muteNote(note.id, !note.muted),
        failed: note.muted ? "Couldn't unmute the note" : "Couldn't mute the note",
        retry: RETRY,
      },
      toast,
      writes,
    );
  }

  function moveOne(note: Note, to: { id: string; name: string }): void {
    setMovingNote(null);
    closeNote();
    const entry = find(keyOf("note", note.id));
    if (!entry) return;
    let from: string | null = null;
    let duplicate = false;
    const op = {
      write: async () => {
        const result = await moveNote(note.id, to.id);
        if (result.ok) from = result.previous.threadId;
        else duplicate = result.duplicate;
        return result.ok;
      },
      unwrite: async () => (from ? (await moveNote(note.id, from)).ok : false),
      did: `Moved to ${to.name}`,
      get failed() {
        return duplicate ? `That's already in ${to.name}` : "Couldn't move that";
      },
      // Already there is not something trying again can change.
      get retry() {
        return duplicate ? null : RETRY;
      },
      unfailed: "Couldn't put that back",
    };
    leave(entry, op);
  }

  // ---------------------------------------------------------- suggestions

  function accept(entry: LooseEntry): void {
    const suggestion = entry.suggestion;
    if (!suggestion) return;
    if (suggestion.kind === "create") {
      setCreating({ id: suggestion.proposal.id, name: suggestion.proposal.name });
      return;
    }
    leave(entry, {
      write: async () => (await acceptSuggestion(suggestion.id)) !== null,
      unwrite: () => undoSuggestion(suggestion.id),
      did: `Moved to ${suggestion.thread.name}`,
      failed: "Couldn't move that",
      unfailed: "Couldn't put that back",
    });
  }

  /** Gone at once, with no toast; back with a word if refused. */
  function dismiss(entry: LooseEntry): void {
    const suggestion = entry.suggestion;
    if (!suggestion) return;
    const key = entryKey(entry);
    void perform(
      {
        apply: () => patch(key, (one) => ({ ...one, suggestion: null })),
        revert: () => patch(key, (one) => ({ ...one, suggestion })),
        write: () => dismissSuggestion(suggestion.id),
        failed: "Couldn't dismiss that",
        retry: RETRY,
      },
      toast,
      writes,
    );
  }

  /** The modal's write. On success the new thread opens, and Undo puts
   *  everything back and lands on My threads, unless something else has
   *  happened in the thread since. */
  async function create(proposalId: string, choice: CreateChoice): Promise<boolean> {
    const result = await createFromProposal(proposalId, choice);
    if (!result.ok) return false;
    setCreating(null);
    void reload();
    router.push(`/threads/${result.thread.id}?from=threads`);
    const undo = async (): Promise<void> => {
      const outcome = await undoProposal(proposalId);
      if (outcome === "ok") {
        void reload();
        router.push("/threads");
        return;
      }
      if (outcome === "changed") {
        toast.show("Couldn't undo that");
        return;
      }
      toast.show("Couldn't put that back", { label: RETRY, onPress: undo });
    };
    toast.show(`Created ${result.thread.name}`, { label: "Undo", onPress: undo });
    return true;
  }

  // ------------------------------------------------------------- the rest

  const handlers: RowHandlers = {
    editing: null,
    draft: "",
    asking,
    arrived: new Set(),
    onDraft: () => undefined,
    onEdit: (row) => setEditRow(row),
    onSaveTitle: () => undefined,
    onStopEditing: () => undefined,
    onArchive: archive,
    onAsk: setAsking,
    onDelete: remove,
  };

  const noteEditor = (note: Note) => (
    <NoteEditor
      draft={noteDraft}
      onDraft={setNoteDraft}
      onSave={() => saveNote(note)}
      onCancel={closeNote}
      // Everything here is the person's own: the default thread is nobody
      // else's.
      way={note.muted ? "unmute" : "delete"}
      onDelete={() => removeNote(note)}
      onMute={() => muteOne(note)}
      onMove={() => setMovingNote(note)}
      placeholder="What is worth remembering?"
    />
  );

  const overlays = (
    <>
      {editRow ? (
        <EditModal
          key={editRow.id}
          row={editRow}
          onClose={() => setEditRow(null)}
          onSave={(row, change) => {
            setEditRow(null);
            edit(row, change);
          }}
          onMove={(row, to) => {
            setEditRow(null);
            move(row, to);
          }}
        />
      ) : null}
      {movingNote ? (
        <MoveOver exceptThreadId={null} onClose={() => setMovingNote(null)} onPick={(thread) => moveOne(movingNote, thread)} />
      ) : null}
      {creating ? (
        <CreateThreadModal
          key={creating.id}
          proposalId={creating.id}
          name={creating.name}
          onCreate={(choice) => create(creating.id, choice)}
          onClose={() => setCreating(null)}
        />
      ) : null}
    </>
  );

  return {
    handlers,
    tick,
    accept,
    dismiss,
    editingNote,
    openNote: (note) => {
      setEditingNote(note.id);
      setNoteDraft(note.text);
    },
    noteEditor,
    overlays,
    writes,
  };
}
