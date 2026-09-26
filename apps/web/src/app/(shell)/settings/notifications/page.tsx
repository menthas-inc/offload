"use client";

// Settings, Notifications. 024. The index sits beside it, as it does beside
// every settings page.

import { Panes } from "../../../../components/shell/Panes";
import { SettingsPane } from "../../../../components/panes/Settings";
import { NotificationsPane } from "../../../../components/panes/Notifications";

export default function NotificationsRoute() {
  return (
    <Panes
      crumbs={[
        { label: "Settings", href: "/settings", icon: "settings" },
        { label: "Notifications", href: "/settings/notifications", icon: "bell" },
      ]}
      panes={[<SettingsPane key="settings" />, <NotificationsPane key="notifications" />]}
    />
  );
}
