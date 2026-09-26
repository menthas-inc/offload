// The zones a person can pick from, what to call one, and when the strip
// shows. 023.
//
// Shared because every client needs the same three answers and a client
// deciding any of them alone is a drift with a date on it: the phones and the
// web would disagree about whether the device is somewhere else, which is the
// one question the strip exists to answer.

import { KNOWN_ZONES } from "./zones-list.js";

export { KNOWN_ZONES };

/** ICU's canonical spelling of a zone is sometimes the one tzdata renamed
 *  years ago. Node resolves Asia/Kolkata to Asia/Calcutta and Europe/Kyiv to
 *  Europe/Kiev, while a phone reports the current name, so an account whose
 *  clock was stored as ICU spelt it would differ from the phone that set it
 *  by spelling alone, and the strip would offer a switch to the zone it is
 *  already in. Every writer and every comparison goes through this table.
 *
 *  Renames only: the same place under its current name. Never the merges
 *  tzdata made in 2022, where Oslo became a link to Berlin; a person in Oslo
 *  is shown Oslo. */
const RENAMED: Record<string, string> = {
  "Africa/Asmera": "Africa/Asmara",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Catamarca": "America/Argentina/Catamarca",
  "America/Coral_Harbour": "America/Atikokan",
  "America/Cordoba": "America/Argentina/Cordoba",
  "America/Godthab": "America/Nuuk",
  "America/Indianapolis": "America/Indiana/Indianapolis",
  "America/Jujuy": "America/Argentina/Jujuy",
  "America/Louisville": "America/Kentucky/Louisville",
  "America/Mendoza": "America/Argentina/Mendoza",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Europe/Kiev": "Europe/Kyiv",
  "Pacific/Enderbury": "Pacific/Kanton",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
};

/** The current IANA name for a zone, whichever spelling ICU handed back. */
export function modernZoneName(name: string): string {
  return RENAMED[name] ?? name;
}

/** What a person reads: the city, never the region and never an offset.
 *  "America/Argentina/Buenos_Aires" is "Buenos Aires". */
export function zoneCity(name: string): string {
  const modern = modernZoneName(name);
  return modern.slice(modern.lastIndexOf("/") + 1).replace(/_/g, " ");
}

/** The regions a list is grouped under, in the order they are shown. */
export const ZONE_REGIONS = [
  "Africa",
  "America",
  "Antarctica",
  "Arctic",
  "Asia",
  "Atlantic",
  "Australia",
  "Europe",
  "Indian",
  "Pacific",
] as const;

/** Every zone this runtime knows, under its current name. The runtime's own
 *  list where it has one; Hermes has none, and reads the list checked in
 *  beside this file. */
export function knownZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  const raw = typeof intl.supportedValuesOf === "function" ? intl.supportedValuesOf("timeZone") : KNOWN_ZONES;
  return [...new Set(raw.map(modernZoneName))];
}

export interface ZoneGroup {
  region: string;
  zones: { name: string; city: string }[];
}

/** The list a person picks from: grouped by region, cities in order, needing
 *  no server. Names without a region, UTC among them, are not places and are
 *  left out. */
export function zonesByRegion(all: readonly string[] = knownZones(), locale = "en"): ZoneGroup[] {
  const groups = new Map<string, { name: string; city: string }[]>();
  for (const name of all) {
    const slash = name.indexOf("/");
    if (slash < 0) continue;
    const region = name.slice(0, slash);
    if (!(ZONE_REGIONS as readonly string[]).includes(region)) continue;
    const zones = groups.get(region) ?? [];
    zones.push({ name, city: zoneCity(name) });
    groups.set(region, zones);
  }
  return ZONE_REGIONS.filter((region) => groups.has(region)).map((region) => ({
    region,
    zones: groups.get(region)!.sort((a, b) => a.city.localeCompare(b.city, locale)),
  }));
}

export interface ZoneClock {
  timeZone: string | null;
  followDevice: boolean;
  keptTimeZone: string | null;
}

/** Whether the strip shows, and the two names it shows. Null when the device
 *  will not say, the account has no clock yet, the two agree, follow is off,
 *  or the device's zone is the one they answered Keep to. A third zone shows
 *  it again. */
export function zoneStrip(me: ZoneClock, device: string | null): { account: string; device: string } | null {
  if (!me.timeZone || !device || !me.followDevice) return null;
  const account = modernZoneName(me.timeZone);
  const here = modernZoneName(device);
  if (here === account) return null;
  if (me.keptTimeZone && modernZoneName(me.keptTimeZone) === here) return null;
  return { account, device: here };
}
