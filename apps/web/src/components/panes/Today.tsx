"use client";

// Today, as a pane.
//
// Thin on purpose. Today is a view assembled from threads, calendars and
// notes, and two of those three do not exist, so what it has is the
// invitation and the three examples. Tapping an example fills the composer
// rather than submitting it, because the first thing that lands in an account
// should be something the person meant, not a sample.
//
// The composer used to be here and is in the shell now, under every pane. The
// kit always said so: "one composer, under both panes, spanning the window. It
// never belongs to a pane." An example therefore reaches it through an event
// rather than through a prop, which is the price of the composer not being
// anybody's child.

import { useCallback, useEffect, useState } from "react";
import { Icon } from "../Icon";
import { ZoneStrip } from "../shell/ZoneStrip";
import { useToast } from "../shell/Toast";
import { ContentRowView, type RowHandlers } from "./ContentRowView";
import { EditModal } from "./EditModal";
import { rowIcon } from "./Thread";
import { fetchToday, type Agenda, type AgendaRow } from "../../lib/notifications";
import {
  completeContent,
  deleteContent,
  editContent,
  setArchived,
  type ContentPatch,
  type ContentRow,
  type ContentSnapshot,
} from "../../lib/threads";
import { perform, useWrites } from "../../lib/optimistic";
import { useClock } from "../../lib/clock";
import { drawnWhen } from "../../lib/when";
import pane from "../../app/(shell)/shell.module.css";
import styles from "../../app/(shell)/today.module.css";

// The kit's three, verbatim, and the same three both phones show from
// apps/mobile/lib/gate.ts. Web had invented its own set once, which is the
// drift the shared copy on mobile exists to stop, except nothing shares it with
// web. Until there is one source both clients read, these are kept identical by
// hand.
const EXAMPLES = [
  "Book the Alfama flat for the 14th",
  "Ana can only travel the 14th to the 17th",
  "Oak brackets, 30cm, matte black",
] as const;

// The kit's line, verbatim, from WFirstRun.
const DAY_ONE_INVITATION =
  "Dump the first thing and offload will sort it. You do not need to pick a place for it, or name it, or come back and tidy it up.";

/** How an example reaches a composer that is nobody's child.
 *
 *  A custom event rather than a store or a context, because this is the only
 *  thing that ever crosses that boundary and a store would be scaffolding for
 *  one message. If a second thing needs to talk to the composer, that is the
 *  moment to build the store, not before. */
export const FILL_COMPOSER = "offload:fill-composer";

/** 024. The three groups across every thread, from the agenda read: the
 *  thread page's own row with its chip, its checkbox and its two controls,
 *  and the thread's name as the row's meta. Every control acts here, drawn
 *  first and written second with the thread page's words and Undo: the tick,
 *  the pencil into the modal, the trash, and Archive. The row's title opens
 *  its own page as it does anywhere. A repeating row appears once, in the
 *  first group its rule lands in, never in Overdue. */
export function TodayPane() {
  const toast = useToast();
  const { zone } = useClock();
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<AgendaRow | null>(null);
  // What the pane has drawn ahead of the server: a changed field, or a row
  // taken out of its list. Cleared when the agenda comes back fresh.
  const [drawn, setDrawn] = useState<Map<string, Partial<AgendaRow>>>(new Map());
  const [dropped, setDropped] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    const next = await fetchToday();
    if (!next) return;
    setAgenda(next);
    setDrawn(new Map());
    setDropped(new Set());
  }, []);
  const writes = useWrites(reload);
  useEffect(() => {
    void reload();
  }, [reload]);

  const patchRow = (id: string, patch: Partial<AgendaRow>) =>
    setDrawn((held) => new Map(held).set(id, { ...(held.get(id) ?? {}), ...patch }));
  const dropRow = (id: string) => setDropped((held) => new Set(held).add(id));
  const putRow = (id: string) =>
    setDropped((held) => {
      const next = new Set(held);
      next.delete(id);
      return next;
    });

  /** Tick, or put it back. The box moves at the press. No toast for a tick
   *  that lands: the box is its own undo. */
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

  /** The modal's Save: every changed field in one request, drawn first and
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

  const quiet = agenda !== null && agenda.overdue.length + agenda.today.length + agenda.tomorrow.length === 0;

  const handlers: RowHandlers = {
    editing: null,
    draft: "",
    asking,
    arrived: new Set(),
    onDraft: () => undefined,
    // The pencil opens the same modal the thread page opens, here.
    onEdit: (row: ContentRow) => setEditRow(row as AgendaRow),
    onSaveTitle: () => undefined,
    onStopEditing: () => undefined,
    onArchive: archive,
    onAsk: setAsking,
    onDelete: remove,
  };

  const groups = agenda
    ? [
        { key: "overdue", label: "Overdue", rows: agenda.overdue },
        { key: "today", label: "Today", rows: agenda.today },
        { key: "tomorrow", label: "Tomorrow", rows: agenda.tomorrow },
      ]
        .map((group) => ({
          ...group,
          rows: group.rows.filter((row) => !dropped.has(row.id)).map((row) => ({ ...row, ...(drawn.get(row.id) ?? {}) })),
        }))
        .filter((group) => group.rows.length > 0)
    : [];

  return (
    <>
      <div className={pane.paneHead}>
        <div style={{ minWidth: 0 }}>
          <h1 className={`${pane.paneTitle} ${pane.paneTitleBig}`}>Today</h1>
          {/* The kit's day-one line, and only then: an account with threads
              and nothing due reads "Nothing due today." below, once. */}
          {agenda !== null && quiet && !agenda.everDumped ? <p className={pane.paneSub}>Nothing in here yet</p> : null}
        </div>
      </div>

      <div className={pane.paneBody}>
        <div className={styles.today}>
          {/* 023. The one place the browser's own zone appears. */}
          <ZoneStrip />
          {agenda === null ? <span className={pane.paneSpinner} role="status" aria-label="loading" /> : null}
          {agenda !== null && !quiet ? (
            <div className={styles.agenda}>
              {groups.map((group) => (
                <section key={group.key} className={styles.agendaGroup}>
                  <h2 className={styles.agendaTitle}>{group.label}</h2>
                  <div className={styles.agendaRows}>
                    {group.rows.map((row) => {
                      const done = row.doneAt !== null;
                      return (
                        <ContentRowView
                          key={row.id}
                          row={row}
                          handlers={handlers}
                          lead={
                            row.type === "task" ? (
                              <input
                                type="checkbox"
                                className={pane.rowCheck}
                                checked={done}
                                onChange={() => tick(row)}
                                aria-label={done ? `Put ${row.title} back on the list` : `Finish ${row.title}`}
                              />
                            ) : (
                              <span className={pane.rowIcon}>
                                <Icon name={rowIcon(row.type)} size={18} />
                              </span>
                            )
                          }
                          meta={<span className={pane.rowMeta}>{row.threadName}</span>}
                        />
                      );
                    })}
                  </div>
                  {group.key === "overdue" && agenda.overdueMore > 0 ? (
                    <p className={styles.agendaMore}>{agenda.overdueMore} more before these</p>
                  ) : null}
                </section>
              ))}
            </div>
          ) : null}
          {agenda !== null && quiet && agenda.everDumped ? <p className={styles.emptyTitle}>Nothing due today.</p> : null}
          {agenda !== null && quiet && !agenda.everDumped ? (
            <>
          <p className={styles.emptyTitle}>{DAY_ONE_INVITATION}</p>

          <div className={styles.examples}>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                className={styles.example}
                onClick={() =>
                  window.dispatchEvent(new CustomEvent(FILL_COMPOSER, { detail: example }))
                }
              >
                <Icon name="arrow-up" size={14} className={styles.exampleMark} />
                {example}
              </button>
            ))}
          </div>
            </>
          ) : null}
        </div>
      </div>

      {editRow ? (
        <EditModal
          key={editRow.id}
          row={editRow}
          onClose={() => setEditRow(null)}
          onSave={(row, patch) => {
            setEditRow(null);
            edit(row, patch);
          }}
        />
      ) : null}
    </>
  );
}
