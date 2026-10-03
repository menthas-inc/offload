// The words the panel uses for a cap and for a setting (034, section D).
//
// One map, because four pages say them: Limits, what has been hit, a
// person's page, where the same caps are shown against what somebody has
// used, and Audit, where a change to one is written down. A key the panel has
// no word for shows its key.

/** A cap that can refuse somebody: the eight per-person ones, and the
 *  platform's. The keys `limit_hits.cap` holds. */
export const CAP_LABELS: Record<string, string> = {
  "cap.spend_micros": "Spend",
  "cap.turns": "Turns",
  "cap.photos": "Photos",
  "cap.photo_bytes": "Photo megabytes",
  "cap.voice_notes": "Voice notes",
  "cap.voice_ms": "Voice minutes",
  "cap.mail_day": "Mail in a day",
  "cap.mail_hour": "Mail in an hour",
  "platform.spend_micros": "Platform spend",
};

export function capLabel(key: string): string {
  return CAP_LABELS[key] ?? key;
}

/** Every setting an owner can change, as Limits names it: the caps above,
 *  and the rest of the page. What a change is called when it is written as
 *  old to new. */
export const SETTING_LABELS: Record<string, string> = {
  ...CAP_LABELS,
  "platform.spend_micros": "Platform spend cap",
  "budget.month_micros": "Monthly budget",
  "waitlist.batch": "Waitlist batch, per week",
  "switch.web_maps": "The web's map",
  "switch.maps": "The map",
  "switch.web_search": "Web search",
  "switch.web_links": "Reading links",
  "switch.nightly": "The nightly pass",
  "costs.fixed": "Subscriptions",
};

export function settingLabel(key: string): string {
  return SETTING_LABELS[key] ?? key;
}
