"use client";

// Today, as a pane. 027.
//
// What to expect and what to do, across every thread. Under the pane head, in
// the layout's order and each only when it holds something: **Needs you**, the
// interruptions, read once per load and the same whichever day is shown; and
// **the day**, one at a time, picked on the month (2026-10-18, in place of
// the stepper's arrows), with the next line, Where you will
// be and To do; and on Today, **open in your threads** (2026-10-07), a page
// per thread holding to-dos with no date, and **Reminders** (042), what offload
// is reminding you about, nearest first. Customize Today is the second pane
// beside this one, opened from the sliders in the pane head, which has no
// title: the month's head names the day, and Today said twice was one too
// many.
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
import { addUtcDays, dayName, dayTitle, keepInPlace, monthDated, twoWeekFor, stepWeek, type MonthCount, nextLine, nothingLine, reminderEntryKey, remindersInOrder, zoneStrip } from "@offload/widgets";
import { Icon } from "../Icon";
import { PaneHead } from "../shell/PaneHead";
import { useThreads } from "../shell/threads-context";
import { NeedsYou, type Card } from "../today/NeedsYou";
import { MonthGrid } from "./MonthGrid";
import { EventsStrip, NextLine } from "../today/EventsStrip";
import { OpenThreads } from "../today/OpenThreads";
import { Reminders } from "../today/Reminders";
import { TodoCard } from "../today/TodoCard";
import { useTodayRows } from "../today/useTodayRows";
import { useAppearance } from "../../lib/appearance";
import { deviceZone, useClock } from "../../lib/clock";
import type { Label } from "../../lib/labels";
import { currentMe, onMe, type Me } from "../../lib/use-me";
import { useUndoEntries } from "../../lib/undo";
import {
  TODAY_RESET,
  dayOn,
  fetchDay,
  fetchMonth,
  fetchNeeds,
  fetchOpenThreads,
  fetchReminders,
  layoutOfMe,
  openThreadsOn,
  partOf,
  partsOn,
  remindersOn,
  type Day,
  type LayoutSection,
  type NeedsCard,
  type OpenPage,
  type RemindersRead,
  type TodayLayout,
} from "../../lib/today";
import { TODAY_FIELD } from "@offload/tokens";
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
  // The week the two rows start on. Null is the one the day is in, so a door
  // or the Today tab moving the day brings the weeks with it.
  const [month, setMonth] = useState<string | null>(null);
  const [went, setWent] = useState<1 | -1>(1);
  // Bumped after every write, so the month's dots follow a tick or a dismiss.
  const [monthRead, setMonthRead] = useState(0);
  const show = useCallback((next: string) => {
    setMonth(null);
    setDay(next);
  }, []);
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
        setConfirmed(partsKey(layoutOfMe(next)));
      }),
    [],
  );

  // ------------------------------------------------------------ where it opens

  const applied = useRef<string | null>(openDay);
  useEffect(() => {
    if (openDay === applied.current) return;
    applied.current = openDay;
    // `valid` reads today, which only matters on the render the door lands.
    if (valid(openDay)) show(openDay);
  }, [openDay]);

  useEffect(() => {
    const back = () => show(today);
    window.addEventListener(TODAY_RESET, back);
    return () => window.removeEventListener(TODAY_RESET, back);
  }, [today, show]);

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

  // The calendar's dots: what each day on the two weeks holds, read for the
  // whole window and again after a filing, which may have dated something.
  const grid0 = twoWeekFor(month ?? day, [], today, weekStart);
  const gridFrom = grid0.weeks[0]?.days[0]?.iso ?? grid0.key;
  const gridTo = grid0.weeks[grid0.weeks.length - 1]?.days[6]?.iso ?? grid0.key;
  const [counts, setCounts] = useState<{ window: string; days: MonthCount[] } | null>(null);
  useEffect(() => {
    let live = true;
    void fetchMonth(gridFrom, gridTo).then((days) => {
      if (live && days) setCounts({ window: `${gridFrom}|${gridTo}`, days });
    });
    return () => {
      live = false;
    };
  }, [gridFrom, gridTo, filed, zone, monthRead]);

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

  // Open in your threads: read with Today and again after every write, laid
  // over the pages as drawn so a ticked row keeps its place until Today is
  // built again, which stepping away and back is.
  const showOpen = day === today && openThreadsOn(layout);
  const [open, setOpen] = useState<OpenPage[] | null>(null);
  const [struck, setStruck] = useState<ReadonlySet<string>>(new Set());
  const struckNow = useRef(struck);
  struckNow.current = struck;
  const askedOpen = useRef(0);
  const loadOpen = useCallback(async () => {
    if (!showOpen) return;
    const mine = ++askedOpen.current;
    const got = await fetchOpenThreads();
    if (mine !== askedOpen.current || !got) return;
    setOpen((drawn) => keepInPlace(drawn ?? [], got, struckNow.current));
  }, [showOpen]);
  useEffect(() => {
    setOpen(null);
    setStruck(new Set());
    void loadOpen();
  }, [loadOpen]);
  useEffect(() => {
    if (filed) void loadOpen();
  }, [filed, loadOpen]);
  const strike = useCallback((id: string, on: boolean) => {
    setStruck((held) => {
      const next = new Set(held);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // 042. Reminders: read with Today, again after a filing and after every
  // write, as open in your threads is.
  const showReminders = day === today && remindersOn(layout);
  const [reminding, setReminding] = useState<RemindersRead | null>(null);
  const askedReminders = useRef(0);
  const loadReminders = useCallback(async () => {
    if (!showReminders) return;
    const mine = ++askedReminders.current;
    const got = await fetchReminders();
    if (mine !== askedReminders.current || !got) return;
    setReminding(got);
  }, [showReminders]);
  useEffect(() => {
    setReminding(null);
    void loadReminders();
  }, [loadReminders]);
  useEffect(() => {
    if (filed) void loadReminders();
  }, [filed, loadReminders]);

  const labels = useMemo(
    () => new Map<string, Label>((read?.day.threadLabels ?? []).map((one) => [one.id, { ...one, count: 0 }])),
    [read],
  );
  const reload = useCallback(async () => {
    setMonthRead((n) => n + 1);
    await Promise.all([load(false), loadOpen(), loadReminders()]);
  }, [load, loadOpen, loadReminders]);
  const rows = useTodayRows(reload, labels);
  // 2026-10-18. A section whose last thing left keeps its place while that
  // thing's Undo line runs.
  const undos = useUndoEntries();
  const lingers = (ids: readonly string[]) => ids.some((id) => undos.has(id));
  // What the day has drawn, since a reload after a tick no longer holds it.
  const drewToDo = useRef({ date: "", ids: new Set<string>() });

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

  const grid = twoWeekFor(
    month ?? day,
    counts && counts.window === `${gridFrom}|${gridTo}` ? monthDated(counts.days) : [],
    today,
    weekStart,
  );
  const stepper = (
    <div key="stepper" className={styles.month}>
      <MonthGrid
        grid={grid}
        unit="week"
        selected={day}
        went={went}
        // A day before today, or past the calendar copy's edge, does not open.
        closed={(iso) => iso < today || iso > lastDay}
        // The head names the picked day while the two weeks are shown; on
        // today, the month with Today beside it (the owner, 2026-10-19).
        title={day !== today ? dayTitle(day) : undefined}
        heading
        first={grid.key <= today}
        last={stepWeek(grid.key, 1) > lastDay}
        onPick={(iso) => show(iso)}
        onStep={(by) => {
          setWent(by);
          setMonth(stepWeek(grid.key, by));
        }}
        onToday={() => {
          setWent(grid.key > today ? -1 : 1);
          show(today);
        }}
      />
    </div>
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
      const rest = rows.shown(shown.rest);
      const late = isToday ? rows.shown(shown.late) : [];
      const timed = rows.shown(shown.timed);
      const next = nextLine(shown.events, now, isToday, zone);
      if (drewToDo.current.date !== day) drewToDo.current = { date: day, ids: new Set() };
      for (const row of [...late, ...timed, ...rest]) drewToDo.current.ids.add(row.id);
      const lingering = lingers([...drewToDo.current.ids]);
      const empty =
        shown.events.length + late.length + timed.length + rest.length + shown.lateMore + shown.restMore + (shown.timedMore ?? 0) === 0 &&
        !lingering;
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
            lingering={lingering}
          />
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

  // Today only, and never in place of the day-one invitation.
  const openThreads =
    showOpen && open && open.length > 0 && everDumped ? (
      <OpenThreads key="open" pages={open.map((page) => {
          // A row archived or deleted here leaves the count too, so N more holds.
          const todos = rows.shown(page.todos);
          return { ...page, todos, count: page.count - (page.todos.length - todos.length) };
        })} struck={struck} onStrike={strike} rows={rows} now={now} />
    ) : null;

  // Today only, and never in place of the day-one invitation. What was
  // dismissed here stays hidden until Today is built again; a row archived
  // or deleted here leaves too. Decided here, so an emptied section takes no
  // band.
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const onGone = useCallback((key: string, hidden: boolean) => {
    setGone((held) => {
      const next = new Set(held);
      if (hidden) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const remindingShown = reminding
    ? remindersInOrder({ rows: rows.shown(reminding.rows), others: reminding.others }).filter((entry) => !gone.has(reminderEntryKey(entry)))
    : [];
  const reminders =
    showReminders &&
    reminding &&
    everDumped &&
    (remindingShown.length > 0 || lingers(remindersInOrder(reminding).map((entry) => reminderEntryKey(entry)))) ? (
      <Reminders key="reminders" entries={remindingShown} today={today} zone={zone} onGone={onGone} writes={rows.writes} />
    ) : null;

  // Every kind by name: one this build does not know draws nothing, rather
  // than whichever section the last branch happened to be, and a kind added
  // to the type without a branch here does not compile.
  const sectionFor = (section: LayoutSection): React.ReactNode => {
    switch (section.kind) {
      case "needs_you":
        return needsYou;
      case "day":
        return theDay;
      case "reminders":
        return reminders;
      case "open_threads":
        return openThreads;
      default:
        section satisfies never;
        return null;
    }
  };

  return (
    <>
      <PaneHead
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

      {/* 046. Today scrolls a full-width canvas at least as tall as the pane, so
          the prism field covers the whole page, side to side and to the
          bottom, with the content column centred on top of it. The sections
          sit flat, de-banded, and the cards stay raised and opaque. */}
      <div className={styles.scroller}>
        <div className={styles.canvas}>
          <div className={styles.field} aria-hidden="true">
            <div className={styles.fieldInner}>
              {TODAY_FIELD.blooms.map((b, i) => (
                <div
                  key={i}
                  className={styles.bloom}
                  style={{
                    top: b.top,
                    width: b.width,
                    ...(b.from === "left" ? { left: b.offset } : { right: b.offset }),
                    backgroundImage: `url(/prism/p2-bloom-${b.src}.webp)`,
                  }}
                />
              ))}
            </div>
          </div>
          <div className={`${pane.paneBody} ${styles.column}`}>
            <div className={styles.today}>
              {layout.sections
                .map((section) => [section.kind, sectionFor(section)] as const)
                .filter(([, drawn]) => drawn !== null)
                .map(([kind, drawn]) => (
                  <div key={kind} className={styles.band} data-section={kind}>
                    {drawn}
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      {rows.overlays}
    </>
  );
}
