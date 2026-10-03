"use client";

// People. Every account that has signed in, and a person's page.
//
// 034, section A. Groundwork stubs the page so the nav leads somewhere:
// the pane head and one line. The section replaces this file, building from
// `../../ui` and from nothing of its own.

import { Empty, PaneHead } from "../../ui";

export default function PeoplePage() {
  return (
    <>
      <PaneHead title="People" />
      <Empty>Nothing here yet.</Empty>
    </>
  );
}
