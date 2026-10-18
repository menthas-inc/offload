// Today's rows, acting in place. 027, from 024's agenda hook.
//
// The thread page's own row with its chip, its checkbox and its tools, and the
// thread as a pill on its marks line. Every control acts here, drawn first and
// written second with the same sheets, the same words and the same Undo the
// thread page has. The row sheet carries its Labels panel, from the row's own
// thread, which 024's Today left out. Open in your threads opens the same
// sheet from its rows, and ticks through the same writes.
//
// A hook rather than a component because the sheets are absolute overlays and
// the list scrolls: the screen puts the rows in its scroll view and the sheets
// beside it, from one piece of state.

import { useEffect, useState, type ReactNode } from "react";
import { ContentRowView } from "../shell/ContentRow";
import { RowEditSheet } from "../shell/RowEditSheet";
import { MoveSheet } from "../shell/MoveSheet";
import { ConfirmSheet } from "../people/ConfirmSheet";
import { ARCHIVE_SHARED, archiveAsk, asksBeforeArchive } from "@offload/widgets";
import type { ToastState } from "../shell/Toast";
import { completeContent, deleteContent, editContent, fetchThread, moveContent, setArchived, type ContentPatch, type ContentRow, type ContentSnapshot } from "../../lib/threads";
import { createLabel, deleteLabel, withMadeLabels, type Label } from "../../lib/labels";
import { perform, useWrites } from "../../lib/optimistic";
import { useClock } from "../../lib/clock";
import { useColors } from "../../lib/colors";
import { drawnWhen } from "../../lib/when";
import { drawnRemind, undoPatch } from "../../lib/reminders";
import type { Day, TodayRow } from "../../lib/today";

export interface RowOptions {
  border: boolean;
  chip: "date" | "time" | "none";
  /** 042. The day an undated task is reminded against, as its chip. */
  by?: string | undefined;
}

export function useTodayRows(
  day: Day | null,
  onChanged: () => void,
  toast: ToastState,
): {
  /** The row as drawn: with what the screen has drawn ahead of the server. */
  live: <T extends TodayRow>(rows: T[]) => T[];
  row: (row: TodayRow, options: RowOptions) => ReactNode;
  /** The row sheet, for a row drawn somewhere else on Today. */
  open: (row: TodayRow) => void;
  /** Today's writes in flight; the day reads again when they settle. */
  writes: ReturnType<typeof useWrites>;
  sheets: ReactNode;
} {
  const COLOR = useColors();
  const { zone } = useClock();
  const [drawn, setDrawn] = useState<Map<string, Partial<TodayRow>>>(new Map());
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<TodayRow | null>(null);
  const [labels, setLabels] = useState<Label[] | undefined>(undefined);
  const [moving, setMoving] = useState<TodayRow | null>(null);
  useEffect(() => {
    setDrawn(new Map());
    setDropped(new Set());
  }, [day]);
  // The open row's thread labels, for the sheet's Labels panel.
  useEffect(() => {
    setLabels(undefined);
    // 028. A row not in a thread has no thread's labels to offer.
    if (!renaming || renaming.threadName === null) return;
    let live = true;
    void fetchThread(renaming.threadId).then((bundle) => {
      if (live && bundle) setLabels(bundle.labels);
    });
    return () => {
      live = false;
    };
  }, [renaming]);
  const writes = useWrites(async () => {
    onChanged();
  });

  const patchRow = (id: string, patch: Partial<TodayRow>) =>
    setDrawn((held) => new Map(held).set(id, { ...(held.get(id) ?? {}), ...patch }));
  const dropRow = (id: string) => setDropped((held) => new Set(held).add(id));
  const putRow = (id: string) =>
    setDropped((held) => {
      const next = new Set(held);
      next.delete(id);
      return next;
    });

  /** 2026-10-18. A tick takes the row out of the day with Undo in its slot,
   *  as Open in your threads does. Putting a finished row back has no Undo:
   *  the box is its own. */
  function tick(row: TodayRow): void {
    if (row.doneAt === null) {
      void perform(
        {
          apply: () => dropRow(row.id),
          revert: () => putRow(row.id),
          write: () => completeContent(row.id, true),
          unwrite: () => completeContent(row.id, false),
          did: "Ticked off",
          failed: "Couldn't tick that off",
          unfailed: "Couldn't put that back",
          place: { id: row.id, icon: "check", form: "slot" },
        },
        toast,
        writes,
      );
      return;
    }
    void perform(
      {
        apply: () => patchRow(row.id, { doneAt: null }),
        revert: () => patchRow(row.id, { doneAt: row.doneAt }),
        write: () => completeContent(row.id, false),
        failed: "Couldn't put that back",
      },
      toast,
      writes,
    );
  }

  /** 2026-10-07. Archive hides a row for everyone in its thread. Today does
   *  not know who else is in one, so a row that is not yours asks first. */
  const [archiving, setArchiving] = useState<TodayRow | null>(null);
  function askArchive(row: TodayRow): void {
    if (asksBeforeArchive(row, null)) setArchiving(row);
    else archive(row);
  }

  function archive(row: TodayRow): void {
    const wasArchived = row.archivedAt !== null;
    void perform(
      {
        apply: () => dropRow(row.id),
        revert: () => putRow(row.id),
        write: () => setArchived(row.id, !wasArchived),
        unwrite: () => setArchived(row.id, wasArchived),
        did: wasArchived ? "Back in the thread" : "Archived",
        failed: wasArchived ? "Couldn't put that back" : "Couldn't archive that",
        unfailed: wasArchived ? "Couldn't archive that" : "Couldn't put that back",
        place: { id: row.id, icon: "archive", form: "slot" },
      },
      toast,
      writes,
    );
  }

  function remove(row: TodayRow): void {
    void perform(
      {
        apply: () => dropRow(row.id),
        revert: () => putRow(row.id),
        write: () => deleteContent(row.id),
        unwrite: () => setArchived(row.id, false),
        did: "Deleted, gone in a moment",
        failed: "Couldn't delete that",
        unfailed: "Couldn't put that back",
        place: { id: row.id, icon: "trash-2", form: "slot" },
      },
      toast,
      writes,
    );
  }

  function edit(row: ContentRow, patch: ContentPatch, made: string[], threadId: string): void {
    const next: Partial<ContentRow> = {};
    if (patch.title !== undefined) next.title = patch.title;
    if (patch.body !== undefined) next.body = patch.body;
    // 042. The switch's part: a stop draws isReminder off with it.
    Object.assign(next, drawnRemind(patch));
    if (patch.labels !== undefined) next.labels = patch.labels;
    Object.assign(next, drawnWhen(patch, zone));
    const before: Partial<ContentRow> = {
      title: row.title,
      body: row.body,
      isReminder: row.isReminder,
      reminders: row.reminders,
      dueAt: row.dueAt,
      occursAt: row.occursAt,
      occursEndAt: row.occursEndAt,
      rrule: row.rrule,
      allDay: row.allDay,
      labels: row.labels,
    };
    const write = withMadeLabels<ContentPatch, ContentSnapshot>(
      {
        make: async (name) => {
          const created = await createLabel(threadId, { name });
          return created.ok ? created.value.label.id : null;
        },
        edit: async (fields) => {
          const result = await editContent(row.id, fields);
          return result ? result.previous : null;
        },
        undo: (previous) => undoPatch(previous),
        drop: (id) => deleteLabel(id),
      },
      patch,
      made,
    );
    void perform(
      {
        apply: () => patchRow(row.id, next),
        revert: () => patchRow(row.id, before),
        write: write.write,
        unwrite: write.unwrite,
        did: "Saved",
        failed: "Couldn't save that",
        unfailed: "Couldn't put it back",
        place: { id: row.id, icon: "pencil", form: "under" },
      },
      toast,
      writes,
    );
  }

  /** 2026-10-12. Move, from the row's sheet. A row moved from Today is still
   *  due today, so it keeps its place and changes its pill at the press; the
   *  pill comes back if the server refuses, and Undo is the same move back. */
  function move(row: TodayRow, to: { id: string; name: string }): void {
    setMoving(null);
    void perform(
      {
        apply: () => patchRow(row.id, { threadId: to.id, threadName: to.name, threadIcon: null, threadHue: null }),
        revert: () => patchRow(row.id, { threadId: row.threadId, threadName: row.threadName, threadIcon: row.threadIcon, threadHue: row.threadHue }),
        write: async () => (await moveContent(row.id, to.id)) !== null,
        unwrite: async () => (await moveContent(row.id, row.threadId)) !== null,
        did: `Moved to ${to.name}`,
        failed: "Couldn't move that",
        unfailed: "Couldn't put it back",
        // It stays on Today with its new pill, so its line is under it.
        place: { id: row.id, icon: "arrow-up-right", form: "under" },
      },
      toast,
      writes,
    );
  }

  const live = <T extends TodayRow>(rows: T[]): T[] =>
    rows.filter((row) => !dropped.has(row.id)).map((row) => ({ ...row, ...(drawn.get(row.id) ?? {}) }) as T);

  const row = (item: TodayRow, options: RowOptions) => (
    <ContentRowView
      key={item.id}
      row={item}
      border={options.border}
      chip={options.chip}
      by={options.by}
      ground={COLOR.fill}
      dense
      thread={{ id: item.threadId, name: item.threadName, icon: item.threadIcon, hue: item.threadHue }}
      // 028. A row not in a thread keeps any old labels stored and draws none.
      metaMarks={
        item.threadName === null
          ? []
          : item.labels.flatMap((labelId) => (day?.threadLabels ?? []).filter((label) => label.id === labelId))
      }
      onToggle={item.type === "task" ? () => tick(item) : undefined}
      onEdit={() => setRenaming(item)}
      onDelete={() => remove(item)}
    />
  );

  const sheets = (
    <>
      <RowEditSheet
        key={renaming?.id ?? "none"}
        row={renaming}
        labels={labels}
        onClose={() => setRenaming(null)}
        onSave={(saved, patch, made) => {
          const threadId = renaming?.threadId;
          setRenaming(null);
          if (threadId) edit(saved, patch, made, threadId);
        }}
        onArchive={() => {
          const held = renaming;
          setRenaming(null);
          if (held) askArchive(held);
        }}
        onRemove={() => {
          const held = renaming;
          setRenaming(null);
          if (!held) return;
          if (held.canDelete && held.archivedAt === null) remove(held);
          else askArchive(held);
        }}
        onMove={(row) => setMoving(row as TodayRow)}
      />
      <MoveSheet
        open={moving !== null}
        exceptThreadId={moving?.threadId ?? null}
        onClose={() => setMoving(null)}
        onPick={(thread) => {
          if (moving) move(moving, thread);
        }}
      />
      <ConfirmSheet
        open={archiving !== null}
        title={archiveAsk(archiving?.title ?? "")}
        body={ARCHIVE_SHARED}
        action="Archive"
        danger
        onConfirm={() => {
          const held = archiving;
          setArchiving(null);
          if (held) archive(held);
        }}
        onClose={() => setArchiving(null)}
      />
    </>
  );

  return { live, row, open: setRenaming, writes, sheets };
}
