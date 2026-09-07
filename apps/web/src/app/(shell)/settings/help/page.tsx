"use client";

import { Panes } from "../../../../components/shell/Panes";
import { SettingsPane } from "../../../../components/panes/Settings";
import { HelpPane } from "../../../../components/panes/Help";

export default function HelpRoute() {
  return (
    <Panes
      crumbs={[
        { label: "Settings", href: "/settings", icon: "settings" },
        { label: "Help and about", href: "/settings/help", icon: "compass" },
      ]}
      panes={[<SettingsPane key="settings" />, <HelpPane key="help" />]}
    />
  );
}
