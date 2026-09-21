"use client";

import { Panes } from "../../../../../components/shell/Panes";
import { PeoplePane, BlockedPane } from "../../../../../components/panes/People";

export default function BlockedRoute() {
  return (
    <Panes
      crumbs={[
        { label: "Settings", href: "/settings", icon: "settings" },
        { label: "My people", href: "/settings/people", icon: "users" },
        { label: "Blocked", href: "/settings/people/blocked", icon: "lock" },
      ]}
      panes={[<PeoplePane key="people" />, <BlockedPane key="blocked" />]}
    />
  );
}
