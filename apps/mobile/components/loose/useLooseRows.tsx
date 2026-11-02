// 028. The rows of what is not in a thread, acting in place.
//
// My threads' group and the full list draw the same rows with the same
// sheets, so both take them from here, as Today takes its rows from
// `useTodayRows`. A row is the thread page's content row with no thread slot,
// no labels and no handle, and its suggestion under it. No meta line but an
// archived row's: the tile says what it is (2026-10-05). A to-do leads with
// its checkbox, as on the thread page, and a tick takes it out. A tap opens
// what the thread page opens: the edit sheet, the note's sheet, the photo.
// A swipe deletes with the eight-second Undo; a long press opens the action
// sheet, which carries Move.
//
// Every write is drawn first and sent second through `perform`, and the
// screen's own reload, run once nothing is in flight, makes it the server's
// again. A hook rather than a component because the sheets are overlays at
// the screen's root and the rows sit in its scroll.

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { dayIn } from "@offload/widgets";
import { ContentRowView } from "../shell/ContentRow";
import { RowEditSheet } from "../shell/RowEditSheet";
import { MoveSheet } from "../shell/MoveSheet";
import { NoteEditor } from "../shell/Notes";
import { PhotoViewer } from "../shell/PhotoViewer";
import { forgetRendition } from "../shell/PhotoThumb";
import type { ToastState } from "../shell/Toast";
import { useConversation } from "../shell/conversation-context";
import { SuggestionLine } from "./Suggestion";
import { CreateThreadSheet } from "./CreateThreadSheet";
import {
  completeContent,
  deleteContent,
  deleteNote,
  editContent,
  editNote,
  forgetAction,
  moveContent,
  muteNote,
  restoreAction,
  restoreNote,
  setArchived,
  type ContentPatch,
  type ContentRow,
  type ContentSnapshot,
  type Note,
  type ThreadRow,
} from "../../lib/threads";
import {
  acceptSuggestion,
  dismissSuggestion,
  duplicateCopy,
  keyOf,
  metaOf,
  moveNote,
  movedCopy,
  noteRow,
  titleOf,
  undoProposal,
  undoSuggestion,
  withoutEntries,
  type LooseEntry,
  type LooseSummary,
} from "../../lib/loose";
import { perform, useWrites, type Reversible } from "../../lib/optimistic";
import type { Place } from "@offload/widgets";
import { useClock } from "../../lib/clock";
import { drawnWhen } from "../../lib/when";
import { drawnRemind, undoPatch } from "../../lib/reminders";

/** 028's failures say Try again. */
const RETRY = "Try again";

export function useLooseRows(
  /** What the screen last read. A new read clears what was drawn ahead of it. */
  source: unknown,
  reload: () => Promise<void>,
  toast: ToastState,
): {
  /** The rows as drawn, with what the screen has drawn ahead of the server. */
  live: (entries: LooseEntry[]) => LooseEntry[];
  /** Counts less what has left since the last read: the heading's, the
   *  chips' and the All link's. */
  less: <T extends Pick<LooseSummary, "count" | "byType">>(counts: T) => T;
  row: (entry: LooseEntry, options: { border: boolean }) => ReactNode;
  sheets: ReactNode;
} {
  const router = useRouter();
  const { notify, openPdf } = useConversation();
  const { zone } = useClock();
  // What has left, by key, kept whole so its type can come off the counts.
  const [dropped, setDropped] = useState<Map<string, LooseEntry>>(new Map());
  const [unsuggested, setUnsuggested] = useState<Set<string>>(new Set());
  const [drawn, setDrawn] = useState<Map<string, Partial<ContentRow> & Partial<Note>>>(new Map());
  const [renaming, setRenaming] = useState<ContentRow | null>(null);
  const [noting, setNoting] = useState<Note | null>(null);
  const [moving, setMoving] = useState<LooseEntry | null>(null);
  const [viewing, setViewing] = useState<ContentRow | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const writes = useWrites(reload);
  // A read taken while a write is out is the server's copy from before it, so
  // what was drawn ahead stays until the read the write's settling runs.
  useEffect(() => {
    if (!writes.idle()) return;
    setDropped(new Map());
    setUnsuggested(new Set());
    setDrawn(new Map());
  }, [source]);

  const add = (set: Set<string>, key: string) => new Set(set).add(key);
  const take = (set: Set<string>, key: string) => {
    const next = new Set(set);
    next.delete(key);
    return next;
  };
  const drop = (entry: LooseEntry) => setDropped((held) => new Map(held).set(keyOf(entry), entry));
  const put = (entry: LooseEntry) =>
    setDropped((held) => {
      const next = new Map(held);
      next.delete(keyOf(entry));
      return next;
    });
  const patch = (key: string, fields: Partial<ContentRow> & Partial<Note>) =>
    setDrawn((held) => new Map(held).set(key, { ...(held.get(key) ?? {}), ...fields }));

  // ------------------------------------------------------------ the writes

  function remove(entry: LooseEntry): void {
    setViewing(null);
    if (entry.kind === "note") {
      void perform(
        {
          apply: () => drop(entry),
          revert: () => put(entry),
          write: () => deleteNote(entry.note.id),
          unwrite: () => restoreNote(entry.note.id),
          did: "Note deleted",
          failed: "Couldn't delete the note",
          unfailed: "Couldn't put the note back",
          place: { id: keyOf(entry), icon: "trash-2", form: "slot" },
        },
        toast,
        writes,
      );
      return;
    }
    const row = entry.row;
    void perform(
      {
        apply: () => drop(entry),
        revert: () => put(entry),
        write: async () => {
          const ok = await deleteContent(row.id);
          if (ok && row.photo) forgetRendition(row.photo.blobId);
          return ok;
        },
        unwrite: () => setArchived(row.id, false),
        did: "Deleted, gone in a moment",
        failed: "Couldn't delete that",
        unfailed: "Couldn't put that back",
        place: { id: keyOf(entry), icon: "trash-2", form: "slot" },
      },
      toast,
      writes,
    );
  }

  /** 044. Remove a wrong action from a PDF's loose row. The row stays and
   *  changes, so the Undo draws under it; a failed write puts the action back,
   *  and restore refuses any url the PDF did not carry. */
  function removeAction(entry: LooseEntry, url: string): void {
    if (entry.kind !== "content") return;
    const row = entry.row;
    const key = keyOf(entry);
    const before = row.actions ?? [];
    void perform(
      {
        apply: () => patch(key, { actions: before.filter((action) => action.url !== url) }),
        revert: () => patch(key, { actions: before }),
        write: () => forgetAction(row.id, url),
        unwrite: () => restoreAction(row.id, url),
        did: "Removed",
        failed: "Couldn't remove that",
        unfailed: "Couldn't put that back",
        place: { id: key, icon: "arrow-up-right", form: "under" },
      },
      toast,
      writes,
    );
  }

  /** An archived row back with the rest, from the foot row's list. */
  function restore(row: ContentRow): void {
    const entry: LooseEntry = { kind: "content", row, suggestion: null };
    void perform(
      {
        apply: () => drop(entry),
        revert: () => put(entry),
        write: () => setArchived(row.id, false),
        unwrite: () => setArchived(row.id, true),
        did: "Put back",
        failed: "Couldn't put that back",
        unfailed: "Couldn't archive that",
        place: { id: keyOf(entry), icon: "archive", form: "slot" },
      },
      toast,
      writes,
    );
  }

  function archive(row: ContentRow): void {
    const entry: LooseEntry = { kind: "content", row, suggestion: null };
    void perform(
      {
        apply: () => drop(entry),
        revert: () => put(entry),
        write: () => setArchived(row.id, true),
        unwrite: () => setArchived(row.id, false),
        did: "Archived",
        failed: "Couldn't archive that",
        unfailed: "Couldn't put that back",
        place: { id: keyOf(entry), icon: "archive", form: "slot" },
      },
      toast,
      writes,
    );
  }

  /** A ticked to-do is done and is not in this list, so it leaves at the
   *  press, and Undo is the way back since the box goes with it. */
  function tick(row: ContentRow): void {
    const entry: LooseEntry = { kind: "content", row, suggestion: null };
    void perform(
      {
        apply: () => drop(entry),
        revert: () => put(entry),
        write: () => completeContent(row.id, true),
        unwrite: () => completeContent(row.id, false),
        did: "Ticked off",
        failed: "Couldn't tick that off",
        unfailed: "Couldn't put that back",
        place: { id: keyOf(entry), icon: "check", form: "slot" },
      },
      toast,
      writes,
    );
  }

  /** The edit sheet's Save. No labels: a loose row draws none. */
  function edit(row: ContentRow, fields: ContentPatch): void {
    const key = `c:${row.id}`;
    const next: Partial<ContentRow> = {};
    if (fields.title !== undefined) next.title = fields.title;
    // 042. The switch's part: a stop draws isReminder off with it.
    Object.assign(next, drawnRemind(fields));
    Object.assign(next, drawnWhen(fields, zone));
    const before: Partial<ContentRow> = {
      title: row.title,
      isReminder: row.isReminder,
      reminders: row.reminders,
      dueAt: row.dueAt,
      occursAt: row.occursAt,
      occursEndAt: row.occursEndAt,
      rrule: row.rrule,
      allDay: row.allDay,
    };
    let previous: ContentSnapshot | null = null;
    void perform(
      {
        apply: () => patch(key, next),
        revert: () => patch(key, before),
        write: async () => {
          previous = (await editContent(row.id, fields))?.previous ?? null;
          return previous !== null;
        },
        unwrite: async () => (previous ? (await editContent(row.id, undoPatch(previous))) !== null : false),
        did: "Saved",
        failed: "Couldn't save that",
        unfailed: "Couldn't put it back",
        place: { id: key, icon: "pencil", form: "under" },
      },
      toast,
      writes,
    );
  }

  function editNoteText(note: Note, text: string): void {
    const key = `n:${note.id}`;
    const words = text.trim();
    if (!words) return;
    void perform(
      {
        apply: () => patch(key, { text: words }),
        revert: () => patch(key, { text: note.text }),
        write: () => editNote(note.id, words).then((result) => result !== null),
        unwrite: () => editNote(note.id, note.text).then((result) => result !== null),
        did: "Note changed",
        failed: "Couldn't change the note",
        unfailed: "Couldn't put the note back",
        place: { id: key, icon: "pencil", form: "under" },
      },
      toast,
      writes,
    );
  }

  function mute(note: Note): void {
    const key = `n:${note.id}`;
    void perform(
      {
        apply: () => patch(key, { muted: !note.muted }),
        revert: () => patch(key, { muted: note.muted }),
        write: () => muteNote(note.id, !note.muted),
        failed: note.muted ? "Couldn't unmute the note" : "Couldn't mute the note",
      },
      toast,
      writes,
    );
  }

  /** Move, by hand, from the move sheet. The row leaves as a deleted row does
   *  and Undo is the same move back to wherever the server says it was. */
  function move(entry: LooseEntry, to: ThreadRow): void {
    setMoving(null);
    setViewing(null);
    let home: string | null = null;
    const op: Reversible = {
      apply: () => drop(entry),
      revert: () => put(entry),
      write: async () => {
        if (entry.kind === "content") {
          home = (await moveContent(entry.row.id, to.id))?.previous.threadId ?? null;
          return home !== null;
        }
        const moved = await moveNote(entry.note.id, to.id);
        if (moved === "duplicate") {
          op.failed = duplicateCopy(to.name);
          op.retry = null;
          return false;
        }
        home = moved?.previous.threadId ?? null;
        return home !== null;
      },
      unwrite: async () => {
        if (!home) return false;
        if (entry.kind === "content") return (await moveContent(entry.row.id, home)) !== null;
        const back = await moveNote(entry.note.id, home);
        return back !== null && back !== "duplicate";
      },
      did: movedCopy(to.name),
      failed: "Couldn't move that",
      unfailed: "Couldn't put that back",
      retry: RETRY,
      place: { id: keyOf(entry), icon: "arrow-up-right", form: "slot" },
    };
    void perform(op, toast, writes);
  }

  /** Move to: at once, with Undo, which brings the row back with its
   *  suggestion. A refusal (the row already left, on another device) puts it
   *  back with a word, and the reload after it shows where it now is. */
  function accept(entry: LooseEntry): void {
    const suggestion = entry.suggestion;
    if (!suggestion) return;
    if (suggestion.kind === "create") {
      setCreating(suggestion.proposal.id);
      return;
    }
    void perform(
      {
        apply: () => drop(entry),
        revert: () => put(entry),
        write: () => acceptSuggestion(suggestion.id).then((thread) => thread !== null),
        unwrite: () => undoSuggestion(suggestion.id).then((outcome) => outcome === "ok"),
        did: movedCopy(suggestion.thread.name),
        failed: "Couldn't move that",
        unfailed: "Couldn't put that back",
        retry: RETRY,
        place: { id: keyOf(entry), icon: "arrow-up-right", form: "slot" },
      },
      toast,
      writes,
    );
  }

  /** The cross: gone at once, no toast, and never offered again. */
  function dismiss(entry: LooseEntry): void {
    const suggestion = entry.suggestion;
    if (!suggestion) return;
    const key = keyOf(entry);
    void perform(
      {
        apply: () => setUnsuggested((held) => add(held, key)),
        revert: () => setUnsuggested((held) => take(held, key)),
        write: () => dismissSuggestion(suggestion.id),
        failed: "Couldn't dismiss that",
        retry: RETRY,
      },
      toast,
      writes,
    );
  }

  /** The thread is made and opens. Its word is the shell's, since this
   *  screen is under the thread by the time anybody reads it: in the first
   *  row's slot here, the others gone at once and back with the Undo. */
  function created(proposalId: string, thread: { id: string; name: string }, moved: readonly LooseEntry[]): void {
    setCreating(null);
    setDropped((held) => new Map([...held, ...moved.map((entry) => [keyOf(entry), entry] as const)]));
    router.push({ pathname: "/threads/[id]", params: { id: thread.id } });
    const first = moved[0];
    const place: Place = first
      ? { id: keyOf(first), icon: "lasso", form: "slot" }
      : { id: `created:${proposalId}`, icon: "lasso", form: "plate" };
    const undo = async (): Promise<void> => {
      const outcome = await undoProposal(proposalId);
      if (outcome === "ok") {
        router.dismissTo("/threads");
        await reload().catch(() => undefined);
      } else if (outcome === "refused") notify("Couldn't undo that", undefined, place);
      else notify("Couldn't put that back", { label: RETRY, onPress: undo }, place);
    };
    notify(`Created ${thread.name}`, { label: "Undo", onPress: undo }, place);
    void reload().catch(() => undefined);
  }

  // ------------------------------------------------------------ the sheets


  const live = (entries: LooseEntry[]): LooseEntry[] =>
    entries
      .filter((entry) => !dropped.has(keyOf(entry)))
      .map((entry) => {
        const key = keyOf(entry);
        const fields = drawn.get(key);
        const suggestion = unsuggested.has(key) ? null : entry.suggestion;
        if (entry.kind === "note") return { ...entry, note: { ...entry.note, ...(fields ?? {}) } as Note, suggestion };
        return { ...entry, row: { ...entry.row, ...(fields ?? {}) } as ContentRow, suggestion };
      });

  const dayOf = (iso: string) => dayIn(new Date(iso), zone);

  const row = (entry: LooseEntry, options: { border: boolean }) => {
    const content = entry.kind === "content" ? entry.row : noteRow(entry.note);
    const suggestion = entry.suggestion;
    return (
      <ContentRowView
        key={keyOf(entry)}
        row={content}
        border={options.border}
        meta={metaOf(entry, dayOf)}
        onToggle={entry.kind === "content" && entry.row.type === "task" ? () => tick(entry.row) : undefined}
        titleLines={1}
        muted={entry.kind === "note" && entry.note.muted}
        onEdit={() => (entry.kind === "note" ? setNoting(entry.note) : setRenaming(entry.row))}
        onDelete={() => remove(entry)}
        onRemoveAction={entry.kind === "content" ? (url) => removeAction(entry, url) : undefined}
        onOpenPhoto={
          entry.kind === "content" && entry.row.photo
            ? () =>
                // 041. A PDF opens itself; a photo, the viewer.
                entry.row.photo!.kind === "pdf" ? openPdf(entry.row.photo!, entry.row.title) : setViewing(entry.row)
            : undefined
        }
        below={
          suggestion ? (
            <SuggestionLine
              suggestion={suggestion}
              title={titleOf(entry)}
              onAccept={() => accept(entry)}
              onDismiss={() => dismiss(entry)}
            />
          ) : null
        }
      />
    );
  };

  const sheets = (
    <>
      {viewing?.photo ? (
        <PhotoViewer
          photos={[
            {
              blobId: viewing.photo.blobId,
              ready: viewing.photo.ready,
              width: viewing.photo.width ?? 0,
              height: viewing.photo.height ?? 0,
              title: viewing.title,
              body: viewing.body,
              row: viewing,
            },
          ]}
          index={0}
          onIndex={() => undefined}
          onClose={() => setViewing(null)}
          onMore={(one) => setRenaming(one)}
        />
      ) : null}
      <RowEditSheet
        key={renaming?.id ?? "none"}
        row={renaming}
        onClose={() => setRenaming(null)}
        onOpenPhoto={(held) => {
          setRenaming(null);
          // 041. A PDF opens itself; a photo, the viewer.
          if (held.photo?.kind === "pdf") openPdf(held.photo, held.title);
          else setViewing(held);
        }}
        onSave={(saved, fields) => {
          setRenaming(null);
          if (Object.keys(fields).length > 0) edit(saved, fields);
        }}
        onMove={(held) => setMoving({ kind: "content", row: held, suggestion: null })}
        onArchive={(held) => {
          setRenaming(null);
          archive(held);
        }}
        onRemove={(held) => {
          setRenaming(null);
          if (held.archivedAt) restore(held);
          else if (held.canDelete) remove({ kind: "content", row: held, suggestion: null });
          else archive(held);
        }}
      />
      {noting ? (
        <NoteEditor
          key={noting.id}
          note={noting}
          canDelete
          placeholder="What is worth remembering?"
          onSave={(text) => {
            setNoting(null);
            editNoteText(noting, text);
          }}
          onClose={() => setNoting(null)}
          onMute={() => {
            setNoting(null);
            mute(noting);
          }}
          onDelete={() => {
            setNoting(null);
            remove({ kind: "note", note: noting, suggestion: null });
          }}
          onMove={() => {
            setNoting(null);
            setMoving({ kind: "note", note: noting, suggestion: null });
          }}
        />
      ) : null}
      {/* The server leaves the default thread out of the list, so nothing
          here is moved into not being in a thread by hand. */}
      <MoveSheet
        open={moving !== null}
        exceptThreadId={null}
        onClose={() => setMoving(null)}
        onPick={(to) => {
          if (moving) move(moving, to);
        }}
      />
      {creating ? (
        <CreateThreadSheet
          key={creating}
          proposalId={creating}
          onClose={() => setCreating(null)}
          onCreated={(thread, moved) => created(creating, thread, moved)}
        />
      ) : null}
    </>
  );

  // An archived row put back leaves the archived list, not the counts.
  const left = [...dropped.values()].filter((entry) => !(entry.kind === "content" && entry.row.archivedAt));
  const less = <T extends Pick<LooseSummary, "count" | "byType">>(counts: T): T => withoutEntries(counts, left);

  return { live, less, row, sheets };
}
