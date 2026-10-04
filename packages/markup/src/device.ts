// A session's device, in words.
//
// The user agent a session was opened with is stored so a person can see
// where they are signed in and end a session that should not be there, which
// the privacy page promises (security review 2026-09-22, M8). A user agent is
// not something to show anybody, so this turns it into the six or so
// descriptions that matter and nothing finer.

const PHONE_APP = /okhttp|Dalvik|CFNetwork|Darwin|^offload/i;

function platformOf(ua: string): string | null {
  if (/iPhone|iPad|iPod|iOS|CFNetwork|Darwin/i.test(ua) && !/Macintosh/.test(ua)) return "iPhone";
  if (/Android|okhttp|Dalvik/i.test(ua)) return "Android";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Linux|CrOS/i.test(ua)) return "Linux";
  return null;
}

/** "Chrome on Mac", "The app on iPhone", or "A device" when nothing is known. */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (!ua.trim()) return "A device";
  const platform = platformOf(ua);
  if (PHONE_APP.test(ua) && !/Mozilla/.test(ua)) return platform ? `The app on ${platform}` : "The app";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\/|CriOS\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "A browser";
  return platform ? `${browser} on ${platform}` : browser;
}

/** The sessions on one device, as the "Signed in on" list draws them. */
export interface DeviceSessions {
  device: string;
  tokens: string[];
  /** The first sign-in there still live. */
  since: Date;
  /** The latest, which orders the list. */
  latest: Date;
}

/** One entry per device, newest first.
 *
 *  **There is no device id**, so a device is its description. Every sign-in
 *  is a new session and the old one lives on until it goes thirty days
 *  unused: a reinstall, a development build beside the store one, a cleared
 *  browser. Listed one by one they made a page of the same phone, and
 *  nobody thinks of a session, they think of a phone. The cost is that two
 *  Macs both on Chrome share an entry, and ending it signs both out. */
export function byDevice(
  sessions: { token: string; userAgent?: string | null | undefined; createdAt: Date | string }[],
): DeviceSessions[] {
  const devices = new Map<string, DeviceSessions>();
  for (const session of sessions) {
    const device = describeDevice(session.userAgent);
    const at = new Date(session.createdAt);
    const entry = devices.get(device);
    if (!entry) devices.set(device, { device, tokens: [session.token], since: at, latest: at });
    else {
      entry.tokens.push(session.token);
      if (at < entry.since) entry.since = at;
      if (at > entry.latest) entry.latest = at;
    }
  }
  return [...devices.values()].sort((a, b) => b.latest.getTime() - a.latest.getTime());
}
