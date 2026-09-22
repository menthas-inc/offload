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
import { useRouter } from "next/navigation";
import { Icon } from "../Icon";
import { ZoneStrip } from "../shell/ZoneStrip";
import { ContentRowView, type RowHandlers } from "./ContentRowView";
import { rowIcon } from "./Thread";
import { fetchToday, type Agenda, type AgendaRow } from "../../lib/notifications";
import { completeContent, deleteContent, setArchived, type ContentRow } from "../../lib/threads";
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
 *  and the thread's name as the row's meta. A tick acts here; the pencil and
 *  the trash act here too, and the row opens its thread. A repeating row
 *  appears once, in the first group its rule lands in, never in Overdue. */
export function TodayPane() {
  const router = useRouter();
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const reload = useCallback(() => {
    void fetchToday().then((next) => {
      if (next) setAgenda(next);
    });
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  const quiet = agenda !== null && agenda.overdue.length + agenda.today.length + agenda.tomorrow.length === 0;

  const handlers: RowHandlers = {
    editing: null,
    draft: "",
    asking,
    arrived: new Set(),
    onDraft: () => undefined,
    // The modal and Undo live on the thread page; a row here opens it there.
    onEdit: (row: ContentRow) => router.push(`/threads/${(row as AgendaRow).threadId}`),
    onSaveTitle: () => undefined,
    onStopEditing: () => undefined,
    onArchive: (row: ContentRow) => {
      void setArchived(row.id, !row.archivedAt).then(reload);
    },
    onAsk: setAsking,
    onDelete: (row: ContentRow) => {
      setAsking(null);
      void deleteContent(row.id).then(reload);
    },
  };

  const groups = agenda
    ? [
        { key: "overdue", label: "Overdue", rows: agenda.overdue },
        { key: "today", label: "Today", rows: agenda.today },
        { key: "tomorrow", label: "Tomorrow", rows: agenda.tomorrow },
      ].filter((group) => group.rows.length > 0)
    : [];

  return (
    <>
      <div className={pane.paneHead}>
        <div style={{ minWidth: 0 }}>
          <h1 className={`${pane.paneTitle} ${pane.paneTitleBig}`}>Today</h1>
          {agenda === null ? <p className={pane.paneSub}>One moment</p> : quiet ? <p className={pane.paneSub}>Nothing in here yet</p> : null}
        </div>
      </div>

      <div className={pane.paneBody}>
        <div className={styles.today}>
          {/* 023. The one place the browser's own zone appears. */}
          <ZoneStrip />
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
                                onChange={() => void completeContent(row.id, !done).then(reload)}
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
    </>
  );
}
