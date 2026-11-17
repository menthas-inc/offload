"use client";

// 052. A reply's calendar: the built MonthGrid, still, showing only the period
// the turn is about, and the picked day's entries at full width beneath.
//
// **Exactly as Today draws it**, from the same reads: `/v1/today/month` for
// the dots and `/v1/today/day` for the list, fetched only once the slice is on
// screen and once per key for the session. No arrows and no Today control: a
// reply never pages through months, and Today is where months are browsed.
// The day picked is not kept, so a reopened reply opens on the turn's day.
//
// An entry opens its details where it is, and several can be open at once.
// Titles wrap and are never shortened (AC-6): the grid is where room is
// short, and the grid draws only dots.

import { useEffect, useId, useRef, useState } from "react";
import {
  calendarColour,
  dayTitle,
  daysBetween,
  directionsUrl,
  eventRange,
  gridFor,
  nothingLine,
  periodLabel,
  timeIn,
  wasLine,
  type MonthCount,
} from "@offload/widgets";
import { Icon } from "../Icon";
import { MonthGrid } from "../panes/MonthGrid";
import { useClock } from "../../lib/clock";
import { useChanged, useThreads } from "./threads-context";
import { useAppearance } from "../../lib/appearance";
import { completeContent } from "../../lib/threads";
import { dayOnce, monthOnce, type AgendaRow, type Day, type TodayEvent } from "../../lib/today";
import type { Slice } from "../../lib/dump";
import answer from "../../app/(shell)/answer.module.css";
import styles from "../../app/(shell)/reply-parts.module.css";

type CalendarSliceData = Extract<Slice, { kind: "calendar" }>;

/** A span reads each day that has something on it, this many at most. */
const SPAN_DAYS = 7;

/** Whether the element has been on screen. Without an observer, it has. */
function useSeen(box: React.RefObject<HTMLElement | null>): boolean {
  const [seen, setSeen] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (seen || !box.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((one) => one.isIntersecting)) return;
      setSeen(true);
      observer.disconnect();
    });
    observer.observe(box.current);
    return () => observer.disconnect();
  }, [seen, box]);
  return seen;
}

export function CalendarSlice({ slice, live, onChanged }: { slice: CalendarSliceData; live: boolean; onChanged?: () => void }) {
  const { zone, today } = useClock();
  const { weekStart } = useAppearance();
  const box = useRef<HTMLDivElement>(null);
  const seen = useSeen(box);
  const { from, to } = slice.period;
  // A span lists every day with something on it until a day is tapped.
  const [picked, setPicked] = useState<string | null>(slice.span ? null : slice.day);
  const [counts, setCounts] = useState<MonthCount[] | null | undefined>(undefined);
  const [reads, setReads] = useState<ReadonlyMap<string, Day | null>>(new Map());
  // Read again when a turn files something here, or a change is heard from
  // elsewhere or on coming back to the tab, as the spec's slices do.
  const { filed } = useThreads();
  const [heard, setHeard] = useState(0);
  useChanged(["thread", "today"], () => setHeard(Date.now()));
  const fresh = Math.max(filed?.at ?? 0, heard);

  useEffect(() => {
    if (!seen) return;
    let on = true;
    void monthOnce(from, to, fresh).then((got) => {
      if (on) setCounts(got);
    });
    return () => {
      on = false;
    };
  }, [seen, from, to, fresh]);

  const listed = picked
    ? [picked]
    : (counts ?? [])
        .filter((one) => one.date >= from && one.date <= to && one.task + one.event + one.calendar > 0)
        .map((one) => one.date)
        // shortcut: a span lists its first seven days with entries, as the phones do; read the rest as they scroll in when a month answer is seen to need it.
        .slice(0, SPAN_DAYS);
  const listedKey = listed.join(",");
  useEffect(() => {
    if (!seen) return;
    let on = true;
    for (const date of listedKey ? listedKey.split(",") : []) {
      void dayOnce(date, date < today, fresh).then((got) => {
        if (on) setReads((held) => new Map(held).set(date, got));
      });
    }
    return () => {
      on = false;
    };
  }, [seen, listedKey, today, fresh]);

  // Offline: nothing to draw, and the undo line's summary stands alone.
  if (counts === null) return null;

  const grid = gridFor(slice.period, counts ?? [], today, weekStart);
  const two = daysBetween(from, to) < 14;
  const marked = new Set(live ? slice.marked : []);

  return (
    <div ref={box} className={`${answer.card} ${styles.calendar}`}>
      <div className={styles.grid}>
        <MonthGrid
          grid={grid}
          unit={two ? "week" : "month"}
          selected={picked ?? slice.day}
          went={1}
          still
          aside={periodLabel(slice.day, today)}
          onPick={(iso) => setPicked(iso)}
        />
      </div>
      {listed.map((date) => (
        <DayEntries key={date} date={date} day={reads.get(date)} zone={zone} marked={marked} previous={slice.previous ?? {}} {...(onChanged ? { onChanged } : {})} />
      ))}
    </div>
  );
}

function DayEntries({
  date,
  day,
  zone,
  marked,
  previous,
  onChanged,
}: {
  date: string;
  day: Day | null | undefined;
  zone: string | null;
  marked: ReadonlySet<string>;
  previous: Readonly<Record<string, { dueAt?: string | null; occursAt?: string | null }>>;
  onChanged?: () => void;
}) {
  if (!day) return null;
  const rows = [...day.timed, ...day.rest];
  return (
    <section className={styles.day}>
      <h3 className={styles.dayHeading} data-day-heading>
        {dayTitle(date)}
      </h3>
      {day.events.length + rows.length === 0 ? <p className={styles.nothing}>{nothingLine(dayTitle(date))}</p> : null}
      {day.events.map((event) => (
        <Entry key={event.id} date={date} event={event} zone={zone} marked={marked.has(event.id)} was={wasLine(previous[event.id], zone)} />
      ))}
      {rows.map((row) => (
        <Entry key={row.id} date={date} row={row} zone={zone} marked={marked.has(row.id)} was={wasLine(previous[row.id], zone)} {...(onChanged ? { onChanged } : {})} />
      ))}
    </section>
  );
}

/** One entry under the grid: an event with its time, a to-do with its tick,
 *  and its details opening in place. */
function Entry({
  date,
  event,
  row,
  zone,
  marked,
  was = null,
  onChanged,
}: {
  date: string;
  event?: TodayEvent;
  row?: AgendaRow;
  zone: string | null;
  marked: boolean;
  /** AC-9. When a moved entry was, while its Undo holds it. */
  was?: string | null;
  onChanged?: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(row ? row.doneAt !== null : false);
  const title = event?.title ?? row?.title ?? "";
  const threadName = event?.threadName ?? row?.threadName ?? null;
  const timed = row && !row.allDay && row.dueAt ? timeIn(new Date(row.dueAt), zone, "en-GB") : null;
  const lead = event ? eventRange({ ...event, endsAt: null }, zone) : timed;

  async function tick(): Promise<void> {
    if (!row) return;
    const next = !done;
    setDone(next);
    if (await completeContent(row.id, next)) onChanged?.();
    else setDone(!next);
  }

  // The span in words: the day, then the time when there is one.
  const range = event ? (event.allDay ? null : eventRange(event, zone)) : timed;
  const place = event?.place ?? row?.place ?? null;
  const location = event?.location ?? row?.location ?? null;
  const calendar = event?.calendar ?? row?.calendar ?? null;
  // 019. Somebody else's event: its title and its time, and nothing else.
  const theirs = event ? !event.mine : false;

  return (
    <div className={`${styles.entry} ${marked ? answer.marked : ""}`} data-marked={marked || undefined}>
      <div className={styles.entryRow}>
        {row?.type === "task" ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={done}
            aria-label={`${title}, ${threadName ?? "Not in a thread"}`}
            className={answer.tick}
            onClick={() => void tick()}
          >
            <span className={answer.tickBox}>{done ? <Icon name="check" size={13} /> : null}</span>
          </button>
        ) : null}
        <button type="button" className={styles.entryButton} aria-expanded={open} aria-controls={id} onClick={() => setOpen((was) => !was)}>
          {lead ? <span className={styles.entryTime}>{lead}</span> : null}
          <span className={styles.entryText}>
            <span className={`${styles.entryTitle} ${done ? styles.entryDone : ""}`} data-title>
              {title}
            </span>
            {threadName ? <span className={styles.entryMeta}>{threadName}</span> : null}
            {was ? <span className={styles.entryMeta}>{was}</span> : null}
          </span>
          <Icon name={open ? "chevron-down" : "chevron-right"} size={15} className={styles.entryChevron} />
        </button>
      </div>
      {open ? (
        <div id={id} className={styles.details}>
          <span className={styles.detail}>
            <Icon name="clock" size={14} />
            {range ? `${dayTitle(date)}, ${range}` : dayTitle(date)}
          </span>
          {theirs ? null : (
            <>
              {location || (place && place.lat !== null && place.lng !== null) ? (
                <span className={styles.detail}>
                  <Icon name="map-pin" size={14} />
                  {location}
                  {place && place.lat !== null && place.lng !== null ? (
                    <a
                      className={styles.directions}
                      href={directionsUrl({ lat: place.lat, lng: place.lng, googlePlaceId: null })}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Directions
                    </a>
                  ) : null}
                </span>
              ) : null}
              <span className={styles.detail}>
                <Icon name="lasso" size={14} />
                {threadName ?? "Not in a thread"}
              </span>
              <span className={styles.detail}>
                <Icon name="calendar" size={14} />
                {calendar ? (
                  <>
                    {calendarColour(calendar.colour) ? <span className={styles.dot} style={{ background: calendarColour(calendar.colour)! }} data-calendar-dot aria-hidden="true" /> : null}
                    {calendar.name}
                  </>
                ) : event?.source === "calendar" && event.calendarName ? (
                  event.calendarName
                ) : (
                  "Not on a calendar"
                )}
              </span>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
