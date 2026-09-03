"use client";

// Today, on day one.
//
// One pane, and thin on purpose: Today is a view assembled from threads,
// calendars and memories, and two of those three do not exist. What it has is
// the invitation and the three examples, and tapping an example fills the
// composer rather than submitting it, because the first thing that lands in an
// account should be something the person meant.
//
// The composer is no longer here. It is in the shell, under every pane, which
// is where the kit has always put it.

import { Panes } from "../../../components/shell/Panes";
import { TodayPane } from "../../../components/panes/Today";

export default function TodayRoute() {
  return <Panes crumbs={[{ label: "Today", href: "/today" }]} panes={[<TodayPane key="today" />]} />;
}
