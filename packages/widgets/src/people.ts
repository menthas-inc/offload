// People, the same on the web and the phones. 022.

/** What a sentence calls a person with no name. Never invents a letter. */
export function nameOf(person: { displayName: string | null }): string {
  return person.displayName ?? "Someone";
}

/** The first word of a name, for a sentence like "Take Ana out". */
export function firstNameOf(person: { displayName: string | null }): string {
  return nameOf(person).split(/\s+/)[0] ?? "Someone";
}

/** "4 Aug", as the design writes a date on a person row and as Connected
 *  apps already writes one. In the account's zone, else the device's. */
export function dayMonth(iso: string, zone: string | null): string {
  const at = new Date(iso);
  const timeZone = zone ?? undefined;
  return `${at.toLocaleString("en-GB", { day: "numeric", timeZone })} ${at.toLocaleString("en-GB", { month: "short", timeZone })}`;
}

/** What the connect step draws for a lookup's answer. */
export function stateOfLookup<F>(
  result: { kind: "found"; found: F | null } | { kind: "rate_limited" } | { kind: "failed" },
): { kind: "found"; found: F } | { kind: "none" } | { kind: "limited" } | { kind: "failed" } {
  if (result.kind === "rate_limited") return { kind: "limited" };
  if (result.kind === "failed") return { kind: "failed" };
  return result.found ? { kind: "found", found: result.found } : { kind: "none" };
}
