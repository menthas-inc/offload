"use client";

import { Panes } from "../../../../components/shell/Panes";
import { SettingsPane } from "../../../../components/panes/Settings";
import { PeoplePane } from "../../../../components/panes/People";

export default function PeopleRoute() {
  return (
    <Panes
      crumbs={[
        { label: "Settings", href: "/settings", icon: "settings" },
        { label: "My people", href: "/settings/people", icon: "users" },
      ]}
      panes={[<SettingsPane key="settings" />, <PeoplePane key="people" />]}
    />
  );
}
