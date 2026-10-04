"use client";

// My account: who you are.
//
// **Three rows the kit draws are not here, for two different reasons.**
// `WSettings.jsx` and `SettingsDetail.jsx` both show Phone and Password, which
// go because this product is OAuth-only: there is no password to change and no
// phone stored, so both would be controls that do nothing. A Plan group goes
// because there are no plans, and inventing a tier on a settings screen is a
// product claim nobody has made. The kit's clay "Delete your account" panel
// was the fourth until 035 built deletion; it is the last thing on the page.
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
import { DeleteAccount } from "./DeleteAccount";
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

  // A refused End keeps its row and says so, with the same End beside it: a
  // security control that did not run must not look like one that did.
  const [endFailed, setEndFailed] = useState<SignedIn | "others" | null>(null);
  async function end(row: SignedIn | "others") {
    setEndFailed(null);
    const ok = row === "others" ? await endOthers() : await endSignedIn(row.tokens);
    if (ok) loadOthers();
    else setEndFailed(row);
  }

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
        <Group label="Profile" icon="circle-dot" caption="How you appear to people you share with.">
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
          caption="Used to show dates and times in local time."
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

        {/* This device first, then every other device. Ending one signs
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
          {/* One row per device, however many times it has signed in. */}
          {listed.map((row) => (
            <Row
              key={row.device}
              icon={deviceGlyph(row.device)}
              title={row.device}
              note={
                row.tokens.length === 1
                  ? `Since ${since.format(row.since)}`
                  : `${row.tokens.length} sessions since ${since.format(row.since)}`
              }
              pill="End"
              actionLabel={
                row.tokens.length === 1
                  ? `End the session on ${row.device}`
                  : `End the ${row.tokens.length} sessions on ${row.device}`
              }
              onClick={() => void end(row)}
            />
          ))}
          {listed.length > 0 ? (
            <Row title="End all other sessions" strong last onClick={() => void end("others")} />
          ) : null}
          {Array.isArray(others) && others.length === 0 ? (
            <Row title="Nowhere else" note="Sign in on another device and it shows here." last />
          ) : null}
          {endFailed ? (
            <p className={pane.settingsFailLine} role="alert">
              That didn&apos;t go through.
              <button type="button" className={pane.settingsRetry} onClick={() => void end(endFailed)}>
                Try again
              </button>
            </p>
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

        {/* 035. Last, and apart from the rest, as the kit draws it. */}
        <DeleteAccount />
      </div>
    </>
  );
}
