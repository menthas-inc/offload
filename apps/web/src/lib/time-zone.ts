// The device's time zone, on every request that reaches the model.
//
// A dump, a typed or tapped answer and a row typed into a thread all end in a
// prompt that says what day it is and reads "3pm" as a moment, and until the
// account carries a zone of its own the device's is the one there is. Sent as
// a header rather than a field so the three call sites share one line, and
// read by the API against ICU, so a browser that answers something odd costs
// nothing but the zone.

/** `{ "x-time-zone": "Europe/Lisbon" }`, or nothing when the browser will not
 *  say, which older engines and locked-down privacy modes do. */
export function timeZoneHeader(): Record<string, string> {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone ? { "x-time-zone": zone } : {};
  } catch {
    return {};
  }
}
