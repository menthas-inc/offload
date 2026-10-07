"use client";

// Limits, from ui_kits/admin_web/AdminApp.jsx (LimitsPage), narrowed as 034
// says: every cap and switch an owner can change while offload runs.
//
// What the kit draws and this does not: "When a cap is reached" (stop is the
// only behaviour), "Warn at", the per-person monthly cap (a monthly budget
// figure replaces it) and "Who hears about it" (alerts go to every owner).
// What this adds: the switches, photo megabytes and voice minutes, a save
// that shows old to new and handles another owner saving first, and Discard
// reads Cancel.
//
// **Units are converted here and nowhere else.** The API speaks millionths of
// a dollar, bytes and milliseconds; the page shows dollars, megabytes and
// minutes. A field nobody touched is never sent, so a value that does not
// survive the trip to a rounder unit and back is never changed by accident.

import { useState } from "react";
import { Switch } from "../../../../components/Switch";
import styles from "../../admin.module.css";
import { Confirm, Diff, Failed, Field, Loading, Notes, PaneHead, Section, Stat, Stats, adminWrite, count, dollars, outOfBounds, useAdminRead, useSay } from "../../ui";
import { FixedCosts } from "./FixedCosts";
import { Hits, useHits } from "./Hits";
import { CAP_LABELS, settingLabel } from "./labels";

type Value = number | boolean | null | Record<string, number>;

interface Setting {
  key: string;
  kind: "int" | "micros" | "bool" | "money-map";
  value: Value;
  default: Value;
  min: number | null;
  max: number | null;
  nullable: boolean;
  /** The stored row made no sense, and the default is what is in force. */
  malformed: boolean;
  updatedAt: string | null;
}

interface Now {
  spentMicros: number;
  capMicros: number | null;
  reached: boolean;
}

/** How a number is shown: what one of the page's units is in the API's, what
 *  sits beside the field, and how the value reads in a sentence. */
interface Unit {
  scale: number;
  prefix?: string;
  suffix?: string;
  say: (raw: number) => string;
}

const MICROS = 1_000_000;
const MEGABYTE = 1024 * 1024;
const MINUTE = 60_000;

/** A stored number in the page's unit. Dollars keep every millionth; the
 *  others are rounded to read, and only for reading. */
const shown = (raw: number, scale: number) => Number((raw / scale).toFixed(scale === MICROS ? 6 : 2));

const DOLLARS: Unit = { scale: MICROS, prefix: "$", say: dollars };
const MEGABYTES: Unit = { scale: MEGABYTE, suffix: "MB", say: (raw) => `${count(shown(raw, MEGABYTE))} MB` };
const MINUTES: Unit = { scale: MINUTE, suffix: "min", say: (raw) => `${count(shown(raw, MINUTE))} min` };
const WHOLE: Unit = { scale: 1, say: count };

const PLATFORM = "platform.spend_micros";
const BUDGET = "budget.month_micros";
const BATCH = "waitlist.batch";

/** Every number on the page, in the order the page draws them. */
const NUMBERS: Record<string, Unit> = {
  "cap.spend_micros": DOLLARS,
  "cap.turns": WHOLE,
  "cap.photos": WHOLE,
  "cap.photo_bytes": MEGABYTES,
  "cap.voice_notes": WHOLE,
  "cap.voice_ms": MINUTES,
  "cap.mail_day": WHOLE,
  "cap.mail_hour": WHOLE,
  // 036. Everything kept, not a day's.
  "cap.storage_bytes": MEGABYTES,
  [PLATFORM]: DOLLARS,
  [BUDGET]: DOLLARS,
  [BATCH]: WHOLE,
};

/** 036. The one per-person cap that is not a day's: everything kept. */
const KEPT = "cap.storage_bytes";
const PER_PERSON = Object.keys(NUMBERS).filter((key) => key.startsWith("cap.") && key !== KEPT);

/** Each switch, and one plain line saying what off does. `own` marks the two
 *  a person also has a setting for. */
const SWITCHES: ReadonlyArray<{ key: string; off: string; own?: boolean }> = [
  { key: "switch.web_maps", off: "Off, the web app draws no map. The phones keep theirs." },
  { key: "switch.maps", off: "Off, nobody sees a map and no place is looked up." },
  { key: "switch.web_search", off: "Off, offload searches the web for nobody.", own: true },
  { key: "switch.web_links", off: "Off, offload reads a link for nobody.", own: true },
  { key: "switch.nightly", off: "Off, the nightly pass is booked for nobody." },
  // 039. Off once offload opens past the waitlist.
  { key: "switch.review_codes", off: "Off, sign-in offers no code and ignores one." },
];

const SUB = "Caps are rolling over the last 24 hours, not reset at midnight.";

const NOTES = [
  "A cap means stop: the next turn is refused, and what was already dumped is safe.",
  "Work already running finishes. With the platform cap reached, scheduled model work is not booked until spend falls back under.",
  "A change takes effect everywhere within 20 seconds.",
  "The monthly budget is a figure, not a cap. Nothing enforces it; Costs measures the month against it.",
] as const;

const UNREADABLE = "The stored value was unreadable, so this is the default.";

/** What is typed and toggled. Text for every number, a flag for every switch
 *  and one for whether the platform cap is on at all. */
interface Form {
  text: Record<string, string>;
  on: Record<string, boolean>;
}

const typed = (value: Value, unit: Unit) => (typeof value === "number" ? String(shown(value, unit.scale)) : "");

function formOf(settings: Setting[], pick: (setting: Setting) => Value = (setting) => setting.value): Form {
  const form: Form = { text: {}, on: {} };
  for (const setting of settings) {
    const unit = NUMBERS[setting.key];
    if (unit) form.text[setting.key] = typed(pick(setting), unit);
    else if (setting.kind === "bool") form.on[setting.key] = pick(setting) === true;
    if (setting.key === PLATFORM) form.on[PLATFORM] = pick(setting) !== null;
  }
  return form;
}

const same = (a: Form, b: Form, key: string) => a.text[key] === b.text[key] && a.on[key] === b.on[key];

const lower = (setting: Setting, unit: Unit) => (setting.min === null ? undefined : setting.min / unit.scale);
const upper = (setting: Setting, unit: Unit) => (setting.max === null ? undefined : setting.max / unit.scale);

/** What the form holds for one setting, in the API's units, or why it is not
 *  a value yet. Off and unset are null, and never zero. */
function read(form: Form, setting: Setting): { ok: true; value: Value } | { ok: false; problem: string | null } {
  const unit = NUMBERS[setting.key];
  if (!unit) return { ok: true, value: form.on[setting.key] === true };
  if (setting.key === PLATFORM && !form.on[PLATFORM]) return { ok: true, value: null };
  const text = form.text[setting.key] ?? "";
  if (setting.key === BUDGET && text.trim() === "") return { ok: true, value: null };
  // The bounds are the field's to say; this only decides whether to send.
  if (outOfBounds(text, lower(setting, unit), upper(setting, unit))) return { ok: false, problem: null };
  if (unit.scale === 1 && !Number.isInteger(Number(text))) return { ok: false, problem: "A whole number." };
  return { ok: true, value: Math.round(Number(text) * unit.scale) };
}

/** A value in a sentence: the Diff's old and new. */
function said(setting: Setting, value: Value): string {
  if (value === null) return setting.key === PLATFORM ? "Off" : "Not set";
  if (typeof value === "boolean") return value ? "On" : "Off";
  const unit = NUMBERS[setting.key];
  return unit && typeof value === "number" ? unit.say(value) : "";
}

export default function LimitsPage() {
  const settingsRead = useAdminRead<{ settings: Setting[] }>("/settings");
  const now = useAdminRead<Now>("/limits/now");
  const hits = useHits();
  const { toast, say } = useSay();

  /** The values as loaded: what a save is made against. */
  const [loaded, setLoaded] = useState<Setting[] | null>(null);
  const [form, setForm] = useState<Form>({ text: {}, on: {} });
  /** What the server refused, by setting. */
  const [refused, setRefused] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  function take(settings: Setting[]) {
    setLoaded(settings);
    setForm(formOf(settings));
    setRefused({});
  }

  // A read that landed becomes the form, once: state adjusted while
  // rendering, which is what React asks for in place of an effect. A later
  // one, which a subscription's save asks for, lands under whatever is being
  // typed and leaves it there: only what nobody touched takes the new value.
  const [seen, setSeen] = useState<{ settings: Setting[] } | null>(null);
  if (settingsRead.data && settingsRead.data !== seen) {
    setSeen(settingsRead.data);
    const fresh = formOf(settingsRead.data.settings);
    if (loaded) {
      const was = formOf(loaded);
      for (const key of Object.keys(form.text)) if (form.text[key] !== was.text[key]) fresh.text[key] = form.text[key]!;
      for (const key of Object.keys(form.on)) if (form.on[key] !== was.on[key]) fresh.on[key] = form.on[key]!;
    }
    setLoaded(settingsRead.data.settings);
    setForm(fresh);
    setRefused({});
  }

  if (!loaded) {
    return (
      <>
        <PaneHead title="Limits" sub={SUB} />
        {settingsRead.state === "failed" ? <Failed what="limits" onRetry={settingsRead.reload} /> : <Loading />}
      </>
    );
  }

  const byKey = new Map(loaded.map((setting) => [setting.key, setting]));
  const initial = formOf(loaded);
  const defaults = formOf(loaded, (setting) => setting.default);

  // Only what somebody touched, and only where it now means something else.
  const touched = loaded.filter((setting) => (NUMBERS[setting.key] || setting.kind === "bool") && !same(form, initial, setting.key));
  const readings = touched.map((setting) => ({ setting, now: read(form, setting) }));
  const invalid = readings.some((one) => !one.now.ok);
  const changes = readings.flatMap((one) => (one.now.ok && one.now.value !== one.setting.value ? [{ setting: one.setting, value: one.now.value }] : []));
  const dirty = invalid || changes.length > 0;

  function edit(next: Form) {
    setForm(next);
    setConflict(false);
    setRefused({});
  }
  const setText = (key: string) => (text: string) => edit({ ...form, text: { ...form.text, [key]: text } });
  const setOn = (key: string) => (on: boolean) => edit({ ...form, on: { ...form.on, [key]: on } });
  const reset = (key: string) => () =>
    edit({
      text: { ...form.text, [key]: defaults.text[key] ?? "" },
      on: key in defaults.on ? { ...form.on, [key]: defaults.on[key] === true } : form.on,
    });

  async function save() {
    setBusy(true);
    const response = await adminWrite("/settings", "PATCH", {
      changes: Object.fromEntries(changes.map((change) => [change.setting.key, change.value])),
      // What the page showed for each: a value somebody has since moved is a
      // conflict, and nothing is written.
      expected: Object.fromEntries(changes.map((change) => [change.setting.key, change.setting.value])),
    }).catch(() => null);
    setBusy(false);

    if (response?.ok) {
      take(((await response.json()) as { settings: Setting[] }).settings);
      say("Limits saved");
      now.reload();
      return;
    }
    if (response?.status === 409) {
      // The current values replace the form. Nothing of this save was written.
      take(((await response.json()) as { settings: Setting[] }).settings);
      setConflict(true);
      now.reload();
      return;
    }
    if (response?.status === 400) {
      const body = (await response.json().catch(() => null)) as { key?: string; min?: number | null; max?: number | null } | null;
      const unit = body?.key ? NUMBERS[body.key] : undefined;
      if (body?.key && unit && typeof body.min === "number" && typeof body.max === "number") {
        setRefused({ [body.key]: `Between ${count(body.min / unit.scale)} and ${count(body.max / unit.scale)}.` });
        return;
      }
    }
    say("That did not go through. Nothing was saved");
  }

  /** One number's field: its unit, its bounds as the hint, its refusal, and
   *  the way back to its default once it is away from it. */
  function number(key: string, label: string, hint?: string, width?: number) {
    const setting = byKey.get(key);
    const unit = NUMBERS[key];
    if (!setting || !unit) return null;
    const text = form.text[key] ?? "";
    const unset = key === BUDGET && text.trim() === "";
    const reading = read(form, setting);
    const min = lower(setting, unit);
    const max = upper(setting, unit);
    const bounds = min !== undefined && max !== undefined ? `${count(min)} to ${count(max)}` : null;
    return (
      <Field
        key={key}
        label={label}
        value={text}
        onChange={setText(key)}
        prefix={unit.prefix}
        suffix={unit.suffix}
        width={width}
        // An empty budget is no budget, which is a value and not a mistake.
        min={unset ? undefined : min}
        max={unset ? undefined : max}
        error={refused[key] ?? (reading.ok ? null : reading.problem)}
        onReset={same(form, defaults, key) ? undefined : reset(key)}
        hint={
          <>
            {[hint, bounds].filter(Boolean).join(". ")}
            {setting.malformed ? `. ${UNREADABLE}` : null}
          </>
        }
      />
    );
  }

  const platform = byKey.get(PLATFORM)?.value;
  const spend = byKey.get("cap.spend_micros")?.value;
  const turns = byKey.get("cap.turns")?.value;

  return (
    <>
      <PaneHead
        title="Limits"
        sub={SUB}
        asOf={now.asOf}
        onRefresh={() => {
          now.reload();
          hits.reload();
          // Never under somebody's edits.
          if (!dirty) settingsRead.reload();
        }}
        tools={
          dirty ? (
            <>
              <button type="button" className={styles.ghost} onClick={() => take(loaded)}>
                Cancel
              </button>
              <button type="button" className={styles.smallPrimary} onClick={() => setConfirming(true)} disabled={invalid || busy || changes.length === 0}>
                Save changes
              </button>
            </>
          ) : (
            <span className={styles.asOf}>Saved</span>
          )
        }
      />

      {/* A section that failed says so in its own place and the rest stays. */}
      {now.state === "failed" && !now.data ? <Failed what="the figures" onRetry={now.reload} /> : null}
      {now.data ? (
        <Stats>
          <Stat
            label="Spent in the last 24 hours"
            value={dollars(now.data.spentMicros)}
            tone={now.data.reached ? "attention" : undefined}
            note={
              now.data.capMicros === null
                ? "the platform cap is off"
                : `${count(Math.round((now.data.spentMicros / now.data.capMicros) * 100))}% of the platform cap`
            }
          />
          {/* What is in force, not what is being typed. */}
          <Stat label="Platform cap" value={typeof platform === "number" ? dollars(platform) : "Off"} />
          <Stat label="Per person, spend" value={typeof spend === "number" ? dollars(spend) : null} note="in any 24 hours" />
          <Stat label="Per person, turns" value={typeof turns === "number" ? count(turns) : null} note="in any 24 hours" />
        </Stats>
      ) : null}

      {conflict ? (
        <p className={styles.limitsNotice} role="alert">
          Someone else changed this. These are the values now, and nothing of yours was saved.
        </p>
      ) : null}

      <div className={styles.limitsCard}>
        <div className={styles.limitsGroup}>
          <h2 className={styles.limitsGroupLabel}>Per person, in any 24 hours</h2>
          <div className={styles.limitsFields}>{PER_PERSON.map((key) => number(key, CAP_LABELS[key] ?? key))}</div>
        </div>

        <div className={styles.limitsGroup}>
          <h2 className={styles.limitsGroupLabel}>Per person, everything kept</h2>
          <div className={styles.limitsFields}>{number(KEPT, CAP_LABELS[KEPT] ?? KEPT)}</div>
        </div>

        <div className={styles.limitsGroup}>
          <h2 className={styles.limitsGroupLabel}>The platform, in any 24 hours</h2>
          <div className={styles.limitsFields}>
            {/* Off is its own state, beside the amount: off sends nothing, and
                nothing is not zero. */}
            <label className={`${styles.limitsSwitch} ${styles.limitsToggle}`}>
              <span>
                <b className={styles.limitsSwitchName}>{settingLabel(PLATFORM)}</b>
                <span className={styles.limitsSwitchLine}>
                  {form.on[PLATFORM]
                    ? "Once everyone together has spent this, every account is refused its next turn."
                    : "Off. Nobody is refused by it."}
                  {byKey.get(PLATFORM)?.malformed ? ` ${UNREADABLE}` : null}
                </span>
              </span>
              <Switch checked={form.on[PLATFORM] === true} onChange={setOn(PLATFORM)} />
            </label>
            {form.on[PLATFORM] ? number(PLATFORM, "Everyone together") : null}
          </div>
        </div>

        <div className={styles.limitsGroup}>
          <h2 className={styles.limitsGroupLabel}>The month</h2>
          <div className={styles.limitsFields}>{number(BUDGET, settingLabel(BUDGET), "A figure, not a cap. Empty for none", 240)}</div>
        </div>

        <div className={styles.limitsGroup}>
          <h2 className={styles.limitsGroupLabel}>The waitlist</h2>
          <div className={styles.limitsFields}>{number(BATCH, settingLabel(BATCH), "How many the weekly invite lets in", 240)}</div>
        </div>
      </div>

      <Section note="off stops the path for everyone within seconds">Switches</Section>
      <div className={`${styles.limitsCard} ${styles.limitsSwitches}`}>
        {SWITCHES.map((one) => {
          const setting = byKey.get(one.key);
          if (!setting) return null;
          return (
            <label key={one.key} className={styles.limitsSwitch}>
              <span>
                <b className={styles.limitsSwitchName}>{settingLabel(one.key)}</b>
                <span className={styles.limitsSwitchLine}>{one.off}</span>
                {one.own ? <span className={styles.limitsSwitchLine}>A person&apos;s own setting is untouched; this overrides it while off.</span> : null}
                {setting.malformed ? <span className={styles.limitsSwitchLine}>{UNREADABLE}</span> : null}
              </span>
              <Switch checked={form.on[one.key] === true} onChange={setOn(one.key)} />
            </label>
          );
        })}
      </div>

      {/* 034 section 4.1. Saves itself, as one setting of its own, from the
          page's read and into the page's toast. A save here compares only the
          keys it changes, as the page's does, so neither is a conflict for
          the other. */}
      <FixedCosts settings={loaded} reload={settingsRead.reload} say={say} />

      <Section note="last 30 days">What has been hit</Section>
      <Hits hits={hits} />

      <Section note="what a cap does">Notes</Section>
      <Notes items={NOTES} />

      {confirming ? (
        <Confirm
          title="Save these changes?"
          body={
            <Diff
              changes={changes.map((change) => ({
                label: settingLabel(change.setting.key),
                from: said(change.setting, change.setting.value),
                to: said(change.setting, change.value),
              }))}
            />
          }
          confirmLabel="Save changes"
          busy={busy}
          onConfirm={() => void save()}
          onClose={() => setConfirming(false)}
        />
      ) : null}

      {toast}
    </>
  );
}
