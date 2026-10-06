// 039. A review code, typed on the no-invite screen.
//
// The server checks it against the refusal's proof (`lib/attempt.ts`) and
// answers `in`, `refused` or `sign-in`. `failed` is ours: the request did not
// land, which says nothing about the code.

import { API_URL } from "./auth";
import { attemptHeaders, forgetAttempt } from "./attempt";

export type CodeAnswer = "in" | "refused" | "sign-in" | "failed";

export async function redeemCode(code: string): Promise<CodeAnswer> {
  try {
    const response = await fetch(`${API_URL}/api/sign-in/code`, {
      method: "POST",
      headers: { "content-type": "application/json", ...attemptHeaders() },
      body: JSON.stringify({ code }),
    });
    if (!response.ok) return "failed";
    const { status } = (await response.json()) as { status: Exclude<CodeAnswer, "failed"> };
    // Spent: the server cleared it too.
    if (status === "in") forgetAttempt();
    return status;
  } catch {
    return "failed";
  }
}
