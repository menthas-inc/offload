"use client";

// Help and about.
//
// **No version row on web.** `package.json` says `0.0.0`, the app is
// continuously deployed and has no version cycle to read, and printing `0.0.0`
// would be exactly the number-nothing-computes this feature refuses everywhere
// else. The phones show one because they genuinely have one.
//
// The kit also draws "How offload works", "Ask for help", "Report something
// wrong", Terms and Licences. None of those pages or channels exists.

import { Group, Row } from "./SettingsRows";
import pane from "../../app/(shell)/shell.module.css";

export function HelpPane() {
  return (
    <>
      <div className={pane.paneHead}>
        <div style={{ minWidth: 0 }}>
          <h1 className={`${pane.paneTitle} ${pane.paneTitleBig}`}>Help and about</h1>
        </div>
      </div>

      <div className={pane.paneBody}>
        <Group>
          <Row title="Privacy policy" href="/privacy" last />
        </Group>
      </div>
    </>
  );
}
