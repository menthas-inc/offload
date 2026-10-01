"use client";

// Activity, as a pane. 024.
//
// Everything offload told you, in order, plus what it decided quietly and
// never told you about. Newest first under Today, Yesterday and Earlier. A
// sent row and an unsent row are the same row with a different lead: filled
// for something that reached the phone, hollow on the lift border for
// something that did not, plus the kind's glyph. Not sent is a fact, not an
// apology: noticed where a setting or the permission caused it, and that row
// opens the setting; quiet where the product chose silence, and those rows
// are not doors. The web sends nothing, so this is the record the web has.

import { useEffect, useState } from "react";
import Link from "next/link";
import { addUtcDays, dayIn } from "@offload/widgets";
import { Icon } from "../Icon";
import { useClock } from "../../lib/clock";
import { refreshMe } from "../../lib/use-me";
import { doorOf, fetchActivity, glyphOf, markActivitySeen, tagOf, undoActivity, type ActivityEntry } from "../../lib/notifications";
import pane from "../../app/(shell)/shell.module.css";

function sectionOf(day: string, today: string, yesterday: string): "Today" | "Yesterday" | "Earlier" {
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  return "Earlier";
}

export function ActivityPane() {
  const { zone, today } = useClock();
  const [rows, setRows] = useState<ActivityEntry[] | null>(null);
  const [next, setNext] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetchActivity(null).then((page) => {
      if (!live) return;
      setRows(page?.rows ?? []);
      setNext(page?.next ?? null);
    });
    // Seen on open, and the dot goes with it.
    void markActivitySeen().then(() => refreshMe());
    return () => {
      live = false;
    };
  }, []);

  /** 025. A sort taken back. Drawn first, written second, put back with the
   *  one clause if the server refuses. */
  async function undo(row: ActivityEntry): Promise<void> {
    const draw = (undone: boolean) =>
      setRows((held) => (held ?? []).map((one) => (one.id === row.id ? { ...one, undone, undoable: !undone } : one)));
    draw(true);
    if ((await undoActivity(row.id)) === "failed") {
      draw(false);
      setLine(row.id);
    }
  }
  const [line, setLine] = useState<string | null>(null);

  async function more(): Promise<void> {
    if (!next) return;
    const page = await fetchActivity(next);
    if (!page) return;
    setRows((held) => [...(held ?? []), ...page.rows]);
    setNext(page.next);
  }

  const yesterday = addUtcDays(today, -1);
  let section: string | null = null;

  return (
    <>
      <div className={pane.paneHead}>
        <div style={{ minWidth: 0 }}>
          <h1 className={`${pane.paneTitle} ${pane.paneTitleBig}`}>Activity</h1>
        </div>
      </div>

      <div className={pane.paneBody}>
        {rows === null ? (
          <span className={pane.paneSpinner} role="status" aria-label="loading" />
        ) : rows.length === 0 ? (
          <div className={pane.actEmpty}>
            <p className={pane.actEmptyTitle}>Nothing yet</p>
            <p className={pane.actEmptyLine}>What offload sends you is kept here, and so is what it decided not to send.</p>
          </div>
        ) : (
          <div className={pane.actList}>
            {rows.map((row) => {
              const here = sectionOf(dayIn(new Date(row.occurredAt), zone), today, yesterday);
              const heading = here !== section;
              section = here;
              const door = doorOf(row, zone, today);
              const tag = tagOf(row);
              const when =
                here === "Earlier"
                  ? new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: zone ?? undefined }).format(new Date(row.occurredAt))
                  : new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: zone ?? undefined }).format(new Date(row.occurredAt));
              const body = (
                <>
                  <span className={`${pane.actLead} ${row.sent ? "" : pane.actLeadOff}`} aria-hidden="true">
                    <Icon name={glyphOf(row)} size={14} />
                  </span>
                  <span className={pane.actText}>
                    <span className={pane.actLine}>
                      <span className={pane.actTitle}>{row.title}</span>
                      <span className={pane.actWhen}>{when}</span>
                    </span>
                    {row.body ? <span className={pane.actBody}>{row.body}</span> : null}
                    {tag ? <span className={`${pane.actTag} ${tag.tone === "quiet" ? pane.actTagQuiet : ""}`}>{tag.label}</span> : null}
                    {line === row.id ? <span className={pane.actFailed}>Couldn&apos;t undo that</span> : null}
                  </span>
                </>
              );
              // 025. Undo is its own control beside the row, never inside the
              // row's press, which opens the thread.
              const undoControl = row.undoable ? (
                <button type="button" className={pane.actUndo} onClick={() => void undo(row)}>
                  Undo
                </button>
              ) : null;
              return (
                <div key={row.id}>
                  {heading ? <h2 className={pane.actGroup}>{here}</h2> : null}
                  <div className={undoControl ? pane.actWithUndo : undefined}>
                    {door ? (
                      <Link href={door} className={pane.actRow}>
                        {body}
                      </Link>
                    ) : (
                      <div className={pane.actRow}>{body}</div>
                    )}
                    {undoControl}
                  </div>
                </div>
              );
            })}
            {next ? (
              <button type="button" className={pane.actMore} onClick={() => void more()}>
                Earlier still
              </button>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}
