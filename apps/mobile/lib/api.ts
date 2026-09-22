// Talking to the Core API from a phone.
//
// Every call carries the session the Expo plugin stored, and every response is
// read the same way: the server decides, the client renders. There is no local
// copy of "am I signed in" beyond the token itself, because a client-side
// answer to that question is one that can disagree with the server's.

import { authClient, API_URL } from "./auth";

export interface Me {
  accountId: string;
  state: "invited" | "active";
  displayName: string | null;
  email: string;
  needsFirstRun: boolean;
  /** No name yet, so one is asked for before the app is any use. */
  needsName: boolean;
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
 *  Two questions, one gate. They came apart because every account that existed
 *  when 011 shipped had finished first run and had no name, so "finished first
 *  run" stopped being the same as "ready". */
export function stillAsking(me: Me): boolean {
  return me.needsFirstRun || me.needsName;
}

/** Race a promise against a deadline, resolving to a fallback instead of
 *  hanging.
 *
 *  Used on the secure-storage read below. Nothing about "look up a stored
 *  cookie" should be able to stop the app forever, and on a device it did:
 *  every screen sat blank because the read never settled and the fetch that
 *  depended on it therefore never happened. A slow or unavailable keystore is
 *  a reason to be signed out, not a reason to show nothing. */
async function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
  if (!response || !response.ok) return null;
  return (await response.json()) as T;
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
  if (!response.ok) return { status: response.status, data: null };

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
  if (!response.ok) return { status: response.status, data: null };
  const text = await response.text();
  return { status: response.status, data: text.length > 0 ? (JSON.parse(text) as T) : null };
}

export { API_URL };

export const getMe = (): Promise<Me | null> => request<Me>("/api/me");

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
