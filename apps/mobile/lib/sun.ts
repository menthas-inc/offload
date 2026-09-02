// Real sunrise and sunset, ported from the design system's
// ui_kits/mobile_app/sun.js (NOAA/suncalc method).
//
// The tab is Today until sunset and Tonight after it, and the design system is
// explicit that this is the real curve rather than a fixed 20:00 boundary: the
// point of the label is that it agrees with the window.
//
// Location: the browser kit asks navigator.geolocation. This does not. A
// location permission prompt on first run is a product decision and not one to
// make in passing, so we use the kit's own fallback, longitude estimated from
// the device's UTC offset and latitude at 45 degrees, which lands sunset within
// about half an hour across most of Europe and North America. Wiring
// expo-location later changes coords() and nothing else.

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;

const toJulian = (d: Date) => d.valueOf() / DAY_MS - 0.5 + J1970;
const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * DAY_MS);

type Events = { sunrise: Date | null; sunset: Date | null; polar: "day" | "night" | null };

export function events(date: Date, lat: number, lon: number): Events {
  const J = toJulian(date);
  const n = Math.round(J - J2000 - 0.0009 - -lon / 360);
  const Js = J2000 + 0.0009 + -lon / 360 + n;
  const M = (357.5291 + 0.98560028 * (Js - J2000)) * RAD;
  const C = (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) * RAD;
  const L = M + C + 102.9372 * RAD + Math.PI;
  const Jtransit = Js + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const dec = Math.asin(Math.sin(L) * Math.sin(23.44 * RAD));
  const cosH =
    (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(dec)) / (Math.cos(lat * RAD) * Math.cos(dec));

  // Above the Arctic circle the sun may not cross the horizon at all, and
  // acos() of an out-of-range value is NaN rather than an error, which would
  // otherwise read as "not night" all winter.
  if (cosH > 1) return { sunrise: null, sunset: null, polar: "night" };
  if (cosH < -1) return { sunrise: null, sunset: null, polar: "day" };

  const H = Math.acos(cosH) / RAD;
  const Jset = J2000 + 0.0009 + ((H - lon) / 360 + n) + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const Jrise = Jtransit - (Jset - Jtransit);
  return { sunrise: fromJulian(Jrise), sunset: fromJulian(Jset), polar: null };
}

/** Estimated from the device's own clock, see the note above. */
function coords(): { lat: number; lon: number } {
  return { lat: 45, lon: -new Date().getTimezoneOffset() / 4 };
}

/** True from sunset until sunrise. */
export function isNight(date: Date = new Date()): boolean {
  const { lat, lon } = coords();
  const e = events(date, lat, lon);
  if (e.polar) return e.polar === "night";
  return date >= e.sunset! || date < e.sunrise!;
}

/** What the first tab is called right now. Two states only. */
export function timeOfDay(date: Date = new Date()): { label: "Today" | "Tonight"; icon: "sun" | "moon" } {
  return isNight(date) ? { label: "Tonight", icon: "moon" } : { label: "Today", icon: "sun" };
}
