// How the audit log reads: a plain phrase per kind of write, and a setting's
// value in its own units. The stored entry holds a kind, a key and two
// values; none of those is something to show somebody.
//
// What a setting is called is Limits' to say (`limits/labels.ts`).

import { count, day, dollars } from "../../ui";

/** What was done, as a phrase. A kind with no phrase shows as its kind. */
export const KIND_LABELS: Record<string, string> = {
  invited: "Invited",
  resent: "Sent the invite again",
  "waitlist.removed": "Removed from the waitlist",
  disabled: "Disabled the account",
  enabled: "Enabled the account",
  "deletion.scheduled": "Scheduled deletion",
  "deletion.cancelled": "Cancelled deletion",
  deleted: "Deleted the account",
  signed_out: "Signed out everywhere",
  "override.set": "Set a limit for one person",
  "override.cleared": "Cleared a limit for one person",
  "setting.changed": "Changed a setting",
  "job.retried": "Retried a job",
  "job.dismissed": "Dismissed a job",
  "staff.added": "Added to staff",
  "staff.role_changed": "Changed a role",
  "staff.removed": "Removed from staff",
  "person.viewed": "Opened their page",
  "panel.opened": "Opened the panel",
  "code.created": "Made a review code",
  "code.revoked": "Revoked a review code",
  "code.redeemed": "A review code let somebody in",
  "staff.exported": "Exported the staff list",
  "audit.exported": "Exported the audit log",
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

type Unit = "dollars" | "megabytes" | "minutes";

/** The settings whose number is not a plain count, and the one whose null
 *  reads as off. */
const UNITS: Record<string, Unit> = {
  "cap.spend_micros": "dollars",
  "cap.photo_bytes": "megabytes",
  "cap.storage_bytes": "megabytes",
  "cap.voice_ms": "minutes",
  "platform.spend_micros": "dollars",
  "budget.month_micros": "dollars",
};

const UNSET: Record<string, string> = { "platform.spend_micros": "off" };

/** A stored value as the Limits page would write it. Null is a value: a cap
 *  that is off, a figure nobody has set. */
export function settingValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return UNSET[key] ?? "not set";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "number") {
    switch (UNITS[key]) {
      case "dollars":
        return dollars(value);
      case "megabytes":
        return `${count(Math.round(value / (1024 * 1024)))} MB`;
      case "minutes":
        return `${count(Math.round(value / 60_000))} min`;
      default:
        return count(value);
    }
  }
  if (typeof value === "object") {
    const amounts = Object.entries(value as Record<string, unknown>).filter((pair): pair is [string, number] => typeof pair[1] === "number");
    return amounts.length ? amounts.map(([vendor, micros]) => `${vendor} ${dollars(micros)}`).join(", ") : "none";
  }
  return String(value);
}

/** The first stretch of an id, enough to tell two apart on a page. */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

/** The period an export of the log covered, stored as `from/to` UTC days. */
export function period(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const [from, to] = value.split("/");
  return from && to ? `${day(from)} to ${day(to)}` : null;
}
