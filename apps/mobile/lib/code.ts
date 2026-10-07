// 039. Whether the sign-in screen offers a review code.
//
// A switch, read before anybody is signed in, so not from `/api/me`. Off when
// it cannot be read: a reviewer can retry, and nobody else misses it.

import { API_URL } from "./auth";

export async function codesOn(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/api/sign-in/options`);
    if (!response.ok) return false;
    const { codes } = (await response.json()) as { codes?: boolean };
    return codes === true;
  } catch {
    return false;
  }
}
