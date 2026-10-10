// 031. The settings copy that is logic rather than a string: what a row's
// value or a pane head's summary says, worked out from what the page already
// holds. Pure, so each is tested on its own and the panes only draw.

import { zoneCity } from "@offload/widgets";

export type SignInProvider = "apple" | "google";

const PROVIDER_NAME: Record<SignInProvider, string> = { apple: "Apple", google: "Google" };

/** Email's note on My account. One provider is named; with both linked, or
 *  none reported, the note does not pick one. */
export function emailNote(providers: readonly SignInProvider[]): string {
  const from = providers.length === 1 ? `your ${PROVIDER_NAME[providers[0]!]} sign in` : "your sign in";
  return `From ${from}. Changing it is not done here.`;
}

interface Connected {
  /** At least one calendar connection, whatever its state. */
  calendar: boolean;
  /** Mail can reach them: false for an Apple hidden email. */
  mail: boolean;
}

function connectedNames({ calendar, mail }: Connected): string[] {
  return [...(calendar ? ["Calendar"] : []), ...(mail ? ["Mail"] : [])];
}

/** The index's Connected apps value: what is connected, or nothing. */
export function appsValue(connected: Connected): string | undefined {
  const names = connectedNames(connected);
  return names.length > 0 ? names.join(", ") : undefined;
}

const WEEK_DAY: Record<"monday" | "sunday", string> = { monday: "Monday", sunday: "Sunday" };

/** Date and time's head: the clock's city and the week's first day. */
export function clockSummary(zone: string | null, weekStart: "monday" | "sunday"): string {
  const day = WEEK_DAY[weekStart];
  return zone ? `${zoneCity(zone)}, weeks start ${day}` : `Weeks start ${day}`;
}

/** My people's head. Nothing at all when there is nobody to count. */
export function peopleSummary(connected: number, waiting: number): string | undefined {
  const parts = [
    ...(connected > 0 ? [`${connected} connected`] : []),
    ...(waiting > 0 ? [`${waiting} waiting on you`] : []),
  ];
  return parts.length > 0 ? parts.join(", ") : undefined;
}

/** Notifications' head, from the switches that are on. 042 counts
 *  Reminders, after the hours, since they ride in those two messages, and
 *  Calendar (2026-10-10) after them, since it rides in the morning one. */
export function notifySummary(me: {
  notifyDueToday: boolean;
  notifyDueTodayAt: string;
  notifyComingTomorrow: boolean;
  notifyComingTomorrowAt: string;
  notifyReminders?: boolean;
  notifyCalendar?: boolean;
}): string | undefined {
  const parts = [
    ...(me.notifyDueToday ? [`mornings at ${me.notifyDueTodayAt}`] : []),
    ...(me.notifyComingTomorrow ? [`evenings at ${me.notifyComingTomorrowAt}`] : []),
  ];
  if (me.notifyReminders) parts.push(parts.length > 0 ? "with reminders" : "reminders");
  if (me.notifyCalendar) parts.push(parts.length > 0 ? "with today's events" : "today's events");
  if (parts.length === 0) return undefined;
  const line = parts.join(", ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** The combobox's filter, which is the phones' picker rule: the name contains
 *  the text, or the code is exactly it. Case never matters. */
export function matchesFilter(option: { label: string; code?: string | undefined }, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return option.label.toLowerCase().includes(needle) || option.code?.toLowerCase() === needle;
}

/** Signed in on's lead for another session: the phone for the app, the screen
 *  for anything in a browser, from `describeDevice`'s words. The phones read
 *  it the same way. */
export function deviceGlyph(device: string): "smartphone" | "monitor" {
  return device.startsWith("The app") ? "smartphone" : "monitor";
}
