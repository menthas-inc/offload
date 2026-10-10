"use client";

// 027. Today's rows act in place exactly as the thread page's do: the tick,
// the row's modal with When and Repeats, the label sheet, Archive and Delete,
// each drawn first and written second with the thread page's words and the
// eight-second Undo. One hook, used by To do and by open in your threads, so
// the two cannot drift from each other or from the thread page.

import { useCallback, useEffect, useState } from "react";
import { asksBeforeArchive, rowLabelledCopy, withMadeLabels } from "@offload/widgets";
import { Icon } from "../Icon";
import { useToast } from "../shell/Toast";
import { EditModal } from "../panes/EditModal";
import { rowIcon } from "../panes/Thread";
import type { RowHandlers } from "../panes/ContentRowView";
import { LabelPopover, type LabelChoice } from "../labels/LabelPopover";
import { createLabel, deleteLabel, type Label } from "../../lib/labels";
import { perform, useWrites } from "../../lib/optimistic";
import { useClock } from "../../lib/clock";
import { drawnEdit, undoOf } from "../../lib/row-edit";
import type { AgendaRow } from "../../lib/today";
import {
  completeContent,
  deleteContent,
  editContent,
  fetchThread,
  moveContent,
  setArchived,
  type ContentPatch,
  type ContentRow,
  type ContentSnapshot,
} from "../../lib/threads";
import pane from "../../app/(shell)/shell.module.css";

export interface TodayRows {
  /** The rows as drawn: changed fields applied, taken-out rows gone. */
  shown: <R extends AgendaRow>(rows: R[]) => R[];
  handlers: RowHandlers;
  lead: (row: ContentRow) => React.ReactNode;
  /** The modal and the label sheet, wherever the page puts them. */
  overlays: React.ReactNode;
  writes: ReturnType<typeof useWrites>;
}

export function useTodayRows(reload: () => Promise<void>, labels: Map<string, Label>): TodayRows {
  const toast = useToast();
  const { zone } = useClock();
  const [asking, setAsking] = useState<string | null>(null);
  // 2026-10-07. Archive hides a row for everyone in its thread. Today does
  // not know who else is in one, so a row that is not yours asks first.
  const [archiving, setArchiving] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<ContentRow | null>(null);
  // 2026-10-07. The open row's thread labels, for the dialog's Labels, read
  // when it opens since Today has no thread bundle. A row not in a thread
  // has none to offer.
  const [editLabels, setEditLabels] = useState<Label[] | undefined>(undefined);
  useEffect(() => {
    setEditLabels(undefined);
    const threadId = (editRow as AgendaRow | null)?.threadId;
    if (!threadId) return;
    let live = true;
    void fetchThread(threadId)
      .then((bundle) => {
        if (live && bundle) setEditLabels(bundle.labels);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [editRow]);
  const [labelling, setLabelling] = useState<{ row: ContentRow; anchor: HTMLElement; labels: Label[] } | null>(null);
  const [drawn, setDrawn] = useState<Map<string, Partial<AgendaRow>>>(new Map());
  const [dropped, setDropped] = useState<Set<string>>(new Set());

  const fresh = useCallback(async () => {
    await reload();
    setDrawn(new Map());
    setDropped(new Set());
  }, [reload]);
  const writes = useWrites(fresh);

  const patchRow = (id: string, patch: Partial<AgendaRow>) =>
    setDrawn((held) => new Map(held).set(id, { ...(held.get(id) ?? {}), ...patch }));
  const dropRow = (id: string) => setDropped((held) => new Set(held).add(id));
  const putRow = (id: string) =>
    setDropped((held) => {
      const next = new Set(held);
      next.delete(id);
      return next;
    });

  function tick(row: ContentRow): void {
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

  function archive(row: ContentRow): void {
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

  function remove(row: ContentRow): void {
    setAsking(null);
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

  function edit(row: ContentRow, patch: ContentPatch, made: string[] = []): void {
    const { drawn: next, before } = drawnEdit(row, patch, zone);
    const write = withMadeLabels<ContentPatch, ContentSnapshot>(
      {
        make: async (name) => {
          const created = await createLabel((row as AgendaRow).threadId, { name });
          return created.ok ? created.value.label.id : null;
        },
        edit: async (fields) => (await editContent(row.id, fields))?.previous ?? null,
        undo: undoOf,
        drop: (labelId) => deleteLabel(labelId),
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

  /** 028. Move, from the row's modal. The row stays on Today, since it is
   *  still due, and its thread pill names where it went. */
  function move(row: AgendaRow, to: { id: string; name: string }): void {
    void perform(
      {
        apply: () => patchRow(row.id, { threadId: to.id, threadName: to.name }),
        revert: () => patchRow(row.id, { threadId: row.threadId, threadName: row.threadName }),
        write: async () => (await moveContent(row.id, to.id)) !== null,
        unwrite: async () => (await moveContent(row.id, row.threadId)) !== null,
        did: `Moved to ${to.name}`,
        failed: "Couldn't move that",
        unfailed: "Couldn't put that back",
      },
      toast,
      writes,
    );
  }

  /** 025's label sheet. Today has no thread bundle, so the thread's labels
   *  are read when the tag is pressed. */
  async function openLabels(row: ContentRow, anchor: HTMLElement): Promise<void> {
    const thread = await fetchThread((row as AgendaRow).threadId).catch(() => null);
    if (!thread) {
      toast.show("Couldn't open that");
      return;
    }
    setLabelling({ row, anchor, labels: thread.labels });
  }

  function labelRow(row: ContentRow, threadLabels: Label[], choice: LabelChoice): void {
    setLabelling(null);
    const same = choice.made.length === 0 && choice.ids.length === row.labels.length && choice.ids.every((one) => row.labels.includes(one));
    if (same) return;
    const before = row.labels;
    const made: string[] = [];
    const names = [...threadLabels.filter((label) => choice.ids.includes(label.id)).map((label) => label.name), ...choice.made];
    void perform(
      {
        apply: () => patchRow(row.id, { labels: choice.ids }),
        revert: () => patchRow(row.id, { labels: before }),
        write: async () => {
          for (const name of choice.made) {
            const result = await createLabel((row as AgendaRow).threadId, { name });
            if (!result.ok) return false;
            made.push(result.value.label.id);
          }
          return (await editContent(row.id, { labels: [...choice.ids, ...made] })) !== null;
        },
        unwrite: async () => {
          const edited = await editContent(row.id, { labels: before });
          for (const labelId of made) await deleteLabel(labelId);
          return edited !== null;
        },
        did: rowLabelledCopy(row.title, names),
        failed: "Couldn't save that",
        unfailed: "Couldn't put it back",
      },
      toast,
      writes,
    );
  }

  const handlers: RowHandlers = {
    editing: null,
    draft: "",
    asking,
    arrived: new Set(),
    onDraft: () => undefined,
    onEdit: (row) => setEditRow(row),
    onSaveTitle: () => undefined,
    onStopEditing: () => undefined,
    onArchive: (row) => {
      if (asksBeforeArchive(row, null)) setArchiving(row.id);
      else archive(row);
    },
    archiving,
    onArchiveAsk: setArchiving,
    onArchiveNow: (row) => {
      setArchiving(null);
      archive(row);
    },
    onAsk: setAsking,
    onDelete: remove,
    labels,
    onLabel: (row, anchor) => void openLabels(row, anchor),
  };

  const lead = (row: ContentRow) => {
    if (row.type !== "task") {
      return (
        <span className={pane.rowIcon}>
          <Icon name={rowIcon(row.type)} size={18} />
        </span>
      );
    }
    const done = row.doneAt !== null;
    return (
      <input
        type="checkbox"
        className={pane.rowCheck}
        checked={done}
        onChange={() => tick(row)}
        aria-label={done ? `Put ${row.title} back on the list` : `Finish ${row.title}`}
      />
    );
  };

  const shown = <R extends AgendaRow>(rows: R[]): R[] =>
    rows.filter((row) => !dropped.has(row.id)).map((row) => ({ ...row, ...(drawn.get(row.id) ?? {}) }));

  const overlays = (
    <>
      {editRow ? (
        <EditModal
          key={editRow.id}
          row={editRow}
          threadId={(editRow as AgendaRow).threadId}
          labels={editLabels}
          onClose={() => setEditRow(null)}
          onSave={(row, patch, made) => {
            setEditRow(null);
            if (Object.keys(patch).length === 1 && patch.labels && editLabels) {
              labelRow(row, editLabels, { ids: patch.labels, made });
            } else edit(row, patch, made);
          }}
          onMove={(row, to) => {
            setEditRow(null);
            move(row as AgendaRow, to);
          }}
        />
      ) : null}
      {labelling ? (
        <LabelPopover
          anchor={labelling.anchor}
          title={labelling.row.title}
          labels={labelling.labels}
          carried={labelling.row.labels}
          onDone={(choice) => labelRow(labelling.row, labelling.labels, choice)}
          onClose={() => setLabelling(null)}
        />
      ) : null}
    </>
  );

  return { shown, handlers, lead, overlays, writes };
}
