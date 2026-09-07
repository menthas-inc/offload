"use client";

// Settings, the index. One pane; opening a row puts its page beside it, which
// is what every other list in this shell does.

import { Panes } from "../../../components/shell/Panes";
import { SettingsPane } from "../../../components/panes/Settings";

export default function SettingsRoute() {
  return (
    <Panes
      crumbs={[{ label: "Settings", href: "/settings", icon: "settings" }]}
      panes={[<SettingsPane key="settings" />]}
    />
  );
}
