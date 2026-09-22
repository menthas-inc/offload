"use client";

// Settings, Notifications, on the web. 024.
//
// The same account switches and hours the phones show, and one line under
// the heading: the web sends nothing itself. Browser push is a separate
// permission, transport and refusal state, and none of the four sends is
// worth opening it for. Labels match the notification titles word for word.
// A switch or an hour is drawn first and written second, and put back with
// one clause when the write fails.

import { useEffect, useState } from "react";
import { Group } from "./SettingsRows";
import { Switch } from "../Switch";
import { currentMe, onMe, updateNotify, type Me } from "../../lib/use-me";
import pane from "../../app/(shell)/shell.module.css";

type Switches = "notifyDueToday" | "notifyComingTomorrow" | "notifyPeopleRequests" | "notifySharedActivity";
type Hours = "notifyDueTodayAt" | "notifyComingTomorrowAt";
type Patch = Partial<Pick<Me, Switches | Hours>>;

export function NotificationsPane() {
  const [me, setMe] = useState<Me | null>(currentMe());
  useEffect(() => onMe(setMe), []);
  const [drawn, setDrawn] = useState<Patch>({});
  const [failed, setFailed] = useState(false);

  const value = <K extends keyof Patch>(key: K): Me[K] | undefined => (drawn[key] ?? me?.[key]) as Me[K] | undefined;

  async function write(patch: Patch): Promise<void> {
    setDrawn((held) => ({ ...held, ...patch }));
    setFailed(false);
    const ok = await updateNotify(patch);
    setDrawn((held) => {
      const next = { ...held };
      for (const key of Object.keys(patch) as (keyof Patch)[]) delete next[key];
      return next;
    });
    if (!ok) setFailed(true);
  }

  const toggle = (key: Switches, title: string, note?: string, last?: boolean) => (
    <label className={`${pane.settingsRow} ${last ? pane.settingsRowLast : ""}`}>
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
    <div className={`${pane.settingsRow} ${last ? pane.settingsRowLast : ""}`} style={{ opacity: on ? 1 : 0.45 }}>
      <span className={pane.settingsText}>
        <span className={pane.settingsTitle}>{title}</span>
      </span>
      <input
        type="time"
        step={300}
        className={pane.settingsValue}
        aria-label={title}
        disabled={!on}
        value={value(key) ?? (key === "notifyDueTodayAt" ? "08:00" : "19:00")}
        onChange={(event) => {
          if (/^([01]\d|2[0-3]):[0-5]\d$/.test(event.target.value)) void write({ [key]: event.target.value });
        }}
      />
    </div>
  );

  return (
    <>
      <div className={pane.paneHead}>
        <div style={{ minWidth: 0 }}>
          <h1 className={`${pane.paneTitle} ${pane.paneTitleBig}`}>Notifications</h1>
          <p className={pane.paneSub}>offload sends these to your phone.</p>
        </div>
      </div>

      <div className={pane.paneBody}>
        {failed ? (
          <p className={pane.settingsRowError} aria-live="polite">
            Couldn&apos;t save that.
          </p>
        ) : null}

        <Group label="Dates">
          {toggle("notifyDueToday", "Due today", "One message each morning.")}
          {hour("notifyDueTodayAt", "In the morning at", value("notifyDueToday") === true)}
          {toggle("notifyComingTomorrow", "Tomorrow", "One message each evening.")}
          {hour("notifyComingTomorrowAt", "In the evening at", value("notifyComingTomorrow") === true, true)}
        </Group>

        <Group label="People">
          {toggle("notifyPeopleRequests", "Connection requests")}
          {toggle("notifySharedActivity", "Added to a shared thread", undefined, true)}
        </Group>
      </div>
    </>
  );
}
