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

async function request<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  // The plugin keeps the cookie in secure storage and hands it back here,
  // because React Native has no cookie jar the way a browser does. It reads
  // from storage, so it is a promise: awaited, not spread, or the header value
  // is the string "[object Promise]" and every call is unauthenticated.
  const cookie = await authClient.getCookie();

  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string> | undefined) ?? {}),
    ...(init.body ? { "content-type": "application/json" } : {}),
    ...(cookie ? { cookie } : {}),
  };

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

export const getMe = (): Promise<Me | null> => request<Me>("/api/me");

export const completeOnboarding = (): Promise<unknown> =>
  request("/api/onboarding/complete", { method: "POST" });
