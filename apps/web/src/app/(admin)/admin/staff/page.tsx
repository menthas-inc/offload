"use client";

// Staff. Who can open this panel.
//
// 034, section F. Groundwork stubs the page so the nav leads somewhere:
// the pane head and one line. The section replaces this file, building from
// `../../ui` and from nothing of its own.

import { Empty, PaneHead } from "../../ui";

export default function StaffPage() {
  return (
    <>
      <PaneHead title="Staff" />
      <Empty>Nothing here yet.</Empty>
    </>
  );
}
