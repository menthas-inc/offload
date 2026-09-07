"use client";

// My account: who you are.
//
// **Four rows the kit draws are not here, for three different reasons.**
// `WSettings.jsx` and `SettingsDetail.jsx` both show Phone and Password, which
// go because this product is OAuth-only: there is no password to change and no
// phone stored, so both would be controls that do nothing. A Plan group goes
// because there are no plans, and inventing a tier on a settings screen is a
// product claim nobody has made. The kit's clay "Delete your account" panel
// goes because deletion is specified in 001 and not built, and a panel that
// does nothing is worse than its absence.
//
// The kit's "Signed in on" device list needs an endpoint that does not exist.
//
// Neither name nor email is editable here. Changing an email is an identity
// change with a verification flow behind it, not a text field.

import { Group, Row } from "./SettingsRows";
import { useMe } from "../../lib/use-me";
import pane from "../../app/(shell)/shell.module.css";

export function AccountPane() {
  const me = useMe("shell");
  const account = me.status === "ready" ? me.me : null;

  return (
    <>
      <div className={pane.paneHead}>
        <div style={{ minWidth: 0 }}>
          <h1 className={`${pane.paneTitle} ${pane.paneTitleBig}`}>My account</h1>
        </div>
      </div>

      <div className={pane.paneBody}>
        <Group label="Details">
          <Row title="Name" value={account?.displayName ?? "Not set"} />
          <Row title="Email" value={account?.email} last />
        </Group>
      </div>
    </>
  );
}
