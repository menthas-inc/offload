// Why the server would not do what a row asked, in one short line each.
//
// The actions on People and on a person's page answer a refusal with 409 and
// a reason. A reason with a line here is said as that line; anything else is
// the plain "did not go through".

const LINES: Record<string, string> = {
  "enable:deleting": "Not enabled. That account is being deleted",
  "sign-out:staff": "Not signed out. That account is staff",
  "delete:email": "Not deleted. That is not their address",
  "delete:self": "Not deleted. That account is yours",
  "delete:last_owner": "Not deleted. That account is the last owner",
  "cancel:not_marked": "Nothing was cancelled. That account is not being deleted",
};

/** The line for a refused write, or null when it was not a refusal this
 *  knows. `action` is the last part of the route: `enable`, `sign-out`, `delete`, `cancel`. */
export async function refusedLine(action: string, response: Response | null): Promise<string | null> {
  if (response?.status !== 409) return null;
  const body = (await response.json().catch(() => null)) as { reason?: unknown } | null;
  return typeof body?.reason === "string" ? (LINES[`${action}:${body.reason}`] ?? null) : null;
}
