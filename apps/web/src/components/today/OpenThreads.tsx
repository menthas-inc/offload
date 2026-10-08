"use client";

// Open in your threads (design 2026-10-07, the kit's `WThreadPages`). Today
// only, after To do: a page per thread holding open to-dos with no date, two
// side by side in the pane's measure, stepped by two with the arrows in the
// head, each disabled at its end. A page: the thread's icon, name and the
// people sharing it, which open the thread; up to four to-dos, oldest first,
// with how long each has been open; then N more and Open thread. Not in a
// thread is last, with offload's line when it has a thread in mind and Sort
// them. A tick strikes the row through in place with Undo, and the row leaves
// the page the next time Today is built. A row's title opens its row sheet.
//
// The kit's first sentence of the thread's read is not drawn: nothing writes
// a thread's standing read yet, and the thread page draws nothing in its
// place either.

import Link from "next/link";
import { useState } from "react";
import { holdsLine, inMindLine, openFor } from "@offload/widgets";
import { Icon } from "../Icon";
import { ThreadIcon } from "../ThreadIcon";
import { useToast } from "../shell/Toast";
import { perform } from "../../lib/optimistic";
import { completeContent } from "../../lib/threads";
import type { AgendaRow, OpenPage } from "../../lib/today";
import type { TodayRows } from "./useTodayRows";
import pane from "../../app/(shell)/shell.module.css";
import styles from "../../app/(shell)/today.module.css";

const SHOWN = 2;
const LOOSE_HREF = "/threads/loose";

export function OpenThreads({
  pages,
  struck,
  onStrike,
  rows,
  now,
}: {
  pages: OpenPage[];
  /** Rows ticked here since Today was built. */
  struck: ReadonlySet<string>;
  onStrike: (id: string, on: boolean) => void;
  rows: TodayRows;
  now: Date;
}) {
  const toast = useToast();
  const [at, setAt] = useState(0);
  if (pages.length === 0) return null;
  const start = Math.min(at, Math.max(0, pages.length - SHOWN));
  const count = pages.reduce((sum, page) => sum + page.count, 0);

  function tick(row: AgendaRow): void {
    const on = !struck.has(row.id);
    void perform(
      {
        apply: () => onStrike(row.id, on),
        revert: () => onStrike(row.id, !on),
        write: () => completeContent(row.id, on),
        ...(on ? { unwrite: () => completeContent(row.id, false), did: "Ticked off" } : {}),
        failed: on ? "Couldn't tick that off" : "Couldn't put that back",
        unfailed: "Couldn't put that back",
      },
      toast,
      rows.writes,
    );
  }

  const arrow = (by: -1 | 1, off: boolean) => (
    <button
      type="button"
      className={styles.openStep}
      aria-label={by < 0 ? "Previous threads" : "Next threads"}
      disabled={off}
      onClick={() => setAt(start + by * SHOWN)}
    >
      <span className={styles.openStepDisc}>
        <Icon name={by < 0 ? "chevron-left" : "chevron-right"} size={17} />
      </span>
    </button>
  );

  return (
    <section className={styles.daySection} aria-labelledby="open-threads-head">
      <div className={styles.openHead}>
        <h3 className={styles.head} id="open-threads-head">
          Open in your threads <em className={styles.headCount}>{count}</em>
        </h3>
        <span className={styles.openSteps}>
          {arrow(-1, start === 0)}
          {arrow(1, start + SHOWN >= pages.length)}
        </span>
      </div>
      <div className={styles.openPages}>
        {pages.slice(start, start + SHOWN).map((page) => {
          const loose = page.name === null;
          const href = loose ? LOOSE_HREF : `/threads/${page.threadId}`;
          const more = page.count - page.todos.length;
          const line = loose && page.loose ? inMindLine(page.loose.inMind, page.todos.length) : null;
          const holds = loose && page.loose ? holdsLine(page.loose.holds) : null;
          return (
            <article key={page.threadId} className={styles.openPage} data-page>
              <Link href={href} className={styles.openPageHead}>
                {loose ? (
                  <span className={styles.openLoose}>
                    <Icon name="inbox" size={16} />
                  </span>
                ) : (
                  <ThreadIcon icon={page.icon ?? "lasso"} hue={page.hue ?? 1} seed={page.threadId} size={22} />
                )}
                <span className={styles.openName} data-page-name>
                  {page.name ?? "Not in a thread"}
                </span>
                {page.people.length > 0 ? (
                  <span className={styles.openPeople}>
                    {page.people.map((person) => (
                      <span key={person.accountId} className={styles.openFace} title={person.displayName ?? undefined}>
                        {person.initials}
                      </span>
                    ))}
                  </span>
                ) : null}
              </Link>
              {line ? <p className={styles.openLine}>{line}</p> : null}
              {page.todos.map((row) => {
                const done = struck.has(row.id);
                return (
                  <div key={row.id} className={styles.openRow} data-done={done || undefined}>
                    <input
                      type="checkbox"
                      className={`${pane.rowCheck} ${styles.openCheck}`}
                      checked={done}
                      onChange={() => tick(row)}
                      aria-label={done ? `Put ${row.title} back on the list` : `Finish ${row.title}`}
                    />
                    <button type="button" className={styles.openTitle} onClick={() => rows.handlers.onEdit(row)}>
                      {row.title}
                    </button>
                    <span className={styles.openAge}>{openFor(row.createdAt, now)}</span>
                  </div>
                );
              })}
              <div className={styles.openFoot}>
                <span>{more > 0 ? `${more} more` : (holds ?? "")}</span>
                <Link href={href} className={styles.openDoor}>
                  {loose ? "Sort them" : "Open thread"}
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
