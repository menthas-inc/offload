"use client";

// Health. One page, three views in the pane head: Now, Jobs, Calls.
//
// 034, section E. There is no mock for this page; it is built from the
// panel's own vocabulary in `../../ui`. Each view reads its own routes and
// carries the head, so the head can say when that view was read.

import { useView } from "./head";
import { NowView } from "./now";
import { JobsView } from "./jobs";
import { CallsView } from "./calls";

// The view and the range are read from the address. The boundary that needs
// is the shell's (`layout.tsx`), one for every page.
export default function HealthPage() {
  const view = useView();
  if (view === "jobs") return <JobsView />;
  if (view === "calls") return <CallsView />;
  return <NowView />;
}
