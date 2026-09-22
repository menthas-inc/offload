"use client";

// Activity, from the sidebar's item, alive since 024.

import { Panes } from "../../../components/shell/Panes";
import { ActivityPane } from "../../../components/panes/Activity";

export default function ActivityRoute() {
  return (
    <Panes
      crumbs={[{ label: "Activity", href: "/activity", icon: "bell" }]}
      panes={[<ActivityPane key="activity" />]}
    />
  );
}
