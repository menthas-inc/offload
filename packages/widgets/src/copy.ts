// 035. The Your copy row: what it says in each state, decided once so the
// phones and the web cannot drift. No state says why, and a failure sits
// beside the control that acts on it.

export interface CopyState {
  state: "idle" | "making" | "ready" | "failed" | "waiting";
  readyAt: string | null;
  expiresAt: string | null;
  nextAt: string | null;
}

export interface CopyRow {
  title: string;
  note: string | null;
  action: "Export" | "Download" | "Try again" | null;
  /** The one spinner, while the copy is being made. */
  busy: boolean;
  /** Whether Delete copy is offered. */
  canDelete: boolean;
}

/** How often the row is read again while a copy is being made, and only then. */
export const COPY_POLL_MS = 5000;

/** A day and a short month in the account's zone: 3 Oct. Null for no day:
 *  absent rather than invented. */
function day(iso: string | null, zone: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  const say = (timeZone: string) => new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short" }).format(at);
  try {
    return say(zone ?? "UTC");
  } catch {
    return say("UTC");
  }
}

const NOTHING = { note: null, action: null, busy: false, canDelete: false } as const;

export function copyRow(copy: CopyState, zone: string | null): CopyRow {
  switch (copy.state) {
    case "making":
      return { ...NOTHING, title: "Making your copy", busy: true };
    case "ready": {
      const made = day(copy.readyAt, zone);
      const until = day(copy.expiresAt, zone);
      return {
        title: made ? `Ready, ${made}` : "Ready",
        note: until ? `Kept until ${until}` : null,
        action: "Download",
        busy: false,
        canDelete: true,
      };
    }
    case "failed":
      return { ...NOTHING, title: "Couldn't make your copy", action: "Try again" };
    case "waiting": {
      const from = day(copy.nextAt, zone);
      return { ...NOTHING, title: from ? `Next copy from ${from}` : "Next copy in a few days" };
    }
    default:
      return { ...NOTHING, title: "Export everything", note: "One file, readable without offload.", action: "Export" };
  }
}
