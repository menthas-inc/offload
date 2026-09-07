"use client";

import { Panes } from "../../../../components/shell/Panes";
import { SettingsPane } from "../../../../components/panes/Settings";
import { AccountPane } from "../../../../components/panes/Account";

export default function AccountRoute() {
  return (
    <Panes
      crumbs={[
        { label: "Settings", href: "/settings", icon: "settings" },
        { label: "My account", href: "/settings/account", icon: "circle-dot" },
      ]}
      panes={[<SettingsPane key="settings" />, <AccountPane key="account" />]}
    />
  );
}
