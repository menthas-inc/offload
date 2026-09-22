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
