// Today's three groups. 024.
//
// The thread page's own row, with its chip, its checkbox and its two
// controls, and the thread's name as the row's meta. Every control acts
// here, drawn first and written second with the same sheets, the same words
// and the same Undo the thread page has: a tick, the pencil into the edit
// sheet, the long press into the action sheet, and the swipe's Archive and
// Delete. The client review of 2026-09-22 found four controls and a
// destructive swipe that all navigated instead, while the web acted in
// place, so the same row behaved three ways on three surfaces.
//
// A hook rather than one component because the sheets are absolute
// overlays and the list scrolls: the screen puts the list inside its scroll
// view and the sheets beside it, from one piece of state.

import { useEffect, useState, type ReactNode } from "react";
import { Platform, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ContentRowView } from "../shell/ContentRow";
import { RowEditSheet } from "../shell/RowEditSheet";
import { RowActionSheet, type RowAction } from "../shell/RowActionSheet";
import type { ToastState } from "../shell/Toast";
import { completeContent, deleteContent, editContent, setArchived, type ContentPatch, type ContentRow, type ContentSnapshot } from "../../lib/threads";
import { perform, useWrites } from "../../lib/optimistic";
import { useClock } from "../../lib/clock";
import { drawnWhen } from "../../lib/when";
import { groupsOf, type Agenda, type AgendaRow } from "../../lib/agenda";

const isAndroid = Platform.OS === "android";

export function useTodayAgenda(agenda: Agenda | null, onChanged: () => void, toast: ToastState): { list: ReactNode; sheets: ReactNode } {
  const router = useRouter();
  const { zone } = useClock();
  // What the screen has drawn ahead of the server: a changed field, or a row
  // taken out of its list. Cleared when the agenda comes back fresh.
  const [drawn, setDrawn] = useState<Map<string, Partial<AgendaRow>>>(new Map());
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<AgendaRow | null>(null);
  const [acting, setActing] = useState<AgendaRow | null>(null);
  useEffect(() => {
    setDrawn(new Map());
    setDropped(new Set());
  }, [agenda]);
  const writes = useWrites(async () => {
    onChanged();
  });

  const patchRow = (id: string, patch: Partial<AgendaRow>) =>
    setDrawn((held) => new Map(held).set(id, { ...(held.get(id) ?? {}), ...patch }));
  const dropRow = (id: string) => setDropped((held) => new Set(held).add(id));
  const putRow = (id: string) =>
    setDropped((held) => {
      const next = new Set(held);
      next.delete(id);
      return next;
    });

  const open = (row: AgendaRow) => router.push({ pathname: "/threads/[id]", params: { id: row.threadId } });

  /** Tick, or put it back. The box moves at the press. No toast for a tick
   *  that lands: the box is its own undo. */
  function tick(row: AgendaRow): void {
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

  function archive(row: AgendaRow): void {
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

  function remove(row: AgendaRow): void {
    void perform(
      {
        apply: () => dropRow(row.id),
        revert: () => putRow(row.id),
        write: () => deleteContent(row.id),
        // Restore is the undo for delete as well as for archive: one endpoint
        // clears `deleted_at`, `purge_after` and `archived_at` together.
        unwrite: () => setArchived(row.id, false),
        did: "Deleted, gone in a moment",
        failed: "Couldn't delete that",
        unfailed: "Couldn't put that back",
      },
      toast,
      writes,
    );
  }

  /** The sheet's Save: every changed field in one request, drawn first and
   *  sent second, with the previous values as the Undo. */
  function edit(row: ContentRow, patch: ContentPatch): void {
    const next: Partial<ContentRow> = {};
    if (patch.title !== undefined) next.title = patch.title;
    if (patch.body !== undefined) next.body = patch.body;
    if (patch.isReminder !== undefined) next.isReminder = patch.isReminder;
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
    };
    let previous: ContentSnapshot | null = null;
    void perform(
      {
        apply: () => patchRow(row.id, next),
        revert: () => patchRow(row.id, before),
        write: () =>
          editContent(row.id, patch).then((result) => {
            if (!result) return false;
            previous = result.previous;
            return true;
          }),
        unwrite: () => (previous ? editContent(row.id, previous) : Promise.resolve(null)).then((result) => result !== null),
        did: "Saved",
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
        { label: "Open the thread", icon: "message-circle", run: () => open(acting) },
        // One way out, never two, on the thread page's rule: your own row
        // offers Delete, somebody else's offers Archive.
        ...(acting.archivedAt
          ? [{ label: "Put back in the thread", icon: "rewind", run: () => archive(acting) }]
          : acting.canDelete
            ? [{ label: "Delete", icon: "trash-2", danger: true, run: () => remove(acting) }]
            : [{ label: "Archive", icon: "archive", run: () => archive(acting) }]),
      ]
    : [];

  const list =
    agenda === null ? null : (
      <View className="gap-space-6">
        {groupsOf(agenda).map((group) => {
          const rows = group.rows.filter((row) => !dropped.has(row.id)).map((row) => ({ ...row, ...(drawn.get(row.id) ?? {}) }));
          if (rows.length === 0) return null;
          return (
            <View key={group.key}>
              <Text className={`pb-space-2 font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 17 }}>
                {group.label}
              </Text>
              <View className={`overflow-hidden rounded-lg ${isAndroid ? "bg-a-c-low" : "bg-surface-fill"}`}>
                {rows.map((row, index) => (
                  <ContentRowView
                    key={row.id}
                    row={row}
                    border={index < rows.length - 1}
                    meta={row.threadName}
                    metaMarks={row.labels.flatMap((labelId) => agenda.threadLabels.filter((label) => label.id === labelId))}
                    onToggle={row.type === "task" ? () => tick(row) : undefined}
                    onEdit={() => setRenaming(row)}
                    onActions={() => setActing(row)}
                    onDelete={() => remove(row)}
                    onArchive={() => archive(row)}
                  />
                ))}
              </View>
              {group.key === "overdue" && agenda.overdueMore > 0 ? (
                <Text className={`pt-space-2 font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 13 }}>
                  {agenda.overdueMore} more before these
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    );

  const sheets = (
    <>
      <RowEditSheet
        // Keyed by the row, so the fields start out holding its values.
        key={renaming?.id ?? "none"}
        row={renaming}
        onClose={() => setRenaming(null)}
        onSave={(row, patch) => {
          setRenaming(null);
          edit(row, patch);
        }}
        onRemove={(row) => {
          setRenaming(null);
          const held = renaming;
          if (!held) return;
          if (held.canDelete && held.archivedAt === null) remove(held);
          else archive(held);
        }}
      />
      <RowActionSheet open={acting !== null} actions={actions} onClose={() => setActing(null)} />
    </>
  );

  return { list, sheets };
}
