"use client";

// Connected apps: Calendar, and three rows that are not built.
//
// **The kit draws four connectors and one of them works.** Mail, Browser and
// Photos stay listed because knowing what is coming is worth more than a page
// with one row on it, and each says plainly that it is not built rather than
// offering a button that does nothing.
//
// **The whole pane reads `available` first.** With no Google credentials
// configured this connector is inert by design, and Connect would be a control
// that cannot work. That is the shape the Maps key already established here.

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { Group, Row } from "./SettingsRows";
import {
  connectUrl,
  disconnect,
  updateCalendar,
  useCalendars,
  type Calendar,
} from "../../lib/use-calendars";
import { fetchThreads, type ThreadRow } from "../../lib/threads";
import pane from "../../app/(shell)/shell.module.css";

/** What a calendar's state says on the right of its row. */
function calendarValue(calendar: Calendar): string {
  if (!calendar.selected) return "Off";
  return calendar.isShared ? "On, shared" : "On";
}

export function AppsPane() {
  const { status, available, connections, reload } = useCalendars();
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void fetchThreads().then((groups) => setThreads(groups.flatMap((group) => group.threads)));
  }, []);

  async function change(calendar: Calendar, patch: Parameters<typeof updateCalendar>[1]) {
    setBusy(calendar.id);
    setFailed(false);
    const ok = await updateCalendar(calendar.id, patch);
    setBusy(null);
    if (ok) reload();
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
            That did not go through. Try again.
          </p>
        ) : null}

        {status === "loading" ? null : !available ? (
          <Group label="Calendar">
            {/* Not a failure and not a promise. It says what is true. */}
            <Row title="Calendar" note="Not available yet." last />
          </Group>
        ) : connections.length === 0 ? (
          <Group label="Calendar">
            <Row
              title="Google Calendar"
              note="See your week in offload, and let it add things for you."
              last
            />
            <a className={pane.settingsEditButton} href={connectUrl("settings")}>
              Connect
            </a>
          </Group>
        ) : (
          connections.map((connection) => (
            <Group key={connection.id} label={connection.email}>
              {connection.state === "needs_reauth" ? (
                <Row
                  title="Sign in again"
                  note="offload lost access to this account."
                  value="Reconnect"
                />
              ) : null}

              {connection.calendars.map((calendar, index) => (
                <div key={calendar.id}>
                  <Row
                    title={calendar.summary}
                    note={calendar.writable ? undefined : "You can only read this one."}
                    value={busy === calendar.id ? "Saving" : calendarValue(calendar)}
                    last={index === connection.calendars.length - 1}
                  />

                  <div className={pane.settingsEdit} style={{ justifyContent: "flex-start", gap: "var(--space-4)", paddingBottom: "var(--space-4)" }}>
                    {/* Where it files. A calendar that reads has to name a
                        thread: an event offload holds is content, and content
                        belongs to a thread. */}
                    <select
                      className={pane.settingsInput}
                      value={calendar.threadId ?? ""}
                      aria-label={`Where ${calendar.summary} files`}
                      onChange={(event) =>
                        void change(calendar, {
                          threadId: event.target.value || null,
                          ...(event.target.value ? {} : { selected: false }),
                        })
                      }
                    >
                      <option value="">Nowhere yet</option>
                      {threads.map((thread) => (
                        <option key={thread.id} value={thread.id}>
                          {thread.name}
                        </option>
                      ))}
                    </select>

                    <label className={pane.settingsTitle}>
                      <input
                        type="checkbox"
                        checked={calendar.selected}
                        disabled={!calendar.threadId}
                        onChange={(event) => void change(calendar, { selected: event.target.checked })}
                      />{" "}
                      Read this one
                    </label>

                    {/* Whether anybody else sees it, which is what decides
                        whether offload asks before it writes. Ours to ask
                        because Google cannot answer it: a calendar can be
                        public to anyone with the link. */}
                    <label className={pane.settingsTitle}>
                      <input
                        type="checkbox"
                        checked={calendar.isShared}
                        disabled={calendar.accessRole !== "owner"}
                        onChange={(event) => void change(calendar, { isShared: event.target.checked })}
                      />{" "}
                      Other people see this
                    </label>
                  </div>
                </div>
              ))}

              <button
                type="button"
                className={pane.settingsEditText}
                onClick={async () => {
                  // Disconnecting stops the sync. What was already filed is
                  // yours and stays, and removing it is a different question
                  // nobody is being asked here.
                  if (await disconnect(connection.id, false)) reload();
                  else setFailed(true);
                }}
              >
                Disconnect
              </button>
            </Group>
          ))
        )}

        <Group label="Not built yet">
          <Row title="Mail" note="So a confirmation files itself." />
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
