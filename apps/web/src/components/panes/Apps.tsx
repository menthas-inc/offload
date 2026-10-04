"use client";

// Connected apps: one card per app. 031.
//
// **The kit drew four connectors and one of them worked.** Browser and Photos
// were listed as not built, and What offload may do was a paragraph in a row;
// all three went in 031, leaving the two that exist as cards side by side.
//
// **The calendar card reads `available` first.** With no Google credentials
// configured this connector is inert by design, and Connect would be a control
// that cannot work, so there is no card at all. Mail is always shown, whatever
// the calendar's state.
//
// **The per-account list is one level down.** 019 put the calendar page inline
// here, because this was already the second pane; the cards made room for
// what a person changes often, the count and Ask before adding, and the list
// moved to `/settings/apps/calendar`, as the phones have it. Approving a
// calendar adds it to no thread; threads pick from inside.
//
// **Disconnect is on the card** (2026-10-04). It went down with the list in
// 031, behind a row named "Calendars offload can use", which says what that
// page is for and is not where anybody looks to disconnect. One row per
// account, since each is disconnected on its own.
//
// **No heading over the cards, and no summary under the title** (2026-10-05).
// "Calendar and Mail" and a "Connected" section said what the two cards
// below them already say, and Mail is always there whatever is connected.

import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { Switch } from "../Switch";
import { CalendarRow } from "../CalendarRow";
import { ConnectBlock, ProviderMark } from "../ConnectBlock";
import { Group, Row, StatusPill } from "./SettingsRows";
import { MailCard } from "../MailBlock";
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

/** Ask before adding, as a row. A label, as the Privacy pane's rows are, so
 *  the whole row is the switch's target and the hidden input has a name. */
function AskRow({
  checked,
  onChange,
  last = true,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  last?: boolean;
}) {
  return (
    <label className={`${pane.settingsRow} ${last ? pane.settingsRowLast : ""}`}>
      <span className={pane.settingsText}>
        <span className={pane.settingsTitle}>Ask before adding</span>
        <span className={pane.settingsNote}>
          Off means offload adds it without asking, unless somebody else would see it.
        </span>
      </span>
      <span className={pane.settingsValue}>
        <Switch checked={checked} onChange={onChange} />
      </span>
    </label>
  );
}

export function AppsPane() {
  const { status, available, askFirst, connections, reload, settle } = useCalendars();
  const me = useMe("shell");
  const toast = useToast();
  const [failed, setFailed] = useState(false);
  const account = me.status === "ready" ? me.me : null;

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

        <div className={pane.appCards}>
          {status === "ready" && available ? (
            <CalendarCard
              connections={connections}
              askFirst={askFirst}
              onAsk={(next) => void ask(next)}
              onDisconnected={reload}
              onFailed={() => setFailed(true)}
            />
          ) : null}
          {account ? (
            <MailCard email={account.email} mailAvailable={account.mailAvailable} onCopied={() => toast.show("Copied")} />
          ) : null}
        </div>
      </div>
    </>
  );
}

/** Google Calendar's card: connected, needing sign-in again, or not
 *  connected. Every account it holds is counted together; the calendar page
 *  lists them one by one, and each has its own Disconnect here. */
function CalendarCard({
  connections,
  askFirst,
  onAsk,
  onDisconnected,
  onFailed,
}: {
  connections: Connection[];
  askFirst: boolean;
  onAsk: (next: boolean) => void;
  onDisconnected: () => void;
  onFailed: () => void;
}) {
  const connected = connections.length > 0;
  // A lost grant, or one without the sharing scope: either way the connect
  // flow again is what fixes it.
  const signInAgain = connections.some((c) => c.state === "needs_reauth" || c.needsScope);
  const calendars = connections.flatMap((c) => c.calendars);
  const inUse = calendars.filter((c) => c.selected).length;
  const line = !connected
    ? "See your week in offload, and let it add to your calendar."
    : connections.length === 1
      ? `${connections[0]!.email}, connected ${connectedOn(connections[0]!.connectedAt)}`
      : `${connections.length} Google accounts`;

  return (
    <div className={pane.appCard}>
      <div className={pane.appHead}>
        <span className={pane.appMark} aria-hidden="true">
          <ProviderMark size={42} />
        </span>
        <span className={pane.appText}>
          <span className={pane.appName}>Google Calendar</span>
          <span className={pane.appLine}>{line}</span>
        </span>
        {!connected ? (
          <a className={pane.appAction} href={connectUrl("settings")}>
            Connect
          </a>
        ) : signInAgain ? (
          <a className={pane.appAction} href={connectUrl("settings")}>
            Sign in again
          </a>
        ) : (
          <StatusPill>Connected</StatusPill>
        )}
      </div>
      {connected ? (
        <div className={pane.appRows}>
          <Row title="Calendars offload can use" value={`${inUse} of ${calendars.length}`} href="/settings/apps/calendar" />
          <AskRow checked={askFirst} onChange={onAsk} last={false} />
          {connections.map((connection, index) => (
            <DisconnectRow
              key={connection.id}
              connection={connection}
              title={connections.length === 1 ? "Disconnect Google Calendar" : `Disconnect ${connection.email}`}
              last={index === connections.length - 1}
              onDisconnected={onDisconnected}
              onFailed={onFailed}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Disconnect one account. It asks once, in the row's own place, and clicking
 *  anywhere else is a cancel, as the thread's own delete does it. */
function DisconnectRow({
  connection,
  title,
  last,
  onDisconnected,
  onFailed,
}: {
  connection: Connection;
  title: string;
  last: boolean;
  onDisconnected: () => void;
  onFailed: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const box = useRef<HTMLDivElement>(null);

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

  if (asking) {
    return (
      <div ref={box} className={pane.confirmRow}>
        <span className={pane.confirmText}>{title}?</span>
        <button type="button" className={pane.sectionAction} onClick={() => setAsking(false)}>
          Cancel
        </button>
        <button type="button" className={pane.danger} onClick={() => void confirm()}>
          Disconnect
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`${pane.settingsRowButton} ${last ? pane.settingsRowLast : ""}`}
      onClick={() => setAsking(true)}
    >
      <span className={pane.settingsText}>
        <span className={`${pane.settingsTitle} ${styles.dangerTitle}`}>{title}</span>
        <span className={pane.settingsNote}>
          Notes offload made from your days stay. offload stops reading your calendars and cannot add to them.
        </span>
      </span>
    </button>
  );
}

/** The calendar page, one level under Connected apps: each account with its
 *  calendars, then Ask before adding, which is the same switch
 *  the card carries. Before anything is connected it is first run's connect
 *  screen, verbatim, plus one sentence. */
export function AppsCalendarPane() {
  const { status, available, askFirst, connections, reload, settle } = useCalendars();
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
          <h1 className={`${pane.paneTitle} ${pane.paneTitleBig}`}>Calendar</h1>
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
              />
            ))}

            <Group label="When offload adds something">
              <AskRow checked={askFirst} onChange={(next) => void ask(next)} />
            </Group>
          </>
        )}
      </div>
    </>
  );
}

/** One Google account: the provider block and the list with its count. A
 *  second account is a second block. */
function ConnectionBlock({
  connection,
  busy,
  onApprove,
}: {
  connection: Connection;
  busy: string | null;
  onApprove: (id: string, selected: boolean) => Promise<void>;
}) {
  const inUse = connection.calendars.filter((c) => c.selected).length;
  const count = inUse === 0 ? "None in use" : `${inUse} of ${connection.calendars.length} in use`;

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
    </>
  );
}
