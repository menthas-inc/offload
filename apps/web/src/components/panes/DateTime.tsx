"use client";

// Settings, Date and time. 023.
//
// The clock is the account's and the week is this browser's, the split 015
// made and this page keeps: Starts on moved here from Appearance because the
// month grid needs it everywhere, and it kept its store. The zone list is the
// runtime's own, grouped by region, in the Country row's shape, and needs no
// server.

import { useEffect, useMemo, useState } from "react";
import { modernZoneName, zonesByRegion } from "@offload/widgets";
import { ChoiceTiles, Combobox, Group } from "./SettingsRows";
import { WeekPreview } from "./ChoicePreviews";
import { Switch } from "../Switch";
import { WEEK_STARTS, WEEK_START_LABEL, useAppearance } from "../../lib/appearance";
import { clockSummary } from "../../lib/settings";
import { currentMe, onMe, updateClock, type Me } from "../../lib/use-me";
import pane from "../../app/(shell)/shell.module.css";

export function DateTimePane() {
  // The identity the shell already asked for, heard rather than fetched again.
  const [me, setMe] = useState<Me | null>(currentMe());
  useEffect(() => onMe(setMe), []);
  const { weekStart, setWeekStart } = useAppearance();
  // 031. The runtime's zones as the combobox's options, each run under its
  // region's heading; a zone's own name is the code the filter matches whole.
  const zones = useMemo(
    () =>
      zonesByRegion().flatMap((group) =>
        group.zones.map((zone) => ({ value: zone.name, label: zone.city, code: zone.name, group: group.region })),
      ),
    [],
  );

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
          <p className={pane.paneSub}>{clockSummary(current || null, weekStart)}</p>
        </div>
      </div>

      <div className={pane.paneBody}>
        <Group label="Your clock" icon="clock" caption="Everything is shown and scheduled in this zone.">
          <div className={pane.settingsRow}>
            <span className={pane.settingsText}>
              <span className={pane.settingsTitle}>Time zone</span>
            </span>
            <Combobox
              label="Time zone"
              value={current}
              options={zones}
              filterPlaceholder="Find a city"
              onChange={(next) => void updateClock({ timeZone: next })}
            />
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

        <Group label="Week starts on" icon="calendar" caption="Which day a thread's timeline begins its weeks on.">
          <ChoiceTiles<"monday" | "sunday">
            label="Week starts on"
            options={WEEK_STARTS.map((value) => ({
              value,
              label: WEEK_START_LABEL[value] ?? value,
              preview: <WeekPreview start={value} />,
            }))}
            value={weekStart}
            onChange={setWeekStart}
          />
        </Group>
      </div>
    </>
  );
}
