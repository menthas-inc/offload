"use client";

// Settings, Date and time. 023.
//
// The clock is the account's and the week is this browser's, the split 015
// made and this page keeps: Starts on moved here from Appearance because the
// month grid needs it everywhere, and it kept its store. The zone list is the
// runtime's own, grouped by region, in the Country row's shape, and needs no
// server.

import { useEffect, useMemo, useState } from "react";
import { modernZoneName, zoneCity, zonesByRegion } from "@offload/widgets";
import { Segmented } from "./Appearance";
import { Group } from "./SettingsRows";
import { Switch } from "../Switch";
import { WEEK_STARTS, WEEK_START_LABEL, useAppearance } from "../../lib/appearance";
import { currentMe, onMe, updateClock, type Me } from "../../lib/use-me";
import pane from "../../app/(shell)/shell.module.css";

export function DateTimePane() {
  // The identity the shell already asked for, heard rather than fetched again.
  const [me, setMe] = useState<Me | null>(currentMe());
  useEffect(() => onMe(setMe), []);
  const { weekStart, setWeekStart } = useAppearance();
  const groups = useMemo(() => zonesByRegion(), []);

  // The switch drawn first and written second; back to the server's word
  // once it answers, either way.
  const [follow, setFollow] = useState<boolean | null>(null);
  const following = follow ?? me?.followDevice ?? true;
  const current = me?.timeZone ? modernZoneName(me.timeZone) : "";

  async function switchFollow(next: boolean) {
    setFollow(next);
    await updateClock({ followDevice: next });
    setFollow(null);
  }

  return (
    <>
      <div className={pane.paneHead}>
        <div style={{ minWidth: 0 }}>
          <h1 className={`${pane.paneTitle} ${pane.paneTitleBig}`}>Date and time</h1>
          {current ? <p className={pane.paneSub}>{zoneCity(current)}</p> : null}
        </div>
      </div>

      <div className={pane.paneBody}>
        <Group label="Your clock">
          <div className={pane.settingsRow}>
            <span className={pane.settingsText}>
              <span className={pane.settingsTitle}>Time zone</span>
              <span className={pane.settingsNote}>Times are shown in this zone on every device.</span>
            </span>
            <select
              className={pane.settingsValue}
              aria-label="Time zone"
              value={current}
              onChange={(event) => void updateClock({ timeZone: event.target.value })}
            >
              {current ? null : <option value="">Not set</option>}
              {groups.map((group) => (
                <optgroup key={group.region} label={group.region}>
                  {group.zones.map((zone) => (
                    <option key={zone.name} value={zone.name}>
                      {zone.city}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <label className={`${pane.settingsRow} ${pane.settingsRowLast}`}>
            <span className={pane.settingsText}>
              <span className={pane.settingsTitle}>Follow this device</span>
              <span className={pane.settingsNote}>
                Offer to switch when this browser is somewhere else.
              </span>
            </span>
            <span className={pane.settingsValue}>
              <Switch checked={following} onChange={(next) => void switchFollow(next)} />
            </span>
          </label>
        </Group>

        <section className={pane.settingsBlock}>
          <h2 className={pane.settingsBlockTitle}>Week starts on</h2>
          <p className={pane.settingsNote}>
            Which day a thread&apos;s timeline begins its weeks on.
          </p>
          <Segmented<"monday" | "sunday">
            label="Week starts on"
            options={[...WEEK_STARTS]}
            labelFor={(value) => WEEK_START_LABEL[value] ?? value}
            value={weekStart}
            onChange={setWeekStart}
          />
        </section>
      </div>
    </>
  );
}
