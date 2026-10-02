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

import { useEffect, useState } from "react";
import { Group, Row } from "./SettingsRows";
import { Switch } from "../Switch";
import { currentMe, onMe, updateNotify, type Me } from "../../lib/use-me";
import { notifySummary } from "../../lib/settings";
import pane from "../../app/(shell)/shell.module.css";

type Switches = "notifyDueToday" | "notifyComingTomorrow" | "notifyPeopleRequests" | "notifySharedActivity";
type Hours = "notifyDueTodayAt" | "notifyComingTomorrowAt";
type Patch = Partial<Pick<Me, Switches | Hours>>;

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
      })
    : undefined;

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

        <Group label="Dates" icon="calendar" caption="What is due, said once a day rather than one by one.">
          {toggle("notifyDueToday", "Due today", "One message each morning.", false, true)}
          {hour("notifyDueTodayAt", "In the morning at", value("notifyDueToday") === true)}
          {toggle("notifyComingTomorrow", "Tomorrow", "One message each evening.", false, true)}
          {hour("notifyComingTomorrowAt", "In the evening at", value("notifyComingTomorrow") === true, true)}
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
