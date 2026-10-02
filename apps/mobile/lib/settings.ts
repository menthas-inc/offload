// 031. The settings lines that are computed rather than written.

export type Provider = "apple" | "google";

const NAMES: Record<Provider, string> = { apple: "Apple", google: "Google" };

/** Where the email came from. One provider is named; two, or none to read,
 *  name neither, because either one alone would be half true. */
export function emailNote(providers: Provider[]): string {
  const only = providers.length === 1 ? providers[0] : undefined;
  return `From your ${only ? `${NAMES[only]} ` : ""}sign in. Changing it is not done here.`;
}

/** The Connected apps row's value: what is connected, or nothing. */
export function appsValue(connected: { calendar: boolean; mail: boolean }): string | undefined {
  const names = [connected.calendar ? "Calendar" : null, connected.mail ? "Mail" : null].filter(Boolean);
  return names.length > 0 ? names.join(", ") : undefined;
}

/** A session's lead: the app is on a phone, anything else is a screen. */
export function deviceGlyph(device: string): "smartphone" | "monitor" {
  return device.startsWith("The app") ? "smartphone" : "monitor";
}
