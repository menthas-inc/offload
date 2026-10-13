// Talking to the Core API from a phone.
//
// Every call carries the session the Expo plugin stored, and every response is
// read the same way: the server decides, the client renders. There is no local
// copy of "am I signed in" beyond the token itself, because a client-side
// answer to that question is one that can disagree with the server's.

import { authClient, API_URL, sessionRefused } from "./auth";
import { within } from "./within";

export interface Me {
  accountId: string;
  state: "invited" | "active";
  displayName: string | null;
  email: string;
  needsFirstRun: boolean;
  /** No name yet, so one is asked for before the app is any use. */
  needsName: boolean;
  /** Active, and agreed to an older privacy policy or terms: the two ticks
   *  are asked again, alone, before the app. */
  needsConsent: boolean;
  /** What Apple or Google called them, to fill the field in. Only ever sent to
   *  the account it belongs to. */
  suggestedName: string | null;
  /** 016. Whether offload may search the web, and whether it may open a link
   *  they pasted. Two rather than one because they are two different promises:
   *  a search sends their own words to a third party, and reading a link they
   *  pasted sends nothing of theirs anywhere. */
  webSearch: boolean;
  webLinks: boolean;
  /** Where they said they are, ISO 3166-1 alpha-2. Null until they say, and
   *  offload then tells the model it does not know rather than assuming. */
  country: string | null;
}

/** Whether this account still has something to answer before the shell.
 *
 *  Three questions, one gate. They came apart because every account that
 *  existed when 011 shipped had finished first run and had no name, so
 *  "finished first run" stopped being the same as "ready", and an account can
 *  finish it and then see the policy or the terms move. */
export function stillAsking(me: Me): boolean {
  return me.needsFirstRun || me.needsName || me.needsConsent;
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  // The plugin keeps the cookie in secure storage and hands it back here,
  // because React Native has no cookie jar the way a browser does. It reads
  // from storage, so it is a promise: awaited, not spread, or the header value
  // is the string "[object Promise]" and every call is unauthenticated.
  //
  // Bounded, and failure means "no cookie" rather than "no request". Sending
  // an unauthenticated request gets a 401 the caller already handles; sending
  // none at all is a screen that never changes.
  const cookie = await within(
    Promise.resolve(authClient.getCookie()).catch(() => ""),
    3000,
    ""
  );

  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string> | undefined) ?? {}),
    ...(init.body ? { "content-type": "application/json" } : {}),
    ...(cookie ? { cookie } : {}),
  };

  // Bounded too. A request with no timeout on a phone is a request that can
  // outlive the screen that asked for it.
  const response = await within(
    fetch(`${API_URL}${path}`, { ...init, headers }),
    15000,
    null as unknown as Response
  );
  if (!response || !response.ok) {
    refused(response, cookie);
    return null;
  }
  return (await response.json()) as T;
}

/** A 401 on a request that carried the cookie is the server ending the
 *  session this device holds. Forgotten and reported, so the shell shows the
 *  gate rather than an app with every screen empty, which is what the Pixel
 *  showed on 2026-09-23 after a sign-out the device never heard back from.
 *  Without a cookie a 401 is the gate asking, which is not news. */
function refused(response: Response | null, cookie: string): void {
  if (response?.status === 401 && cookie) void sessionRefused();
}

/** A call whose status matters.
 *
 *  `request` below swallows everything into `null`, which is right for a read
 *  where a failure and an empty answer look the same to the screen. It is wrong
 *  for a write: a note that is too long is a 413, a refusal is a 404, and a
 *  screen that treats both as "nothing happened" is the bug the web shipped
 *  last week. *The 409 that used to be here was the cap of ten, which 014
 *  removed: nothing a person dumps is refused for being one too many.*
 */
export interface Sent<T> {
  status: number;
  data: T | null;
  /** The refusal's code when the server named one, `{ "error": "..." }`. 025:
   *  a label sheet says the one clause that code names. */
  error?: string;
  /** 027. Seconds from a `Retry-After` on a refusal, when it carried one. */
  retryAfter?: number;
}

/** The three requests whose body ends in a model prompt. */
function reachesTheModel(path: string): boolean {
  return (
    path === "/v1/dumps" ||
    /^\/v1\/questions\/[^/]+\/answer$/.test(path) ||
    /^\/v1\/threads\/[^/]+\/quick-add$/.test(path)
  );
}

/** `{ "x-time-zone": "Europe/Lisbon" }`, or nothing when the runtime will
 *  not say. Hermes answers on both platforms; the guard is for the day it
 *  does not. */
function timeZoneHeader(): Record<string, string> {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone ? { "x-time-zone": zone } : {};
  } catch {
    return {};
  }
}

export async function send<T>(path: string, init: RequestInit = {}): Promise<Sent<T>> {
  const cookie = await within(
    Promise.resolve(authClient.getCookie()).catch(() => ""),
    3000,
    ""
  );

  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string> | undefined) ?? {}),
    // Only when there is a body. Fastify refuses an empty body that claims a
    // JSON content type, and the web client shipped two dead deletes learning
    // that. Here it is decided from the body rather than from which of two
    // constants somebody reached for, so the mistake is not available.
    ...(init.body ? { "content-type": "application/json" } : {}),
    ...(cookie ? { cookie } : {}),
    // The device's time zone, on the requests that reach the model (a dump,
    // an answer, a typed row), so the turn can say what day it is where they
    // are. Those three and no others, which is what the privacy page says.
    ...(reachesTheModel(path) ? timeZoneHeader() : {}),
  };

  const response = await within(
    fetch(`${API_URL}${path}`, { ...init, headers }),
    15000,
    null as unknown as Response
  );
  if (!response) return { status: 0, data: null };
  if (!response.ok) {
    refused(response, cookie);
    const error = await response
      .json()
      .then((body: unknown) => (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : undefined))
      .catch(() => undefined);
    const wait = Number(response.headers?.get?.("retry-after") ?? NaN);
    return {
      status: response.status,
      data: null,
      ...(error ? { error } : {}),
      ...(Number.isFinite(wait) && wait > 0 ? { retryAfter: Math.min(wait, 300) } : {}),
    };
  }

  // 204 and an empty body are legitimate answers, not parse failures.
  const text = await response.text();
  return {
    status: response.status,
    data: text.length > 0 ? (JSON.parse(text) as T) : null,
  };
}

/** The cookie header the API wants, for a fetch this module does not make:
 *  an `Image` loading a rendition sends it as a header, since React Native
 *  has no cookie jar. Empty when signed out. */
export async function authHeaders(): Promise<Record<string, string>> {
  const cookie = await within(Promise.resolve(authClient.getCookie()).catch(() => ""), 3000, "");
  return cookie ? { cookie } : {};
}

/** 020. A multipart upload. No content type of our own: the runtime writes
 *  the boundary, and setting one by hand is the one way to break it. A minute
 *  rather than fifteen seconds, because a photo on a slow connection is
 *  longer than a JSON body. */
export async function upload<T>(path: string, form: FormData): Promise<Sent<T>> {
  const headers = await authHeaders();
  const response = await within(
    fetch(`${API_URL}${path}`, { method: "POST", body: form, headers }),
    60000,
    null as unknown as Response,
  );
  if (!response) return { status: 0, data: null };
  if (!response.ok) {
    refused(response, headers["cookie"] ?? "");
    // 036. Which refusal a 429 was, everything kept or the day's, is in the
    // body; read the way `send` reads it.
    const error = await response
      .json()
      .then((body: unknown) => (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : undefined))
      .catch(() => undefined);
    return { status: response.status, data: null, ...(error ? { error } : {}) };
  }
  const text = await response.text();
  return { status: response.status, data: text.length > 0 ? (JSON.parse(text) as T) : null };
}

export { API_URL };

/** Launch's question, and the one read where a failure is not an empty
 *  answer.
 *
 *  Only a 401 means signed out. On 2026-09-30 Railway's edge answered a 404
 *  for nine minutes with every service healthy, and when this was `request`,
 *  that null sent a phone with a good session to the gate. Anything but a 401
 *  or the account is the app not hearing an answer, and launch holds. */
export function getMe(): Promise<Me | "signed-out" | "unreachable"> {
  // The root layout and the index route both ask at launch, in one frame:
  // one request answers both.
  asking ??= (async () => {
    retryAfter = null;
    try {
      const { status, data, retryAfter: wait } = await send<Me>("/api/me");
      if (status === 401) return "signed-out" as const;
      if (!data) retryAfter = wait ?? null;
      return data ?? ("unreachable" as const);
    } catch {
      return "unreachable" as const;
    } finally {
      asking = null;
    }
  })();
  return asking;
}

let asking: Promise<Me | "signed-out" | "unreachable"> | null = null;

/** 027. The seconds a `Retry-After` asked for on launch's last unanswered
 *  read, which launch waits at least as long as. */
let retryAfter: number | null = null;
export function lastRetryAfter(): number | null {
  return retryAfter;
}

/** Finishing first run, with both ticks from the consent screen. The server
 *  refuses anything else, so a build that predates the consent screen gets a
 *  400 rather than quietly producing an active account that agreed to nothing.
 *
 *  Returns whether the server actually recorded it, which the caller has to
 *  check. It used to return the parsed body as `unknown` and every caller
 *  discarded it, so a 401 from a session that expired mid-onboarding, or a
 *  network failure, landed the person on Today with the account still
 *  `invited` and no consent written. The web has always checked; this is the
 *  same contract. */
export async function completeOnboarding(
  displayName: string,
  /** 023. The device's zone, which becomes the account's clock. Left out
   *  rather than sent empty when the runtime will not say. */
  timeZone: string | null = null,
): Promise<boolean> {
  try {
    const result = await request("/api/onboarding/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        readPolicy: true,
        agreeToProcessing: true,
        displayName,
        ...(timeZone ? { timeZone } : {}),
      }),
    });
    return result !== null;
  } catch {
    // request() resolves to null on a bad response but still rejects if fetch
    // itself throws, and an uncaught rejection here left `leaving` true
    // forever with nothing on screen to say why.
    return false;
  }
}

// ---------------------------------------------------------------- 024

/** The account's Activity, a page at a time, and the agenda. Shapes as the
 *  server sends them; the screens read them through their own libs. */
export async function fetchActivity<T>(cursor: string | null): Promise<T | null> {
  return request<T>(`/v1/activity${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
}

export async function markActivitySeen(): Promise<void> {
  await request("/v1/activity/seen", { method: "POST" }).catch(() => null);
}


/** What this build can take beyond the sends. 042: a reminder of its own,
 *  since it has the channel and the door; an older build never says so. */
const TAKES = ["reminder"] as const;

export async function registerPushToken(token: string, platform: "ios" | "android"): Promise<boolean> {
  const result = await request("/v1/push-tokens", { method: "POST", body: JSON.stringify({ token, platform, takes: TAKES }) }).catch(() => null);
  return result !== null;
}

/** Once, and once more: a token left bound past a sign-out is the last
 *  account's words on the next person's lock screen. */
export async function deletePushToken(token: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await request("/v1/push-tokens", { method: "DELETE", body: JSON.stringify({ token }) }).catch(() => null);
    if (result !== null) return true;
  }
  return false;
}

/** A verb from a notification: the session and the row's id, nothing else. */
export async function actOnNotification(action: "done" | "tomorrow", contentId: string): Promise<boolean> {
  const result = await request("/v1/notifications/act", { method: "POST", body: JSON.stringify({ action, contentId }) }).catch(() => null);
  return result !== null;
}
