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
//
// 031: Profile, Where you are, Signed in on and Sign out, as the phones have
// them. Country is a combobox rather than a native select, which drew a white
// field in dark.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Combobox, EditableRow, Group, Row } from "./SettingsRows";
import { NAME_MAX } from "../../lib/name";
import { deviceGlyph, emailNote } from "../../lib/settings";
import { signOut } from "../../lib/sign-out";
import { fetchCountries, updateCountry, updateName, useMe } from "../../lib/use-me";
import { endOthers, endSignedIn, listSignedIn, thisDevice, type SignedIn } from "../../lib/sessions";
import pane from "../../app/(shell)/shell.module.css";

const since = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export function AccountPane() {
  const router = useRouter();
  const me = useMe("shell");
  const account = me.status === "ready" ? me.me : null;

  // One fetch for the whole list, on mount. It is the ISO register and does not
  // change while somebody is looking at this screen.
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([]);
  useEffect(() => {
    void fetchCountries().then(setCountries);
  }, []);

  // This device, from the session this browser holds, apart from the list:
  // it is drawn whatever the list does.
  const [here, setHere] = useState<string | null>(null);
  useEffect(() => {
    void thisDevice().then(({ device }) => setHere(device));
  }, []);

  // The others. Read on mount and after every End, since the list is the only
  // thing on this screen that changes under them. A failed read is said as
  // one, never drawn as an empty list.
  const [others, setOthers] = useState<SignedIn[] | "failed" | null>(null);
  const loadOthers = useCallback(() => {
    void listSignedIn().then(setOthers, () => setOthers("failed"));
  }, []);
  useEffect(loadOthers, [loadOthers]);

  const [leaving, setLeaving] = useState(false);
  const [leaveFailed, setLeaveFailed] = useState(false);
  async function leave(): Promise<void> {
    if (leaving) return;
    setLeaving(true);
    setLeaveFailed(false);
    try {
      await signOut();
      // Only once the server has agreed, as the index's Sign out does.
      router.replace("/sign-in");
    } catch {
      setLeaving(false);
      setLeaveFailed(true);
    }
  }

  const listed = Array.isArray(others) ? others : [];

  return (
    <>
      <div className={pane.paneHead}>
        <div style={{ minWidth: 0 }}>
          <h1 className={`${pane.paneTitle} ${pane.paneTitleBig}`}>My account</h1>
        </div>
      </div>

      <div className={pane.paneBody}>
        <Group label="Profile" icon="circle-dot">
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
          <Row
            title="Email"
            value={account?.email}
            note={account ? emailNote(account.signInProviders ?? []) : undefined}
            last
          />
        </Group>

        {/* **Where they are, because offload had no idea.** Asked for the
            next bank holiday it answered Columbus Day from three American
            sources: correct somewhere, wrong for whoever asked. A search takes
            its assumptions from nowhere. Here rather than in Privacy: it is a
            fact about them, like their name. */}
        <Group
          label="Where you are"
          icon="map-pin"
          caption="So a date or a forecast is the one where you are. Leave it unset and offload says it does not know rather than guessing."
        >
          <div className={`${pane.settingsRow} ${pane.settingsRowLast}`}>
            <span className={pane.settingsText}>
              <span className={pane.settingsTitle}>Country</span>
            </span>
            <Combobox
              label="Country"
              value={account?.country ?? ""}
              options={countries.map((country) => ({ value: country.code, label: country.name, code: country.code }))}
              notSet
              filterPlaceholder="Find a country"
              onChange={(next) => void updateCountry(next || null)}
            />
          </div>
        </Group>

        {/* This device first, then every other live session. Ending one signs
            that device out on its next request; this device leaves through
            Sign out. */}
        <Group label="Signed in on" icon="monitor" caption="Ending a session signs that device out on its next request.">
          {here ? (
            <Row
              icon="monitor"
              title={here}
              status="This device"
              last={!Array.isArray(others)}
            />
          ) : null}
          {listed.map((row) => (
            <Row
              key={row.token}
              icon={deviceGlyph(row.device)}
              title={row.device}
              note={`Since ${since.format(row.since)}`}
              pill="End"
              actionLabel={`End the session on ${row.device}`}
              onClick={() => void endSignedIn(row.token).then(loadOthers)}
            />
          ))}
          {listed.length > 0 ? (
            <Row title="End all other sessions" strong last onClick={() => void endOthers().then(loadOthers)} />
          ) : null}
          {Array.isArray(others) && others.length === 0 ? (
            <Row title="Nowhere else" note="Sign in on another device and it shows here." last />
          ) : null}
          {others === "failed" ? (
            <p className={pane.settingsFailLine} role="alert">
              Couldn&apos;t load your other devices.
              <button type="button" className={pane.settingsRetry} onClick={loadOthers}>
                Try again
              </button>
            </p>
          ) : null}
        </Group>

        <Group>
          <Row
            icon="log-out"
            title={leaving ? "Signing out" : "Sign out"}
            strong
            last
            disabled={leaving}
            onClick={() => void leave()}
          />
          {/* What happened, and the way forward beside it. */}
          {leaveFailed ? (
            <p className={pane.settingsFailLine} role="alert">
              That didn&rsquo;t go through.
              <button type="button" className={pane.settingsRetry} onClick={() => void leave()}>
                Try again
              </button>
            </p>
          ) : null}
        </Group>
      </div>
    </>
  );
}
