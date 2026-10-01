// Today's rows, acting in place. 027, from 024's agenda hook.
//
// The thread page's own row with its chip, its checkbox and its tools, and the
// thread as a pill on its marks line. Every control acts here, drawn first and
// written second with the same sheets, the same words and the same Undo the
// thread page has. The row sheet carries its Labels panel, from the row's own
// thread, which 024's Today left out. + Today is here too, since a pick is a
// row that leaves the picks for To do.
//
// A hook rather than a component because the sheets are absolute overlays and
// the list scrolls: the screen puts the rows in its scroll view and the sheets
// beside it, from one piece of state.

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { ContentRowView } from "../shell/ContentRow";
import { RowEditSheet } from "../shell/RowEditSheet";
import { RowActionSheet, type RowAction } from "../shell/RowActionSheet";
import type { ToastState } from "../shell/Toast";
import { completeContent, deleteContent, editContent, fetchThread, setArchived, type ContentPatch, type ContentRow, type ContentSnapshot } from "../../lib/threads";
import { createLabel, deleteLabel, withMadeLabels, type Label } from "../../lib/labels";
import { perform, useWrites } from "../../lib/optimistic";
import { useClock } from "../../lib/clock";
import { useColors } from "../../lib/colors";
import { drawnWhen } from "../../lib/when";
import { takeToday, untakeToday, type Day, type TodayRow } from "../../lib/today";
import { openThreadLabel, threadHref } from "../../lib/loose";

export interface RowOptions {
  border: boolean;
  chip: "date" | "time" | "none";
  /** + Today on a pick. */
  trailing?: ReactNode;
}

export function useTodayRows(
  day: Day | null,
  onChanged: () => void,
  toast: ToastState,
): {
  /** The row as drawn: with what the screen has drawn ahead of the server. */
  live: (rows: TodayRow[]) => TodayRow[];
  row: (row: TodayRow, options: RowOptions) => ReactNode;
  /** + Today on a pick. */
  take: (row: TodayRow) => void;
  /** Picks taken this load, drawn in To do before the server says so. */
  taken: Set<string>;
  sheets: ReactNode;
} {
  const router = useRouter();
  const COLOR = useColors();
  const { zone, today } = useClock();
  const [drawn, setDrawn] = useState<Map<string, Partial<TodayRow>>>(new Map());
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<TodayRow | null>(null);
  const [labels, setLabels] = useState<Label[] | undefined>(undefined);
  const [acting, setActing] = useState<TodayRow | null>(null);
  useEffect(() => {
    setDrawn(new Map());
    setDropped(new Set());
    setTaken(new Set());
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

  function tick(row: TodayRow): void {
    const wasDone = row.doneAt !== null;
    void perform(
      {
        apply: () => patchRow(row.id, { doneAt: wasDone ? null : new Date().toISOString() }),
        revert: () => patchRow(row.id, { doneAt: row.doneAt }),
        write: () => completeContent(row.id, !wasDone),
        failed: wasDone ? "Couldn't put that back" : "Couldn't tick that off",
      },
      toast,
      writes,
    );
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
      },
      toast,
      writes,
    );
  }

  function edit(row: ContentRow, patch: ContentPatch, made: string[], threadId: string): void {
    const next: Partial<ContentRow> = {};
    if (patch.title !== undefined) next.title = patch.title;
    if (patch.body !== undefined) next.body = patch.body;
    if (patch.isReminder !== undefined) next.isReminder = patch.isReminder;
    if (patch.labels !== undefined) next.labels = patch.labels;
    Object.assign(next, drawnWhen(patch, zone));
    const before: Partial<ContentRow> = {
      title: row.title,
      body: row.body,
      isReminder: row.isReminder,
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
        undo: (previous) => previous,
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
      },
      toast,
      writes,
    );
  }

  /** + Today: the row moves into To do at the press, as a day with no hour. */
  function take(row: TodayRow): void {
    void perform(
      {
        apply: () => {
          setTaken((held) => new Set(held).add(row.id));
          patchRow(row.id, { dueAt: `${today}T12:00:00.000Z`, allDay: true });
        },
        revert: () => {
          setTaken((held) => {
            const next = new Set(held);
            next.delete(row.id);
            return next;
          });
          patchRow(row.id, { dueAt: null, allDay: false });
        },
        write: () => takeToday(row.id),
        unwrite: () => untakeToday(row.id),
        did: "Added to today",
        failed: "Couldn't save that",
        unfailed: "Couldn't put it back",
      },
      toast,
      writes,
    );
  }

  const actions: RowAction[] = acting
    ? [
        { label: "Edit", icon: "pencil", run: () => setRenaming(acting) },
        ...(acting.photo
          ? []
          : [{ label: acting.doneAt ? "Mark not done" : "Mark done", icon: acting.doneAt ? "rewind" : "check", run: () => tick(acting) }]),
        // 028. A row not in a thread opens Not in a thread.
        { label: openThreadLabel(acting.threadName), icon: "message-circle", run: () => router.push(threadHref(acting.threadId, acting.threadName)) },
        ...(acting.archivedAt
          ? [{ label: "Put back in the thread", icon: "rewind", run: () => archive(acting) }]
          : acting.canDelete
            ? [{ label: "Delete", icon: "trash-2", danger: true, run: () => remove(acting) }]
            : [{ label: "Archive", icon: "archive", run: () => archive(acting) }]),
      ]
    : [];

  const live = (rows: TodayRow[]) =>
    rows.filter((row) => !dropped.has(row.id)).map((row) => ({ ...row, ...(drawn.get(row.id) ?? {}) }) as TodayRow);

  const row = (item: TodayRow, options: RowOptions) => (
    <ContentRowView
      key={item.id}
      row={item}
      border={options.border}
      chip={options.chip}
      trailing={options.trailing}
      ground={COLOR.fill}
      dense
      thread={{ id: item.threadId, name: item.threadName }}
      // 028. A row not in a thread keeps any old labels stored and draws none.
      metaMarks={
        item.threadName === null
          ? []
          : item.labels.flatMap((labelId) => (day?.threadLabels ?? []).filter((label) => label.id === labelId))
      }
      onToggle={item.type === "task" ? () => tick(item) : undefined}
      onEdit={() => setRenaming(item)}
      onActions={() => setActing(item)}
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
        onRemove={() => {
          const held = renaming;
          setRenaming(null);
          if (!held) return;
          if (held.canDelete && held.archivedAt === null) remove(held);
          else archive(held);
        }}
      />
      <RowActionSheet open={acting !== null} actions={actions} onClose={() => setActing(null)} />
    </>
  );

  return { live, row, take, taken, sheets };
}
