"use client";

// Settings, Privacy. 016's two switches, beside the index like every other
// settings page.

import { Panes } from "../../../../components/shell/Panes";
import { SettingsPane } from "../../../../components/panes/Settings";
import { PrivacyPane } from "../../../../components/panes/Privacy";

export default function PrivacyRoute() {
  return (
    <Panes
      crumbs={[
        { label: "Settings", href: "/settings", icon: "settings" },
        { label: "Privacy", href: "/settings/privacy", icon: "orbit" },
      ]}
      panes={[<SettingsPane key="settings" />, <PrivacyPane key="privacy" />]}
    />
  );
}
