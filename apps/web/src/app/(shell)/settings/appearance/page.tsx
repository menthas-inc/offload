"use client";

// Settings, Appearance. The index sits beside it now, which is what the earlier
// version of this file said would happen once there was one. The URL is
// unchanged, because it has been shipped and linked.

import { Panes } from "../../../../components/shell/Panes";
import { SettingsPane } from "../../../../components/panes/Settings";
import { AppearancePane } from "../../../../components/panes/Appearance";

export default function AppearanceRoute() {
  return (
    <Panes
      crumbs={[
        { label: "Settings", href: "/settings", icon: "settings" },
        { label: "Appearance", href: "/settings/appearance", icon: "blend" },
      ]}
      panes={[<SettingsPane key="settings" />, <AppearancePane key="appearance" />]}
    />
  );
}
