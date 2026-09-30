"use client";

// Connected apps: Calendar, Mail (026), and two rows that are not built.
//
// **The kit draws four connectors and one of them works.** Mail, Browser and
// Photos stay listed because knowing what is coming is worth more than a page
// with one row on it, and each says plainly that it is not built rather than
// offering a button that does nothing.
//
// **The whole pane reads `available` first.** With no Google credentials
// configured this connector is inert by design, and Connect would be a control
// that cannot work. That is the shape the Maps key already established here.
//
// **019: the calendar page, inline.** Connected apps is already the second
// pane, so the calendar block sits where the Calendar row was rather than
// opening a third level. Before anything is connected it is first run's
// connect screen, verbatim, plus one sentence. Once connected: one block per
// account, then one switch for the offload account. Approving a calendar here
// adds it to no thread; threads pick from inside.

import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { Switch } from "../Switch";
import { CalendarRow } from "../CalendarRow";
import { ConnectBlock, ProviderMark } from "../ConnectBlock";
import { Group, Row } from "./SettingsRows";
import { MailBlock } from "../MailBlock";
import { useMe } from "../../lib/use-me";
import { useToast } from "../shell/Toast";
import {
  approveCalendar,
  connectUrl,
  disconnect,
  setAskFirst,
  useCalendars,
  type Connection,
} from "../../lib/use-calendars";
import pane from "../../app/(shell)/shell.module.css";
import styles from "../../app/(shell)/calendar.module.css";

const FAILED = "That did not go through. Try again.";

function connectedOn(iso: string): string {
  const at = new Date(iso);
  return `${at.getDate()} ${at.toLocaleString("en-GB", { month: "short" })}`;
}

export function AppsPane() {
  const { status, available, askFirst, connections, reload, settle } = useCalendars();
  const me = useMe("shell");
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function approve(id: string, selected: boolean) {
    setBusy(id);
    setFailed(false);
    const ok = await approveCalendar(id, selected);
    setBusy(null);
    if (ok) {
      settle({ calendarId: id, selected });
      reload();
    } else setFailed(true);
  }

  async function ask(next: boolean) {
    setFailed(false);
    if (await setAskFirst(next)) settle({ askFirst: next });
    else setFailed(true);
  }

  return (
    <>
      <div className={pane.paneHead}>
        <div style={{ minWidth: 0 }}>
          <h1 className={`${pane.paneTitle} ${pane.paneTitleBig}`}>Connected apps</h1>
        </div>
      </div>

      <div className={pane.paneBody}>
        {failed ? (
          <p className={pane.settingsRowError} role="alert">
            {FAILED}
          </p>
        ) : null}

        {status === "loading" ? null : !available ? (
          <Group label="Calendar">
            {/* Not a failure and not a promise. It says what is true. */}
            <Row title="Calendar" note="Not available yet." last />
          </Group>
        ) : connections.length === 0 ? (
          <ConnectBlock href={connectUrl("settings")} />
        ) : (
          <>
            {connections.map((connection) => (
              <ConnectionBlock
                key={connection.id}
                connection={connection}
                busy={busy}
                onApprove={approve}
                onDisconnected={reload}
                onFailed={() => setFailed(true)}
              />
            ))}

            <Group label="When offload adds something">
              {/* A label, as the Privacy pane's rows are, so the whole row is
                  the switch's target and the hidden input has a name. */}
              <label className={`${pane.settingsRow} ${pane.settingsRowLast}`}>
                <span className={pane.settingsText}>
                  <span className={pane.settingsTitle}>Ask before adding</span>
                  <span className={pane.settingsNote}>
                    Off means offload adds it without asking, unless somebody else would see it.
                  </span>
                </span>
                <span className={pane.settingsValue}>
                  <Switch checked={askFirst} onChange={(next) => void ask(next)} />
                </span>
              </label>
            </Group>
          </>
        )}

        {me.status === "ready" ? (
          <MailBlock email={me.me.email} mailAvailable={me.me.mailAvailable} onCopied={() => toast.show("Copied")} />
        ) : null}

        <Group label="Not built yet">
          <Row title="Browser" note="Save a page straight into a thread." />
          <Row title="Photos" note="Screenshots become things you can search." last />
        </Group>

        <Group label="What offload may do">
          <Row
            title="It writes to your calendar when you ask"
            note="It never sends mail or deletes photos. When a change would reach somebody else, it asks first."
            last
          />
        </Group>
      </div>
    </>
  );
}

/** One Google account: the provider block, the list with its count, and
 *  Disconnect. A second account is a second block. */
function ConnectionBlock({
  connection,
  busy,
  onApprove,
  onDisconnected,
  onFailed,
}: {
  connection: Connection;
  busy: string | null;
  onApprove: (id: string, selected: boolean) => Promise<void>;
  onDisconnected: () => void;
  onFailed: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const inUse = connection.calendars.filter((c) => c.selected).length;
  const count = inUse === 0 ? "None in use" : `${inUse} of ${connection.calendars.length} in use`;

  // Clicking anywhere else is a cancel, as the thread's own delete does it.
  useEffect(() => {
    if (!asking) return;
    const away = (event: MouseEvent): void => {
      if (box.current && !box.current.contains(event.target as Node)) setAsking(false);
    };
    document.addEventListener("mousedown", away, true);
    return () => document.removeEventListener("mousedown", away, true);
  }, [asking]);

  async function confirm() {
    setAsking(false);
    if (await disconnect(connection.id)) onDisconnected();
    else onFailed();
  }

  return (
    <>
      <section className={pane.settingsBlock}>
        <div className={styles.provider}>
          <ProviderMark size={34} />
          <span>
            <span className={styles.providerName}>Google Calendar</span>
            <span className={styles.providerMeta}>
              {connection.email}, connected {connectedOn(connection.connectedAt)}
            </span>
          </span>
        </div>

        {connection.state === "needs_reauth" ? (
          <Row title="Sign in again" note="offload lost access to this account." href={connectUrl("settings")} />
        ) : connection.needsScope ? (
          /* The grant lacks the sharing scope. The connection keeps working;
             every write confirms until they sign in again. */
          <Row
            title="Sign in again"
            note="offload needs one more permission: to see who can see each calendar. Until then it checks with you before every write."
            href={connectUrl("settings")}
          />
        ) : null}
      </section>

      <Group label="Calendars offload can use" count={count}>
        {connection.calendars.map((calendar, index) => (
          <CalendarRow
            key={calendar.id}
            calendar={calendar}
            picked={calendar.selected}
            disabled={busy === calendar.id}
            onChange={(next) => void onApprove(calendar.id, next)}
            last={index === connection.calendars.length - 1}
          />
        ))}
      </Group>

      <section className={pane.settingsBlock}>
        {asking ? (
          <div ref={box} className={pane.confirmRow}>
            <span className={pane.confirmText}>Disconnect Google Calendar?</span>
            <button type="button" className={pane.sectionAction} onClick={() => setAsking(false)}>
              Cancel
            </button>
            <button type="button" className={pane.danger} onClick={() => void confirm()}>
              Disconnect
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={`${pane.settingsRowButton} ${pane.settingsRowLast}`}
            onClick={() => setAsking(true)}
          >
            <span className={pane.settingsText}>
              <span className={`${pane.settingsTitle} ${styles.dangerTitle}`}>Disconnect Google Calendar</span>
              <span className={pane.settingsNote}>
                Notes offload made from your days stay. offload stops reading your calendars and cannot add to
                them.
              </span>
            </span>
            <span className={pane.settingsChevron} aria-hidden="true">
              <Icon name="chevron-right" size={15} />
            </span>
          </button>
        )}
      </section>
    </>
  );
}
