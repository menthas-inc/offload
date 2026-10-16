"use client";

// The row's one modal on the web. 023.
//
// The web's edit was an inline title field that saved on blur, which cannot
// hold a Cancel, a body or a month grid. Content rows get this instead: the
// same fields as the phones' sheet, with the grid inline rather than in a
// second layer, Time and Repeats as inline blocks, and Custom's fields
// disclosed under Repeats. Escape is Cancel. Save writes once.
//
// 2026-09-29. No details field: offload is for short things, and a second
// field took space and confused people. What is stored there is untouched.
//
// 2026-10-07. Labels, as the phones' sheet has them: the row's labels by dot
// and name, and the label popover behind them, saved with the rest.
//
// 042. Remind me is the settings `Switch`, where it was a checkbox. The
// author sees it whenever offload will remind them and it writes `reminders`;
// anybody else sees it only while somebody asked, and it writes `isReminder`
// off, as 023 built it. Either way it rides in the one save.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  WEEKDAYS,
  bellOn,
  formatRule,
  monthFor,
  parseRule,
  presetsFor,
  remindSwitchShown,
  stepMonth,
  noonUtc,
  utcDay,
  type Freq,
  type Rule,
  type Weekday,
} from "@offload/widgets";
import { Icon } from "../Icon";
import { Switch } from "../Switch";
import { Modal } from "../people/Modal";
import { MoveOver } from "../shell/MoveSheet";
import { LabelPopover, type LabelChoice } from "../labels/LabelPopover";
import { LabelDot } from "../labels/LabelMark";
import type { Label } from "../../lib/labels";
import styles from "../../app/(shell)/shell.module.css";
import people from "../people/people.module.css";
import { useAppearance } from "../../lib/appearance";
import { useClock } from "../../lib/clock";
import type { ContentPatch, ContentRow, ThreadRow } from "../../lib/threads";
import { anHourAfter, patchFor, repeatsLabel, sameWhen, whenValueOf, type WhenValue } from "../../lib/when";

const UNITS: { freq: Freq; one: string; many: string }[] = [
  { freq: "DAILY", one: "day", many: "days" },
  { freq: "WEEKLY", one: "week", many: "weeks" },
  { freq: "MONTHLY", one: "month", many: "months" },
  { freq: "YEARLY", one: "year", many: "years" },
];
const ORDINAL_WORDS: Record<string, string> = { "1": "first", "2": "second", "3": "third", "4": "fourth", "-1": "last" };

function weekdayOf(day: string): Weekday {
  return WEEKDAYS[(noonUtc(day).getUTCDay() + 6) % 7]!;
}


export function EditModal({
  row,
  threadId = null,
  labels,
  onClose,
  onSave,
  onMove,
}: {
  row: ContentRow;
  /** The thread's labels. Absent where the row has no thread's set. */
  labels?: Label[] | undefined;
  /** The thread the row is in, which the move sheet leaves out. */
  threadId?: string | null;
  onClose: () => void;
  /** `made` is any label typed in the popover, to be made first and added
   *  to `patch.labels`. */
  onSave: (row: ContentRow, patch: ContentPatch, made: string[]) => void;
  /** 028. Move, for a row that can move, in any thread. The modal gives way to
   *  the move sheet; a pick moves the row and nothing typed here is saved. */
  onMove?: ((row: ContentRow, thread: ThreadRow) => void) | undefined;
}) {
  const { zone, today } = useClock();
  const { weekStart } = useAppearance();
  const held = whenValueOf(row, zone);
  const [title, setTitle] = useState(row.title);
  const [when, setWhen] = useState<WhenValue>(held);
  const isAuthor = row.author?.isYou === true;
  const [remind, setRemind] = useState(bellOn(row));
  const [month, setMonth] = useState(held.day ?? today);
  const [custom, setCustom] = useState(false);
  const [moving, setMoving] = useState(false);
  const [choice, setChoice] = useState<LabelChoice | null>(null);
  const [labelling, setLabelling] = useState(false);
  const labelsButton = useRef<HTMLButtonElement>(null);
  const carried = (labels ?? []).filter((label) => (choice?.ids ?? row.labels).includes(label.id));
  const labelNames = [...carried.map((label) => label.name), ...(choice?.made ?? [])];
  const isEvent = row.type === "event";

  const grid = useMemo(() => monthFor(month, [], today, weekStart), [month, today, weekStart]);
  const presets = useMemo(() => (when.day ? presetsFor(when.day) : []), [when.day]);
  const chosenPreset = presets.find((preset) => preset.rule && preset.rule === when.rrule);

  function pickDay(iso: string): void {
    const index = presets.findIndex((preset) => preset.rule && preset.rule === when.rrule);
    const rrule = index >= 0 ? (presetsFor(iso)[index]?.rule ?? null) : when.rrule;
    setWhen({ ...when, day: iso, rrule });
    if (!grid.inMonth(iso)) setMonth(iso);
  }

  function save(): void {
    const patch: ContentPatch = {};
    const text = title.trim();
    if (text.length > 0 && text !== row.title) patch.title = text;
    if (!sameWhen(when, held)) Object.assign(patch, patchFor(row, when));
    if (isAuthor && remind !== bellOn(row)) patch.reminders = remind ? "on" : "off";
    else if (!isAuthor && row.isReminder && !remind) patch.isReminder = false;
    const relabelled =
      choice !== null &&
      (choice.made.length > 0 || choice.ids.length !== row.labels.length || choice.ids.some((id) => !row.labels.includes(id)));
    if (relabelled) patch.labels = choice.ids;
    if (Object.keys(patch).length === 0 && !relabelled) return onClose();
    onSave(row, patch, relabelled ? choice.made : []);
  }

  if (moving && onMove) {
    return <MoveOver exceptThreadId={threadId} onClose={() => setMoving(false)} onPick={(thread) => onMove(row, thread)} />;
  }

  return (
    // The popover answers Escape itself; the dialog under it stays.
    <Modal label="Edit" wide onClose={labelling ? () => {} : onClose}>
      <input
        className={`${styles.titleInput} ${styles.editTitle}`}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        aria-label="Title"
        placeholder="What is it?"
        autoFocus
      />

      {!row.onCalendar ? (
        <div className={styles.editWhen}>
          <div className={styles.editMonth}>
            <span className={styles.editMonthLabel}>{grid.label}</span>
            <button type="button" className={styles.editStep} onClick={() => setMonth(stepMonth(month, -1))} aria-label="Previous month">
              <Icon name="chevron-left" size={18} />
            </button>
            <button type="button" className={styles.editStep} onClick={() => setMonth(stepMonth(month, 1))} aria-label="Next month">
              <Icon name="chevron-right" size={18} />
            </button>
          </div>
          <div className={styles.editGrid} aria-label={grid.label}>
            {grid.weeks[0]?.days.map((one) => (
              <span key={one.iso} className={styles.editDow}>
                {one.dow.slice(0, 1)}
              </span>
            ))}
            {grid.weeks.flatMap((week) =>
              week.days.map((one) => (
                <button
                  key={one.iso}
                  type="button"
                  className={`${styles.editDay} ${one.iso === when.day ? styles.editDayOn : ""} ${one.today ? styles.editDayToday : ""} ${grid.inMonth(one.iso) ? "" : styles.editDayOut}`}
                  onClick={() => pickDay(one.iso)}
                  aria-pressed={one.iso === when.day}
                  aria-label={dayName(one.iso)}
                >
                  {one.dom}
                </button>
              )),
            )}
          </div>

          {/* Time is one row, the All day switch (the owner, 2026-10-16),
              and the hour a row of its own under it only while the row has
              one (2026-10-12): a disabled 09:00 read as a time it had. */}
          <div className={styles.editSwitch}>
            <Switch
              label="All day"
              checked={when.time === null}
              disabled={!when.day}
              onChange={(on) => {
                if (on) setWhen({ ...when, time: null, endTime: null });
                else setWhen({ ...when, time: "09:00", endTime: isEvent ? "10:00" : null });
              }}
            />
          </div>
          {when.day && when.time !== null ? (
            <div className={styles.editRow}>
              <span className={styles.editRowLabel}>{isEvent ? "Starts" : "Time"}</span>
              <input
                type="time"
                step={300}
                className={styles.editTime}
                value={when.time}
                onChange={(event) => {
                  const time = event.target.value || null;
                  setWhen({ ...when, time, endTime: isEvent && time ? (when.endTime ?? anHourAfter(time)) : null });
                }}
                aria-label="Time"
              />
            </div>
          ) : null}
          {isEvent && when.time ? (
            <div className={styles.editRow}>
              <span className={styles.editRowLabel}>Ends at</span>
              <input
                type="time"
                step={300}
                className={styles.editTime}
                value={when.endTime ?? anHourAfter(when.time)}
                onChange={(event) => setWhen({ ...when, endTime: event.target.value || null })}
                aria-label="Ends at"
              />
            </div>
          ) : null}

          {/* Repeats, an inline block: the presets read off the picked day, and
              Custom's fields disclose beneath rather than in a second layer. */}
          <div className={styles.editRow}>
            <span className={styles.editRowLabel}>Repeats</span>
            <select
              className={styles.editSelect}
              disabled={!when.day}
              value={custom || (when.rrule && !chosenPreset) ? "custom" : (when.rrule ?? "never")}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "custom") setCustom(true);
                else {
                  setCustom(false);
                  setWhen({ ...when, rrule: value === "never" ? null : value });
                }
              }}
              aria-label="Repeats"
            >
              {/* With no day there are no presets to read off it, and an
                  empty select read as broken: it says Never. */}
              {presets.length === 0 ? <option value="never">Never</option> : null}
              {presets.map((preset) => (
                <option key={preset.label} value={preset.rule ?? "never"}>
                  {preset.rule === "custom" && when.rrule && !chosenPreset ? repeatsLabel(when) : preset.label}
                </option>
              ))}
            </select>
          </div>
          {(custom || (when.rrule && !chosenPreset)) && when.day ? (
            <CustomRule anchorDay={when.day} initial={when.rrule} onChange={(rrule) => setWhen({ ...when, rrule })} />
          ) : null}
        </div>
      ) : null}

      {labels ? (
        <div className={styles.editRow}>
          <span className={styles.editRowLabel}>Labels</span>
          <button
            ref={labelsButton}
            type="button"
            className={styles.editLabels}
            onClick={() => setLabelling(true)}
            aria-label={`Labels, ${labelNames.join(", ") || "none"}`}
            aria-haspopup="dialog"
          >
            {carried.map((label) => (
              <LabelDot key={label.id} colour={label.colour} />
            ))}
            <span className={styles.editLabelsNames}>{labelNames.join(", ") || "None"}</span>
          </button>
        </div>
      ) : null}
      {labelling && labels && labelsButton.current ? (
        <LabelPopover
          anchor={labelsButton.current}
          title={title.trim() || row.title}
          labels={labels}
          carried={choice?.ids ?? row.labels}
          made={choice?.made ?? []}
          align="start"
          onDone={(next) => {
            setChoice(next);
            setLabelling(false);
          }}
          onClose={() => setLabelling(false)}
        />
      ) : null}

      {remindSwitchShown(row, isAuthor) ? (
        <div className={styles.editSwitch}>
          <Switch label="Remind me" checked={remind} onChange={setRemind} />
        </div>
      ) : null}

      <div className={people.modalActions}>
        {!row.onCalendar && when.day ? (
          <button type="button" className={`${people.ghost} ${styles.editClear}`} onClick={() => setWhen({ day: null, time: null, endTime: null, rrule: null })}>
            Clear
          </button>
        ) : null}
        {onMove && row.canMove ? (
          <button type="button" className={people.ghost} onClick={() => setMoving(true)}>
            Move
          </button>
        ) : null}
        <button type="button" className={people.ghost} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={people.primary} onClick={save}>
          Save
        </button>
      </div>
    </Modal>
  );
}

/** Custom's four controls, inline. */
/** A day's name for a screen reader: "Friday 25 September", not "2026-09-25". */
function dayName(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(noonUtc(iso));
}

function CustomRule({ anchorDay, initial, onChange }: { anchorDay: string; initial: string | null; onChange: (rrule: string) => void }) {
  const parsed = initial ? parseRule(initial) : null;
  const start: Rule = parsed?.ok ? parsed.rule : { freq: "WEEKLY", interval: 1, byDay: [weekdayOf(anchorDay)] };
  const dom = noonUtc(anchorDay).getUTCDate();
  const nth = (Math.ceil(dom / 7) >= 5 ? -1 : Math.ceil(dom / 7)) as 1 | 2 | 3 | 4 | -1;
  const [interval, setInterval] = useState(start.interval);
  const [freq, setFreq] = useState<Freq>(start.freq);
  const [byDay, setByDay] = useState<Weekday[]>(start.byDay ?? [weekdayOf(anchorDay)]);
  const [anchor, setAnchor] = useState<"dom" | "nth">(start.ordinal ? "nth" : "dom");
  const [ends, setEnds] = useState<"never" | "on" | "after">(start.until ? "on" : start.count ? "after" : "never");
  const [until, setUntil] = useState(
    start.until ? `${start.until.slice(0, 4)}-${start.until.slice(4, 6)}-${start.until.slice(6, 8)}` : utcDay(new Date(noonUtc(anchorDay).getTime() + 90 * 86_400_000)),
  );
  const [count, setCount] = useState(start.count ?? 6);

  // Chosen from the select, the block showed a rule and Save sent nothing
  // until a control was touched (the client review of 2026-09-22): the rule
  // it opens with goes up once, on mount.
  useEffect(() => {
    emit({});
  }, []);

  function emit(next: Partial<{ interval: number; freq: Freq; byDay: Weekday[]; anchor: "dom" | "nth"; ends: "never" | "on" | "after"; until: string; count: number }>): void {
    const state = { interval, freq, byDay, anchor, ends, until, count, ...next };
    const rule: Rule = { freq: state.freq, interval: state.interval };
    if (state.freq === "WEEKLY" && state.byDay.length > 0) rule.byDay = WEEKDAYS.filter((day) => state.byDay.includes(day));
    if (state.freq === "MONTHLY") {
      if (state.anchor === "nth") rule.ordinal = { n: nth, day: weekdayOf(anchorDay) };
      else rule.byMonthDay = dom;
    }
    if (state.ends === "on") rule.until = `${state.until.replace(/-/g, "")}T235959Z`;
    if (state.ends === "after") rule.count = state.count;
    onChange(formatRule(rule));
  }

  const unit = UNITS.find((one) => one.freq === freq)!;
  return (
    <div className={styles.editCustom}>
      <div className={styles.editRow}>
        <span className={styles.editRowLabel}>Repeat every</span>
        <input
          type="number"
          min={1}
          max={99}
          className={styles.editNumber}
          value={interval}
          onChange={(event) => {
            const n = Math.min(99, Math.max(1, Number(event.target.value) || 1));
            setInterval(n);
            emit({ interval: n });
          }}
          aria-label="Repeat every"
        />
        <select
          className={styles.editSelect}
          value={freq}
          onChange={(event) => {
            const next = event.target.value as Freq;
            setFreq(next);
            emit({ freq: next });
          }}
          aria-label="Unit"
        >
          {UNITS.map((one) => (
            <option key={one.freq} value={one.freq}>
              {interval === 1 ? one.one : one.many}
            </option>
          ))}
        </select>
      </div>
      {freq === "WEEKLY" ? (
        <div className={styles.editRow}>
          <span className={styles.editRowLabel}>Repeat on</span>
          <span className={styles.editDays}>
            {WEEKDAYS.map((day) => {
              const on = byDay.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  className={`${styles.editDayChip} ${on ? styles.editDayChipOn : ""}`}
                  aria-pressed={on}
                  aria-label={day}
                  onClick={() => {
                    const next = on ? byDay.filter((one) => one !== day) : [...byDay, day];
                    setByDay(next);
                    emit({ byDay: next });
                  }}
                >
                  {day.charAt(0)}
                </button>
              );
            })}
          </span>
        </div>
      ) : null}
      {freq === "MONTHLY" ? (
        <div className={styles.editRow}>
          <label className={styles.editCheck}>
            <input type="radio" name="anchor" checked={anchor === "dom"} onChange={() => { setAnchor("dom"); emit({ anchor: "dom" }); }} />
            On the {dom}
          </label>
          <label className={styles.editCheck}>
            <input type="radio" name="anchor" checked={anchor === "nth"} onChange={() => { setAnchor("nth"); emit({ anchor: "nth" }); }} />
            On the {ORDINAL_WORDS[String(nth)]} {new Intl.DateTimeFormat(undefined, { weekday: "long", timeZone: "UTC" }).format(noonUtc(anchorDay))}
          </label>
        </div>
      ) : null}
      <div className={styles.editRow}>
        <span className={styles.editRowLabel}>Ends</span>
        <label className={styles.editCheck}>
          <input type="radio" name="ends" checked={ends === "never"} onChange={() => { setEnds("never"); emit({ ends: "never" }); }} />
          Never
        </label>
        <label className={styles.editCheck}>
          <input type="radio" name="ends" checked={ends === "on"} onChange={() => { setEnds("on"); emit({ ends: "on" }); }} />
          On
        </label>
        <input
          type="date"
          className={styles.editTime}
          value={until}
          disabled={ends !== "on"}
          onChange={(event) => {
            if (!event.target.value) return;
            setUntil(event.target.value);
            emit({ until: event.target.value });
          }}
          aria-label="Ends on"
        />
        <label className={styles.editCheck}>
          <input type="radio" name="ends" checked={ends === "after"} onChange={() => { setEnds("after"); emit({ ends: "after" }); }} />
          After
        </label>
        <input
          type="number"
          min={1}
          max={999}
          className={styles.editNumber}
          value={count}
          disabled={ends !== "after"}
          onChange={(event) => {
            const n = Math.min(999, Math.max(1, Number(event.target.value) || 1));
            setCount(n);
            emit({ count: n });
          }}
          aria-label="Times"
        />
        <span className={styles.editRowLabel}>times</span>
      </div>
    </div>
  );
}
