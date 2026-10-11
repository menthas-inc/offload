// 024. What a send is filed under, and how a row of the record is drawn.
//
// The channel ids and the category ids were declared on the phone and on the
// server separately, and agreed by luck: a rename on either side would have
// filed a send under a channel a shipped phone never made, or dropped the two
// verbs on iOS, and a phone in somebody's pocket cannot be corrected. One
// declaration, read by both. The glyph and the tag rule lived twice as well,
// byte for byte, which is the drift this package exists to stop.

/** The five Android channels, ids permanent and invisible; the names are
 *  the notification titles, word for word, except Reminders (042), which is
 *  named as its switch because its title is a time. A channel is never
 *  renamed once a phone has created it. */
export const CHANNELS = [
  { id: "due_today", name: "Due today" },
  { id: "coming_tomorrow", name: "Tomorrow" },
  { id: "people_requests", name: "Connection requests" },
  { id: "shared_activity", name: "Added to a shared thread" },
  { id: "reminders", name: "Reminders" },
] as const;
export type ChannelId = (typeof CHANNELS)[number]["id"];

/** Which channel each digest is filed under. */
export const DIGEST_CHANNEL: Record<"morning" | "evening", ChannelId> = { morning: "due_today", evening: "coming_tomorrow" };
export const CHANNEL_REQUESTS: ChannelId = "people_requests";
export const CHANNEL_SHARED: ChannelId = "shared_activity";
/** 042. A reminder of its own, shortly before something with a clock time. */
export const CHANNEL_REMINDERS: ChannelId = "reminders";

/** The three categories: a one-task digest with its two verbs, a plain
 *  digest, and the people sends. */
export const VERBS_CATEGORY = "digest_verbs";
export const PLAIN_CATEGORY = "digest";
export const PEOPLE_CATEGORY = "people";

export type ActivityKind = "digest" | "request" | "share" | "shared_activity" | "expired" | "moved" | "acted" | "labelled" | "mail" | "export" | "reminder";
export type ActivityReason = "setting" | "permission" | "design";

/** The least a row of the record has to carry to be drawn. */
export interface ActivityShape {
  kind: ActivityKind;
  sent: boolean;
  reason: ActivityReason | null;
  send: "morning" | "evening" | null;
  /** 025. A labelled row somebody undid. */
  undone?: boolean;
}

/** The kind's glyph: the two digests by their hour of day, people by the
 *  faces, a moved date by the calendar, a verb by its tick, an expiry by the
 *  cross, and a switch that silenced something by the bell. */
export function activityGlyph(row: ActivityShape): string {
  if (row.kind === "digest") {
    if (!row.sent && row.reason !== "design") return "bell";
    return row.send === "evening" ? "moon" : "sunrise";
  }
  if (row.kind === "moved") return "calendar";
  if (row.kind === "acted") return "check";
  if (row.kind === "expired") return "x";
  if (row.kind === "labelled") return "tag";
  if (row.kind === "mail") return "mail";
  if (row.kind === "export") return "archive";
  if (row.kind === "reminder") return "bell";
  return "users";
}

/** Not sent is a fact, not an apology. Noticed where a setting or the
 *  permission caused it, and that row is a door to the setting; quiet where
 *  the product chose silence by design, and those rows are not doors. */
export function activityTag(row: ActivityShape): { label: "Not sent" | "Undone"; tone: "noticed" | "quiet" } | null {
  // 025. A labelled row records what offload decided and never sends, so Not
  // sent would say nothing; its tag slot says Undone once somebody undid it.
  // 026. So does an email's row: offload filed it with nobody watching.
  if (row.kind === "labelled" || row.kind === "mail") return row.undone ? { label: "Undone", tone: "quiet" } : null;
  // 035. A copy that is ready was never going to be sent: the row is the news.
  if (row.kind === "export") return null;
  if (row.sent) return null;
  return { label: "Not sent", tone: row.reason === "design" ? "quiet" : "noticed" };
}
