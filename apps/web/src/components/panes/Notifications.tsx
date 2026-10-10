"use client";

// Settings, Notifications, on the web. 024.
//
// The same account switches and hours the phones show, and one line under
// the heading: the web sends nothing itself. Browser push is a separate
// permission, transport and refusal state, and none of the four sends is
// worth opening it for. Labels match the notification titles word for word.
// A switch or an hour is drawn first and written second, and put back with
// one clause when the write fails.
//
// 031: Dates, People and On your phones under headings, each hour indented
// under its switch with the hour in a pill, and the head says when they come.
//
// 042: Reminders between Dates and People, a switch and How many as three
// choice tiles that grey with it. Reminders ride in the two messages, so an
// hour greys only when both switches that use it are off.

import { useEffect, useState } from "react";
import { DATES_CAPTION, hoursOn, REMINDER_COUNT_DEFAULT, REMINDER_COUNTS, REMINDERS_LINE } from "@offload/widgets";
import { ChoiceTiles, Group, Row } from "./SettingsRows";
import { CountPreview } from "./ChoicePreviews";
import { Switch } from "../Switch";
import { currentMe, onMe, updateNotify, type Me } from "../../lib/use-me";
import { notifySummary } from "../../lib/settings";
import pane from "../../app/(shell)/shell.module.css";

type Switches =
  | "notifyDueToday"
  | "notifyComingTomorrow"
  | "notifyReminders"
  | "notifyPeopleRequests"
  | "notifySharedActivity";
type Hours = "notifyDueTodayAt" | "notifyComingTomorrowAt";
type Patch = Partial<Pick<Me, Switches | Hours | "notifyReminderCount">>;
type Count = "1" | "2" | "3";

export function NotificationsPane() {
  const [me, setMe] = useState<Me | null>(currentMe());
  useEffect(() => onMe(setMe), []);
  const [drawn, setDrawn] = useState<Patch>({});
  // The patch that did not land, so Try again can send the same one.
  const [failed, setFailed] = useState<Patch | null>(null);

  const value = <K extends keyof Patch>(key: K): Me[K] | undefined => (drawn[key] ?? me?.[key]) as Me[K] | undefined;

  async function write(patch: Patch): Promise<void> {
    setDrawn((held) => ({ ...held, ...patch }));
    setFailed(null);
    const ok = await updateNotify(patch);
    setDrawn((held) => {
      const next = { ...held };
      for (const key of Object.keys(patch) as (keyof Patch)[]) delete next[key];
      return next;
    });
    if (!ok) setFailed(patch);
  }

  // `joined` for a switch with its hour under it: no hairline between them.
  const toggle = (key: Switches, title: string, note?: string, last?: boolean, joined?: boolean) => (
    <label className={`${pane.settingsRow} ${last ? pane.settingsRowLast : ""} ${joined ? pane.settingsRowJoined : ""}`}>
      <span className={pane.settingsText}>
        <span className={pane.settingsTitle}>{title}</span>
        {note ? <span className={pane.settingsNote}>{note}</span> : null}
      </span>
      <span className={pane.settingsValue}>
        <Switch checked={value(key) === true} onChange={(next) => void write({ [key]: next })} />
      </span>
    </label>
  );

  const hour = (key: Hours, title: string, on: boolean, last?: boolean) => (
    <div className={`${pane.settingsRow} ${pane.settingsRowSub} ${last ? pane.settingsRowLast : ""} ${on ? "" : pane.settingsRowOff}`}>
      <span className={pane.settingsText}>
        <span className={pane.settingsTitle}>{title}</span>
      </span>
      <input
        type="time"
        step={300}
        className={pane.settingsTime}
        aria-label={title}
        disabled={!on}
        value={value(key) ?? (key === "notifyDueTodayAt" ? "08:00" : "19:00")}
        onChange={(event) => {
          if (/^([01]\d|2[0-3]):[0-5]\d$/.test(event.target.value)) void write({ [key]: event.target.value });
        }}
      />
    </div>
  );

  const summary = me
    ? notifySummary({
        notifyDueToday: value("notifyDueToday") === true,
        notifyDueTodayAt: value("notifyDueTodayAt") ?? me.notifyDueTodayAt,
        notifyComingTomorrow: value("notifyComingTomorrow") === true,
        notifyComingTomorrowAt: value("notifyComingTomorrowAt") ?? me.notifyComingTomorrowAt,
        notifyReminders: value("notifyReminders") === true,
      })
    : undefined;

  const reminders = value("notifyReminders") === true;
  const count = value("notifyReminderCount") ?? REMINDER_COUNT_DEFAULT;
  const hours = hoursOn({
    notifyDueToday: value("notifyDueToday") === true,
    notifyComingTomorrow: value("notifyComingTomorrow") === true,
    notifyReminders: reminders,
  });
  const caption = REMINDER_COUNTS.find((c) => c.count === count)?.caption;

  return (
    <>
      <div className={pane.paneHead}>
        <div style={{ minWidth: 0 }}>
          <h1 className={`${pane.paneTitle} ${pane.paneTitleBig}`}>Notifications</h1>
          {summary ? <p className={pane.paneSub}>{summary}</p> : null}
        </div>
      </div>

      <div className={pane.paneBody}>
        {failed ? (
          <div className={pane.settingsErrorLine} role="alert">
            <span className={pane.settingsRowError}>Couldn&apos;t save that.</span>
            <button type="button" className={pane.settingsRetry} onClick={() => void write(failed)}>
              Try again
            </button>
          </div>
        ) : null}

        <Group label="Dates" icon="calendar" caption={DATES_CAPTION}>
          {toggle("notifyDueToday", "Due today", "One message each morning.", false, true)}
          {hour("notifyDueTodayAt", "In the morning at", hours.morning)}
          {toggle("notifyComingTomorrow", "Tomorrow", "One message each evening.", false, true)}
          {hour("notifyComingTomorrowAt", "In the evening at", hours.evening, true)}
        </Group>

        <Group label="Reminders" icon="bell">
          {toggle("notifyReminders", "Reminders", REMINDERS_LINE, false, true)}
          <div className={`${pane.settingsChoice} ${reminders ? "" : pane.settingsRowOff}`}>
            <span className={pane.settingsTitle}>How many</span>
            <ChoiceTiles<Count>
              label="How many"
              options={REMINDER_COUNTS.map((c) => ({
                value: String(c.count) as Count,
                label: c.label,
                preview: <CountPreview count={c.count} />,
              }))}
              value={String(count) as Count}
              onChange={(next) => void write({ notifyReminderCount: Number(next) as 1 | 2 | 3 })}
              disabled={!reminders}
            />
            {caption ? <p className={pane.settingsCaption}>{caption}</p> : null}
          </div>
        </Group>

        <Group label="People" icon="users" caption="When someone reaches for you.">
          {toggle("notifyPeopleRequests", "Connection requests")}
          {toggle("notifySharedActivity", "Added to a shared thread", undefined, true)}
        </Group>

        {/* The web sends nothing itself: browser push is a permission, a
            transport and a refusal state of its own, and none of the four
            sends is worth opening it for. */}
        <Group label="On your phones" icon="smartphone">
          <Row
            title="These go to your phones"
            note="offload for web does not send notifications. Each phone has its own switch in its system settings."
            last
          />
        </Group>
      </div>
    </>
  );
}
