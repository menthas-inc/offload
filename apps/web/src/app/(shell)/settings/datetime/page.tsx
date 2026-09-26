"use client";

// Settings, Date and time. 023. The index sits beside it, as it does beside
// every settings page.

import { Panes } from "../../../../components/shell/Panes";
import { SettingsPane } from "../../../../components/panes/Settings";
import { DateTimePane } from "../../../../components/panes/DateTime";

export default function DateTimeRoute() {
  return (
    <Panes
      crumbs={[
        { label: "Settings", href: "/settings", icon: "settings" },
        { label: "Date and time", href: "/settings/datetime", icon: "clock" },
      ]}
      panes={[<SettingsPane key="settings" />, <DateTimePane key="datetime" />]}
    />
  );
}
