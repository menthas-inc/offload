"use client";

import { Panes } from "../../../../components/shell/Panes";
import { SettingsPane } from "../../../../components/panes/Settings";
import { AppsPane } from "../../../../components/panes/Apps";

export default function AppsRoute() {
  return (
    <Panes
      crumbs={[
        { label: "Settings", href: "/settings", icon: "settings" },
        { label: "Connected apps", href: "/settings/apps", icon: "link" },
      ]}
      panes={[<SettingsPane key="settings" />, <AppsPane key="apps" />]}
    />
  );
}
