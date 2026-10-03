"use client";

// Audit. Every staff write, newest first.
//
// 034, section F. Groundwork stubs the page so the nav leads somewhere:
// the pane head and one line. The section replaces this file, building from
// `../../ui` and from nothing of its own.

import { Empty, PaneHead } from "../../ui";

export default function AuditPage() {
  return (
    <>
      <PaneHead title="Audit" />
      <Empty>Nothing here yet.</Empty>
    </>
  );
}
