// 028. The rows of what is not in a thread, acting in place.
//
// My threads' group and the full list draw the same rows with the same
// sheets, so both take them from here, as Today takes its rows from
// `useTodayRows`. A row is the thread page's content row with no thread slot,
// no labels and no handle, its meta, and its suggestion under it. A tap opens
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
import { RowActionSheet, type RowAction } from "../shell/RowActionSheet";
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
  moveContent,
  muteNote,
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
  type LooseItem,
} from "../../lib/loose";
import { perform, useWrites, type Reversible } from "../../lib/optimistic";
import { useClock } from "../../lib/clock";
import { drawnWhen } from "../../lib/when";

/** 028's failures say Try again. */
const RETRY = "Try again";

export function useLooseRows(
  /** What the screen last read. A new read clears what was drawn ahead of it. */
  source: unknown,
  reload: () => Promise<void>,
  toast: ToastState,
): {
  /** The rows as drawn, with what the screen has drawn ahead of the server. */
  live: (items: LooseItem[]) => LooseItem[];
  /** How many have left since the last read, for the heading's count. */
  gone: number;
  row: (item: LooseItem, options: { border: boolean }) => ReactNode;
  sheets: ReactNode;
} {
  const router = useRouter();
  const { notify } = useConversation();
  const { zone, today } = useClock();
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [unsuggested, setUnsuggested] = useState<Set<string>>(new Set());
  const [drawn, setDrawn] = useState<Map<string, Partial<ContentRow> & Partial<Note>>>(new Map());
  const [renaming, setRenaming] = useState<ContentRow | null>(null);
  const [noting, setNoting] = useState<Note | null>(null);
  const [acting, setActing] = useState<LooseItem | null>(null);
  const [moving, setMoving] = useState<LooseItem | null>(null);
  const [viewing, setViewing] = useState<ContentRow | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  useEffect(() => {
    setDropped(new Set());
    setUnsuggested(new Set());
    setDrawn(new Map());
  }, [source]);
  const writes = useWrites(reload);

  const add = (set: Set<string>, key: string) => new Set(set).add(key);
  const take = (set: Set<string>, key: string) => {
    const next = new Set(set);
    next.delete(key);
    return next;
  };
  const drop = (key: string) => setDropped((held) => add(held, key));
  const put = (key: string) => setDropped((held) => take(held, key));
  const patch = (key: string, fields: Partial<ContentRow> & Partial<Note>) =>
    setDrawn((held) => new Map(held).set(key, { ...(held.get(key) ?? {}), ...fields }));

  // ------------------------------------------------------------ the writes

  function remove(item: LooseItem): void {
    const key = keyOf(item);
    setViewing(null);
    if (item.kind === "note") {
      void perform(
        {
          apply: () => drop(key),
          revert: () => put(key),
          write: () => deleteNote(item.note.id),
          unwrite: () => restoreNote(item.note.id),
          did: "Note deleted",
          failed: "Couldn't delete the note",
          unfailed: "Couldn't put the note back",
        },
        toast,
        writes,
      );
      return;
    }
    const row = item.row;
    void perform(
      {
        apply: () => drop(key),
        revert: () => put(key),
        write: async () => {
          const ok = await deleteContent(row.id);
          if (ok && row.photo) forgetRendition(row.photo.blobId);
          return ok;
        },
        unwrite: () => setArchived(row.id, false),
        did: "Deleted, gone in a moment",
        failed: "Couldn't delete that",
        unfailed: "Couldn't put that back",
      },
      toast,
      writes,
    );
  }

  /** An archived row back with the rest, from the foot row's list. */
  function restore(row: ContentRow): void {
    const key = `c:${row.id}`;
    void perform(
      {
        apply: () => drop(key),
        revert: () => put(key),
        write: () => setArchived(row.id, false),
        unwrite: () => setArchived(row.id, true),
        did: "Put back",
        failed: "Couldn't put that back",
        unfailed: "Couldn't archive that",
      },
      toast,
      writes,
    );
  }

  function archive(row: ContentRow): void {
    const key = `c:${row.id}`;
    void perform(
      {
        apply: () => drop(key),
        revert: () => put(key),
        write: () => setArchived(row.id, true),
        unwrite: () => setArchived(row.id, false),
        did: "Archived",
        failed: "Couldn't archive that",
        unfailed: "Couldn't put that back",
      },
      toast,
      writes,
    );
  }

  function tick(row: ContentRow): void {
    const key = `c:${row.id}`;
    const wasDone = row.doneAt !== null;
    void perform(
      {
        apply: () => patch(key, { doneAt: wasDone ? null : new Date().toISOString() }),
        revert: () => patch(key, { doneAt: row.doneAt }),
        write: () => completeContent(row.id, !wasDone),
        failed: wasDone ? "Couldn't put that back" : "Couldn't tick that off",
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
    if (fields.isReminder !== undefined) next.isReminder = fields.isReminder;
    Object.assign(next, drawnWhen(fields, zone));
    const before: Partial<ContentRow> = {
      title: row.title,
      isReminder: row.isReminder,
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
        unwrite: async () => (previous ? (await editContent(row.id, previous)) !== null : false),
        did: "Saved",
        failed: "Couldn't save that",
        unfailed: "Couldn't put it back",
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
  function move(item: LooseItem, to: ThreadRow): void {
    setMoving(null);
    setViewing(null);
    const key = keyOf(item);
    let home: string | null = null;
    const op: Reversible = {
      apply: () => drop(key),
      revert: () => put(key),
      write: async () => {
        if (item.kind === "content") {
          home = (await moveContent(item.row.id, to.id))?.previous.threadId ?? null;
          return home !== null;
        }
        const moved = await moveNote(item.note.id, to.id);
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
        if (item.kind === "content") return (await moveContent(item.row.id, home)) !== null;
        const back = await moveNote(item.note.id, home);
        return back !== null && back !== "duplicate";
      },
      did: movedCopy(to.name),
      failed: "Couldn't move that",
      unfailed: "Couldn't put that back",
      retry: RETRY,
    };
    void perform(op, toast, writes);
  }

  /** Move to: at once, with Undo, which brings the row back with its
   *  suggestion. A refusal (the row already left, on another device) puts it
   *  back with a word, and the reload after it shows where it now is. */
  function accept(item: LooseItem): void {
    const suggestion = item.suggestion;
    if (!suggestion) return;
    if (suggestion.kind === "create") {
      setCreating(suggestion.proposal.id);
      return;
    }
    const key = keyOf(item);
    void perform(
      {
        apply: () => drop(key),
        revert: () => put(key),
        write: () => acceptSuggestion(suggestion.id).then((thread) => thread !== null),
        unwrite: () => undoSuggestion(suggestion.id).then((outcome) => outcome === "ok"),
        did: movedCopy(suggestion.thread.name),
        failed: "Couldn't move that",
        unfailed: "Couldn't put that back",
        retry: RETRY,
      },
      toast,
      writes,
    );
  }

  /** The cross: gone at once, no toast, and never offered again. */
  function dismiss(item: LooseItem): void {
    const suggestion = item.suggestion;
    if (!suggestion) return;
    const key = keyOf(item);
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

  /** The thread is made and opens. Its toast is the shell's, since this
   *  screen is under the thread by the time anybody reads it. */
  function created(proposalId: string, thread: { id: string; name: string }, moved: ReadonlySet<string>): void {
    setCreating(null);
    setDropped((held) => new Set([...held, ...moved]));
    router.push({ pathname: "/threads/[id]", params: { id: thread.id } });
    const undo = async (): Promise<void> => {
      const outcome = await undoProposal(proposalId);
      if (outcome === "ok") {
        router.dismissTo("/threads");
        await reload().catch(() => undefined);
      } else if (outcome === "refused") notify("Couldn't undo that");
      else notify("Couldn't put that back", { label: RETRY, onPress: undo });
    };
    notify(`Created ${thread.name}`, { label: "Undo", onPress: undo });
    void reload().catch(() => undefined);
  }

  // ------------------------------------------------------------ the sheets

  const actions: RowAction[] = !acting
    ? []
    : acting.kind === "note"
      ? [
          { label: "Edit", icon: "pencil", run: () => setNoting(acting.note) },
          { label: "Move", icon: "layers", run: () => setMoving(acting) },
          { label: "Delete", icon: "trash-2", danger: true, run: () => remove(acting) },
        ]
      : acting.row.archivedAt
        ? [{ label: "Put back", icon: "rewind", run: () => restore(acting.row) }]
        : [
            { label: "Edit", icon: "pencil", run: () => setRenaming(acting.row) },
            ...(acting.row.canMove ? [{ label: "Move", icon: "layers", run: () => setMoving(acting) }] : []),
            ...(acting.row.photo
              ? []
              : [
                  {
                    label: acting.row.doneAt ? "Mark not done" : "Mark done",
                    icon: acting.row.doneAt ? "rewind" : "check",
                    run: () => tick(acting.row),
                  },
                ]),
            acting.row.canDelete
              ? { label: "Delete", icon: "trash-2", danger: true, run: () => remove(acting) }
              : { label: "Archive", icon: "archive", run: () => archive(acting.row) },
          ];

  const live = (items: LooseItem[]): LooseItem[] =>
    items
      .filter((item) => !dropped.has(keyOf(item)))
      .map((item) => {
        const key = keyOf(item);
        const fields = drawn.get(key);
        const suggestion = unsuggested.has(key) ? null : item.suggestion;
        if (item.kind === "note") return { ...item, note: { ...item.note, ...(fields ?? {}) } as Note, suggestion };
        return { ...item, row: { ...item.row, ...(fields ?? {}) } as ContentRow, suggestion };
      });

  const dayOf = (iso: string) => dayIn(new Date(iso), zone);

  const row = (item: LooseItem, options: { border: boolean }) => {
    const content = item.kind === "content" ? item.row : noteRow(item.note);
    const suggestion = item.suggestion;
    return (
      <ContentRowView
        key={keyOf(item)}
        row={content}
        border={options.border}
        meta={metaOf(item, today, dayOf)}
        titleLines={1}
        muted={item.kind === "note" && item.note.muted}
        onEdit={() => (item.kind === "note" ? setNoting(item.note) : setRenaming(item.row))}
        onActions={() => setActing(item)}
        onDelete={() => remove(item)}
        onOpenPhoto={item.kind === "content" && item.row.photo ? () => setViewing(item.row) : undefined}
        below={
          suggestion ? (
            <SuggestionLine
              suggestion={suggestion}
              title={titleOf(item)}
              onAccept={() => accept(item)}
              onDismiss={() => dismiss(item)}
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
              width: viewing.photo.width,
              height: viewing.photo.height,
              title: viewing.title,
              body: viewing.body,
              row: viewing,
            },
          ]}
          index={0}
          onIndex={() => undefined}
          onClose={() => setViewing(null)}
          onMore={(one) => setActing({ kind: "content", row: one, suggestion: null })}
        />
      ) : null}
      <RowEditSheet
        key={renaming?.id ?? "none"}
        row={renaming}
        onClose={() => setRenaming(null)}
        onSave={(saved, fields) => {
          setRenaming(null);
          if (Object.keys(fields).length > 0) edit(saved, fields);
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
      <RowActionSheet open={acting !== null} actions={actions} onClose={() => setActing(null)} />
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

  return { live, gone: dropped.size, row, sheets };
}
