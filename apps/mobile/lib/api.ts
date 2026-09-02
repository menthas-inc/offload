// Talking to the Core API from a phone.
//
// Every call carries the session the Expo plugin stored, and every response is
// read the same way: the server decides, the client renders. There is no local
// copy of "am I signed in" beyond the token itself, because a client-side
// answer to that question is one that can disagree with the server's.

import { authClient, API_URL } from "./auth";

export interface Me {
  state: "invited" | "active";
  displayName: string | null;
  email: string;
  needsFirstRun: boolean;
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T | null> {
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

export const getMe = (): Promise<Me | null> => request<Me>("/api/me");

export const completeOnboarding = (): Promise<unknown> =>
  request("/api/onboarding/complete", { method: "POST" });
