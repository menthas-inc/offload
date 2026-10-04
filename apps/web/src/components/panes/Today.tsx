"use client";

// Today, as a pane. 027.
//
// What to expect and what to do, across every thread. Under the pane head, in
// the layout's order and each only when it holds something: **Needs you**, the
// interruptions, read once per load and the same whichever day is shown; and
// **the day**, one at a time, with the stepper, the next line, Where you will
// be, To do and, on Today, If you have time. Customize Today is the second
// pane beside this one, opened from the sliders in the pane head.
//
// An account that has never dumped sees 024's day-one invitation in place of
// the day. Tapping an example fills the composer rather than submitting it,
// because the first thing that lands in an account should be something the
// person meant. The composer is in the shell, under every pane, so an example
// reaches it through an event.
//
// The day shown is never stored: the page opens on Today, a door's `?day=`
// opens its day once, the Today tab sends it back, and midnight in the
// account's zone moves an open Today to the new day.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addUtcDays, dayName, nextLine, nothingLine, zoneStrip } from "@offload/widgets";
import { Icon } from "../Icon";
import { PaneHead } from "../shell/PaneHead";
import { useThreads } from "../shell/threads-context";
import { NeedsYou, type Card } from "../today/NeedsYou";
import { DayStepper } from "../today/DayStepper";
import { EventsStrip, NextLine } from "../today/EventsStrip";
import { Picks, TodoCard } from "../today/TodoCard";
import { useTodayRows } from "../today/useTodayRows";
import { useAppearance } from "../../lib/appearance";
import { deviceZone, useClock } from "../../lib/clock";
import type { Label } from "../../lib/labels";
import { currentMe, onMe, type Me } from "../../lib/use-me";
import {
  TODAY_RESET,
  dayOn,
  fetchDay,
  fetchNeeds,
  layoutOf,
  partOf,
  partsOn,
  type Day,
  type NeedsCard,
  type TodayLayout,
} from "../../lib/today";
import pane from "../../app/(shell)/shell.module.css";
import styles from "../../app/(shell)/today.module.css";

// The kit's three, verbatim, and the same three both phones show from
// apps/mobile/lib/gate.ts. Kept identical by hand until one source is shared.
const EXAMPLES = [
  "Book the Alfama flat for the 14th",
  "Ana can only travel the 14th to the 17th",
  "Oak brackets, 30cm, matte black",
] as const;

// The kit's line from WFirstRun, without the noun the vocabulary retired on
// 2026-09-02: the phones' wording, word for word (`apps/mobile/lib/gate.ts`).
const DAY_ONE_INVITATION =
  "Dump anything and offload will sort it. You do not need to pick a place for it, or name it, or come back and tidy it up.";

/** How an example reaches a composer that is nobody's child. */
export const FILL_COMPOSER = "offload:fill-composer";

/** How far ahead the stepper reaches: the calendar copy's edge. */
export const DAYS_AHEAD = 365;
/** A day that arrives sooner than this draws no spinner. */
const SPINNER_AFTER_MS = 250;
const MINUTE_MS = 60 * 1000;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The clock, moving each minute while the tab is in front and caught up the
 *  moment it comes back. Today's countdown and its midnight both read it. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const run = () => {
      if (timer) clearInterval(timer);
      timer = null;
      if (document.hidden) return;
      setNow(new Date());
      timer = setInterval(() => setNow(new Date()), MINUTE_MS);
    };
    run();
    document.addEventListener("visibilitychange", run);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", run);
    };
  }, []);
  return now;
}

/** A switch's key, so Needs you is read again only when what is on changed
 *  on the server. */
const partsKey = (layout: TodayLayout) => [...partsOn(layout)].sort().join(",");

export function TodayPane({
  layout,
  openDay,
  customizing,
}: {
  layout: TodayLayout;
  /** A door's `?day=`, opened once. */
  openDay: string | null;
  customizing: boolean;
}) {
  const now = useNow();
  const { zone, today } = useClock();
  const { weekStart } = useAppearance();
  const { filed } = useThreads();
  const lastDay = addUtcDays(today, DAYS_AHEAD);
  const valid = (day: string | null): day is string => day !== null && DAY_PATTERN.test(day) && day >= today && day <= lastDay;

  const [day, setDay] = useState(() => (valid(openDay) ? openDay : today));
  const [read, setRead] = useState<{ date: string; day: Day } | null>(null);
  const [failed, setFailed] = useState(false);
  const [slow, setSlow] = useState(false);
  // Whether the account has ever dumped, from the last day that loaded; null
  // until one has, so the stepper does not flash ahead of the invitation.
  const [everDumped, setEverDumped] = useState<boolean | null>(null);
  const [me, setMe] = useState<Me | null>(currentMe());
  const [needs, setNeeds] = useState<NeedsCard[] | null>(null);
  const [needsRead, setNeedsRead] = useState(false);
  const [needsLoad, setNeedsLoad] = useState(0);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  useEffect(
    () =>
      onMe((next) => {
        setMe(next);
        setConfirmed(partsKey(layoutOf(next.todayLayout)));
      }),
    [],
  );

  // ------------------------------------------------------------ where it opens

  const applied = useRef<string | null>(openDay);
  useEffect(() => {
    if (openDay === applied.current) return;
    applied.current = openDay;
    // `valid` reads today, which only matters on the render the door lands.
    if (valid(openDay)) setDay(openDay);
  }, [openDay]);

  useEffect(() => {
    const back = () => setDay(today);
    window.addEventListener(TODAY_RESET, back);
    return () => window.removeEventListener(TODAY_RESET, back);
  }, [today]);

  // Midnight in the account's zone: a day that has become yesterday moves on.
  useEffect(() => {
    setDay((shown) => (shown < today ? today : shown));
  }, [today]);

  // ------------------------------------------------------------ the reads

  const asked = useRef(0);
  const load = useCallback(
    async (fresh: boolean) => {
      const mine = ++asked.current;
      setFailed(false);
      if (fresh) {
        setRead(null);
        setSlow(false);
      }
      const timer = setTimeout(() => {
        if (mine === asked.current) setSlow(true);
      }, SPINNER_AFTER_MS);
      const got = await fetchDay(day);
      clearTimeout(timer);
      if (mine !== asked.current) return;
      setSlow(false);
      if (!got) {
        if (fresh) setFailed(true);
        return;
      }
      setRead({ date: day, day: got });
      setEverDumped(got.everDumped);
    },
    // The zone moves the day's instants, so a new zone reads the day again.
    [day, zone],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  // A turn that filed something may have dated a row onto this day.
  useEffect(() => {
    if (filed) void load(false);
  }, [filed, load]);

  // Needs you: once a load, and again when the server's switches changed.
  useEffect(() => {
    if (confirmed === null) return;
    let live = true;
    void fetchNeeds().then((cards) => {
      if (!live) return;
      setNeeds(cards);
      setNeedsRead(true);
      setNeedsLoad((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [confirmed]);

  const labels = useMemo(
    () => new Map<string, Label>((read?.day.threadLabels ?? []).map((one) => [one.id, { ...one, count: 0 }])),
    [read],
  );
  const reload = useCallback(() => load(false), [load]);
  const rows = useTodayRows(reload, labels);

  // ------------------------------------------------------------ Needs you

  const on = partsOn(layout);
  // Account issues in the table's order: a broken calendar, then this
  // browser's zone, then people, questions and tips as the server sent them.
  const served = (needs ?? []).filter((card) => on.has(partOf(card)));
  const cards: Card[] = served.filter((card) => card.kind === "calendar");
  if (on.has("account") && me) {
    const strip = zoneStrip(me, deviceZone());
    if (strip) cards.push({ key: "zone", kind: "zone", device: strip.device, account: strip.account });
  }
  cards.push(...served.filter((card) => card.kind !== "calendar"));

  const needsYou = needsRead && cards.length > 0 ? <NeedsYou key="needs" cards={cards} load={needsLoad} /> : null;

  // ------------------------------------------------------------ the day

  const isToday = day === today;
  const named = dayName(day, today, weekStart);
  const shown = read && read.date === day ? read.day : null;

  const stepper = (
    <DayStepper
      key="stepper"
      name={named.name}
      sub={named.sub}
      first={day <= today}
      last={day >= lastDay}
      onStep={(by) => setDay((current) => addUtcDays(current, by))}
    />
  );

  let dayBody: React.ReactNode = null;
  if (everDumped === false && shown && !shown.everDumped) {
    dayBody = (
      <div className={styles.dayOne}>
        <p className={styles.emptyTitle}>{DAY_ONE_INVITATION}</p>
        <div className={styles.examples}>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              className={styles.example}
              onClick={() => window.dispatchEvent(new CustomEvent(FILL_COMPOSER, { detail: example }))}
            >
              <Icon name="arrow-up" size={14} className={styles.exampleMark} />
              {example}
            </button>
          ))}
        </div>
      </div>
    );
  } else if (everDumped !== null || failed) {
    let sections: React.ReactNode = null;
    if (failed) {
      sections = (
        <p className={styles.dayFailed}>
          Couldn&apos;t load this day{" "}
          <button type="button" className={styles.dayRetry} onClick={() => void load(true)}>
            Try again
          </button>
        </p>
      );
    } else if (shown) {
      const takenIds = new Set(rows.taken.map((row) => row.id));
      const picks = isToday ? rows.shown(shown.picks).filter((row) => !takenIds.has(row.id)) : [];
      // A row taken with + Today is today's, so it is drawn on Today only,
      // whatever day the stepper moved to while its write was in flight.
      const taken = isToday ? rows.taken.filter((row) => !shown.rest.some((one) => one.id === row.id)) : [];
      const rest = [...rows.shown(shown.rest), ...taken];
      const late = isToday ? rows.shown(shown.late) : [];
      const timed = rows.shown(shown.timed);
      const next = nextLine(shown.events, now, isToday, zone);
      const empty =
        shown.events.length + late.length + timed.length + rest.length + picks.length + shown.lateMore + shown.restMore + (shown.timedMore ?? 0) === 0;
      sections = empty ? (
        <p className={styles.nothing}>{nothingLine(named.name)}</p>
      ) : (
        <>
          {next ? <NextLine title={next.title} tail={next.tail} /> : null}
          {shown.events.length > 0 ? (
            <EventsStrip events={shown.events} count={shown.eventCount} nextId={next?.id ?? null} now={now} zone={zone} />
          ) : null}
          <TodoCard
            late={late}
            lateMore={isToday ? shown.lateMore : 0}
            timed={timed}
            rest={rest}
            notDrawn={(shown.timedMore ?? 0) + shown.restMore}
            rows={rows}
            zone={zone}
          />
          <Picks picks={picks} rows={rows} />
        </>
      );
    } else if (slow) {
      sections = <span className={pane.paneSpinner} role="status" aria-label="loading" />;
    }
    dayBody = (
      <>
        {stepper}
        {sections}
      </>
    );
  } else if (slow) {
    dayBody = <span className={pane.paneSpinner} role="status" aria-label="loading" />;
  }

  const theDay = dayOn(layout) ? (
    <div key="day" className={styles.day}>
      {dayBody}
    </div>
  ) : null;

  return (
    <>
      <PaneHead
        title="Today"
        big
        tools={
          <Link
            href={customizing ? "/today" : "/today?customize=1"}
            className={pane.tool}
            aria-label="Customize Today"
            aria-expanded={customizing}
            title="Customize Today"
          >
            <Icon name="sliders-horizontal" size={16} />
          </Link>
        }
      />

      <div className={pane.paneBody}>
        <div className={styles.today}>
          {layout.sections.map((section) => (section.kind === "needs_you" ? needsYou : theDay))}
        </div>
      </div>

      {rows.overlays}
    </>
  );
}
