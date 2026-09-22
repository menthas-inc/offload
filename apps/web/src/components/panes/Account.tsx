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
// The kit's "Signed in on" list is here since the security review of
// 2026-09-22 (M8): the privacy page had promised it since the first draft.
//
// The email is not editable here. Changing one is an identity change with a
// verification flow behind it, not a text field. The name is, since 011.

import { useCallback, useEffect, useState } from "react";
import { EditableRow, Group, Row } from "./SettingsRows";
import { NAME_MAX } from "../../lib/name";
import { fetchCountries, updateCountry, updateName, useMe } from "../../lib/use-me";
import { endSignedIn, listSignedIn, type SignedIn } from "../../lib/sessions";

const since = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
import pane from "../../app/(shell)/shell.module.css";

export function AccountPane() {
  const me = useMe("shell");
  const account = me.status === "ready" ? me.me : null;

  // One fetch for the whole list, on mount. It is the ISO register and does not
  // change while somebody is looking at this screen.
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([]);
  useEffect(() => {
    void fetchCountries().then(setCountries);
  }, []);

  // Where they are signed in. Read on mount and after every End, since the
  // list is the only thing on this screen that changes under them.
  const [signedIn, setSignedIn] = useState<SignedIn[] | null>(null);
  const loadSignedIn = useCallback(() => {
    void listSignedIn().then(setSignedIn).catch(() => setSignedIn([]));
  }, []);
  useEffect(loadSignedIn, [loadSignedIn]);

  return (
    <>
      <div className={pane.paneHead}>
        <div style={{ minWidth: 0 }}>
          <h1 className={`${pane.paneTitle} ${pane.paneTitleBig}`}>My account</h1>
        </div>
      </div>

      <div className={pane.paneBody}>
        <Group label="Details">
          <EditableRow
            title="Name"
            value={account?.displayName ?? null}
            placeholder="Your name"
            maxLength={NAME_MAX}
            label="Your name"
            // `updateName` broadcasts the identity it got back, so this pane
            // and the settings index beside it both move, initials included.
            onSave={async (next) => (await updateName(next)) !== null}
          />
          <Row title="Email" value={account?.email} />

          {/* **Where they are, because offload had no idea.** Asked for the
              next bank holiday it answered Columbus Day from three American
              sources: correct somewhere, wrong for whoever asked. A search takes
              its assumptions from nowhere.

              Here rather than in Privacy: it is a fact about them, like their
              name, and it reads as one. What it changes is in the note. */}
          <div className={pane.settingsRow} data-last>
            <span className={pane.settingsText}>
              <span className={pane.settingsTitle}>Country</span>
              <span className={pane.settingsNote}>
                So a date or a forecast is the one where you are. Leave it unset
                and offload says it does not know rather than guessing.
              </span>
            </span>
            <select
              className={pane.settingsValue}
              aria-label="Country"
              value={account?.country ?? ""}
              onChange={(event) => void updateCountry(event.target.value || null)}
            >
              <option value="">Not set</option>
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
          </div>
        </Group>

        {/* Every live session, this one first. Ending one signs that device
            out on its next request; this device leaves through Sign out. */}
        <Group label="Signed in on">
          {(signedIn ?? []).map((row, index) => (
            <div key={row.token} className={pane.settingsRow} data-last={index === (signedIn?.length ?? 0) - 1 || undefined}>
              <span className={pane.settingsText}>
                <span className={pane.settingsTitle}>{row.device}</span>
                <span className={pane.settingsNote}>
                  {row.current ? "This device" : `Since ${since.format(row.since)}`}
                </span>
              </span>
              {row.current ? null : (
                <button
                  type="button"
                  className={pane.settingsValue}
                  onClick={() => void endSignedIn(row.token).then(loadSignedIn)}
                  aria-label={`End the session on ${row.device}`}
                >
                  End
                </button>
              )}
            </div>
          ))}
          {signedIn !== null && signedIn.length === 0 ? <Row title="Nothing else" last /> : null}
        </Group>
      </div>
    </>
  );
}
