// The only thing in this app that logs.
//
// OFF-1 says no content reaches a log, and the Core API does not state that as
// an intention: `logger.ts` enforces it with a redact list and narrowed
// serializers, because this repo already learned that an intention is not a
// control. This is the phone's version of that control.
//
// **React Native makes it harder than the browser in three specific ways.** An
// unhandled rejection prints the whole error object, which can carry a request
// body. The dev red box renders the same thing. And a crash reporter's default
// breadcrumbs capture console output and network activity, at which point the
// leak is a vendor's problem to unpick rather than ours.
//
// So: ids and outcomes, never text. **Nothing outside this file calls
// `console.*`, and no crash reporter is added before this file exists**, which
// it now does.

/** What is safe to say about something that happened.
 *
 *  Ids, counts, states and durations. Never a title, a body, a dump, a thread
 *  name, a memory, a person's name or an email. If a value came from something
 *  somebody typed, it does not belong here, and the type is deliberately narrow
 *  so that passing one is awkward rather than accidental. */
export type Fact = string | number | boolean | null | undefined;

const SAFE = /^[a-z][a-zA-Z0-9]*$/;

/** Keys that would carry content however carefully they were filled.
 *
 *  Belt and braces on top of the type: a `string` is legal above, so this is
 *  what stops `{ title }` from being legal in practice. Dropped rather than
 *  redacted, because a redaction marker in a log still tells you the field was
 *  there and this is not an audit trail. */
const FORBIDDEN = new Set([
  "text",
  "title",
  "body",
  "name",
  "displayName",
  "email",
  "reply",
  "dump",
  "memory",
  "query",
  "label",
  "message",
]);

function safe(fields: Record<string, Fact>): Record<string, Fact> {
  const out: Record<string, Fact> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN.has(key) || !SAFE.test(key)) continue;
    if (typeof value === "string" && value.length > 64) continue;
    out[key] = value;
  }
  return out;
}

function emit(level: "info" | "warn" | "error", event: string, fields: Record<string, Fact>): void {
  if (!__DEV__) return;
  // eslint-disable-next-line no-console
  console[level](event, safe(fields));
}

/** Something happened and it went as expected. */
export const info = (event: string, fields: Record<string, Fact> = {}): void =>
  emit("info", event, fields);

/** Something did not go as expected and the screen has already handled it. */
export const warn = (event: string, fields: Record<string, Fact> = {}): void =>
  emit("warn", event, fields);

/** Something threw.
 *
 *  **The error is not logged, only its shape.** A fetch failure's message can
 *  quote the request body, and an error thrown from a screen can carry whatever
 *  that screen was holding. The name and whether it was an `Error` at all is
 *  enough to tell a crash from a refusal; the rest is what a debugger is for.
 */
export function failed(event: string, error: unknown, fields: Record<string, Fact> = {}): void {
  emit("error", event, {
    ...fields,
    kind: error instanceof Error ? error.name : typeof error,
  });
}
