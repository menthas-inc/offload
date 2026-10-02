"use client";

// Settings, the calendar page, one level under Connected apps: each account's
// calendars and Disconnect, and Ask before adding. 031 moved it here from
// inline, as Blocked sits under My people.

import { Panes } from "../../../../../components/shell/Panes";
import { AppsCalendarPane, AppsPane } from "../../../../../components/panes/Apps";

export default function AppsCalendarRoute() {
  return (
    <Panes
      crumbs={[
        { label: "Settings", href: "/settings", icon: "settings" },
        { label: "Connected apps", href: "/settings/apps", icon: "link" },
        { label: "Calendar", href: "/settings/apps/calendar", icon: "calendar" },
      ]}
      panes={[<AppsPane key="apps" />, <AppsCalendarPane key="calendar" />]}
    />
  );
}
