// Who am I, and finishing first run.
//
// Three small routes that the web and mobile shells both need before they can
// render anything: the current account, the address a refused sign-in used,
// and the write that ends onboarding.

import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { App } from "../app.js";
import { auth } from "../auth/auth.js";
import { ATTEMPT_COOKIE, readCookie, unseal } from "../auth/attempt.js";
import { db } from "../db.js";
import { initialsOf } from "../accounts/initials.js";
import { cleanName } from "../accounts/name.js";
import { emit } from "../analytics.js";
import { env, isProduction } from "../env.js";

function fetchHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.append(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return headers;
}

/** The signed-in account id, or null. Reads the session through Better Auth
 *  rather than the sessions table directly, so cookie signing and expiry are
 *  checked by the thing that issued them. */
async function currentAccountId(request: FastifyRequest): Promise<string | null> {
  const result = await auth.api.getSession({ headers: fetchHeaders(request) });
  return result?.session.userId ?? null;
}

/** Declared on every authenticated route, because the type provider narrows
 *  reply.send() to the shapes the schema names and an undeclared 401 does not
 *  compile. That is the schema doing its job. */
const unauthenticated = z.object({ error: z.literal("unauthenticated") });

/** A name as the body may carry it: trimmed first, then bounded.
 *
 *  **In the schema rather than the handler**, so both routes that take a name
 *  have exactly one way to refuse it. A handler that sent its own 400 needed a
 *  400 response schema, and that schema does not match the one Fastify's own
 *  validation failure produces, so a missing field serialised as a 500. One
 *  path, one shape.
 *
 *  Trimming before the bound is what makes "   " a refusal rather than a
 *  stored blank, which is AC-6. */
const nameField = z
  .string()
  // `cleanName` rather than a trim and a bound written again here. They agreed
  // only because both happened to call `.trim()` and both imported the same
  // constant, which is the shape of every two-documents-written-days-apart
  // defect this repository has had. One implementation, one place to change
  // what "survives the trim" means.
  .transform(cleanName)
  .refine((value): value is string => value !== null);

const meResponse = z.object({
  state: z.enum(["invited", "active"]),
  displayName: z.string().nullable(),
  email: z.string(),
  /** Two letters for the avatar, from the same rule a thread's faces use.
   *  Computed here rather than on three clients, because three splits of a
   *  name is three chances to disagree about "Ana de Sousa". `?` where there
   *  is no name, which is the case the settings index shows an email beside. */
  initials: z.string(),
  /** invited means the account exists and has never finished first run. The
   *  client does not get to decide this; it is the account's state. */
  needsFirstRun: z.boolean(),
  /** No name yet, so one has to be asked for before the app is any use.
   *
   *  Separate from `needsFirstRun` because the two came apart: every account
   *  that existed when 011 shipped had finished first run and had no name, and
   *  a name is not something Settings should have to be found for. */
  needsName: z.boolean(),
  /** What Apple or Google called them, to fill the field in.
   *
   *  **Only ever sent to the account it belongs to.** It is a suggestion, not a
   *  name: nothing else reads this column, and a shared thread cannot see it.
   *  Null when the provider sent nothing, which is what Apple does when
   *  somebody declines to share theirs. */
  suggestedName: z.string().nullable(),
});

/** The version of the privacy policy the consent on first run is against.
 *
 *  The date the policy carries at the top, so a row in `accounts` says which
 *  wording someone agreed to rather than only that they agreed to something.
 *  When the policy changes materially this changes with it, and the gap between
 *  a stored version and this one is the query that finds who has to be asked
 *  again. Must match UPDATED in apps/web/src/app/(marketing)/privacy/page.tsx. */
export const CONSENT_VERSION = "2026-09-01";

/** invited -> active, plus the consent record and the event, in one transaction.
 *
 *  Idempotent by the where clause rather than by a read-then-write: the update
 *  only matches an account still in `invited`, so a double tap or a reload of
 *  the last screen flips nothing a second time and emits nothing a second
 *  time. Two concurrent requests are the same case as one slow one.
 *
 *  The consent is written by the same update for the same reason the thread and
 *  the keys are written by promotion's: an active account that never agreed to
 *  anything is a state we would then have to handle everywhere, and one
 *  transaction means it cannot exist. */
export async function completeFirstRun(
  accountId: string,
  displayName: string | null
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    const flipped = await tx
      .updateTable("accounts")
      .set({
        state: "active",
        // Written by the same update for the same reason the consent is: an
        // active account with no name is a state every screen would then have
        // to handle, and one transaction means a client that asked for one
        // cannot produce it.
        //
        // **Absent is not the same as empty, and this is why the column is set
        // conditionally.** A phone build installed before 011 has no name
        // screen and sends no name, and it cannot be forced to update. Writing
        // null would wipe whatever the sign-in backfill had already stored;
        // omitting the column leaves it, so an old client completes first run
        // and still ends up with the provider's name. Accounts that went active
        // before 011 are the same case (AC-8): a first run that had nothing to
        // ask.
        ...(displayName === null ? {} : { display_name: displayName }),
        consent_version: CONSENT_VERSION,
        consented_at: new Date(),
        updated_at: new Date(),
      })
      .where("id", "=", accountId)
      .where("state", "=", "invited")
      .returning("analytics_subject_id")
      .executeTakeFirst();

    if (!flipped) return;

    await emit({
      name: "onboarding_completed",
      subjectId: flipped.analytics_subject_id,
      platform: "web",
      tx,
    });
  });
}

/** Both ticks on the last screen of first run, and both must be true.
 *
 *  Two rather than one, and specific rather than "I agree to the policy",
 *  because a bundled acknowledgement is treated as no consent at all, and the
 *  second of these is the only lawful basis we have for the private things
 *  people will inevitably dump in. See the privacy policy, section 4.
 *
 *  A boolean the client asserts is all a server can ever receive here. What it
 *  buys is that a client which does not present the ticks cannot complete
 *  first run by accident. */
const consentBody = z.object({
  readPolicy: z.literal(true),
  agreeToProcessing: z.literal(true),
  /** 011 AC-3. Every client that has the name screen sends one.
   *
   *  **Optional on the wire, required on the screen.** A phone build installed
   *  before 011 sends the two ticks and nothing else, and making this required
   *  would answer it with a 400: first run unfinishable, on a client nobody can
   *  force to update, with no way forward. The screen is what requires a name;
   *  the endpoint accepts the older contract and leaves the column alone. */
  displayName: nameField.optional(),
});

/** The identity, or null when there is nothing to render.
 *
 *  Shared by the read and the write so a changed name comes back in exactly the
 *  shape the client already holds. That is what makes 011 AC-7 true without a
 *  refetch, and it keeps initials coming from one place: a client patching the
 *  name locally and recomputing its own two letters is the disagreement 010
 *  moved them server-side to prevent. */
async function meFor(accountId: string): Promise<z.infer<typeof meResponse> | null> {
  const account = await db
    .selectFrom("accounts")
    .select(["state", "display_name", "provider_name", "email"])
    .where("id", "=", accountId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();

  // A session outliving its account, or an account disabled since the session
  // was issued. Both are 401 rather than 200-with-a-flag: there is nothing for
  // the shell to render either way.
  if (!account || (account.state !== "invited" && account.state !== "active")) return null;

  return {
    state: account.state,
    displayName: account.display_name,
    email: account.email,
    initials: initialsOf(account.display_name ?? ""),
    needsFirstRun: account.state === "invited",
    needsName: account.display_name === null,
    suggestedName: account.provider_name,
  };
}

export async function sessionRoutes(app: App): Promise<void> {
  app.get("/api/me", { schema: { response: { 200: meResponse, 401: unauthenticated } } }, async (request, reply) => {
    const accountId = await currentAccountId(request);
    if (!accountId) return reply.status(401).send({ error: "unauthenticated" });

    const me = await meFor(accountId);
    return me ? reply.send(me) : reply.status(401).send({ error: "unauthenticated" });
  });

  // Setting your name. 011.
  //
  // **It takes no account id** (AC-9). There is none to get wrong: the row it
  // writes is the session's, resolved server-side like every other
  // authenticated route here.
  //
  // A name cannot be cleared (AC-6). The product draws a nameless account
  // correctly, but that is the state of an account nobody has got to yet, not
  // somewhere to return to by emptying a field.
  app.patch(
    "/api/me",
    {
      schema: {
        body: z.object({ displayName: nameField }),
        response: { 200: meResponse, 401: unauthenticated },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" });

      await db
        .updateTable("accounts")
        .set({ display_name: request.body.displayName, updated_at: new Date() })
        .where("id", "=", accountId)
        .where("deleted_at", "is", null)
        .execute();

      // No event. OFF-1, and 011 AC-11: `assertNoContent` would not catch a
      // name under sixty characters, since it looks like neither an email nor
      // a URL, so this is a rule rather than a check that fires.
      const me = await meFor(accountId);
      return me ? reply.send(me) : reply.status(401).send({ error: "unauthenticated" });
    }
  );

  // The address a refused sign-in used, read once and then cleared. No session
  // is required, because by definition the person holding this cookie does not
  // have one. The cookie itself is the authorization, and all it unlocks is
  // an address they authenticated with a minute ago.
  app.get(
    "/api/sign-in/attempt",
    { schema: { response: { 200: z.object({ email: z.string().nullable() }) } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const raw = readCookie(request.headers.cookie, ATTEMPT_COOKIE);
      const email = raw ? unseal(raw, Date.now()) : null;

      const cleared = [
        `${ATTEMPT_COOKIE}=`,
        "Path=/",
        "Max-Age=0",
        "HttpOnly",
        "SameSite=Lax",
        ...(isProduction ? ["Secure"] : []),
        ...(env.COOKIE_DOMAIN !== "localhost" ? [`Domain=${env.COOKIE_DOMAIN}`] : []),
      ].join("; ");
      reply.header("set-cookie", cleared);

      return reply.send({ email });
    }
  );

  // Finishing first run is a server-side write, not a flag the client keeps.
  //
  // It now collects one thing, which is why Skip no longer completes it: the
  // two consents on the last screen. `z.literal(true)` on both is the whole
  // enforcement. A client that does not know about consent sends no body and
  // gets a 400 rather than quietly producing an active account with null
  // consent columns, and there is no branch here that could forget to check.
  app.post(
    "/api/onboarding/complete",
    {
      schema: {
        body: consentBody,
        response: {
          200: z.object({ state: z.literal("active") }),
          401: unauthenticated,
        },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" });

      await completeFirstRun(accountId, request.body.displayName ?? null);
      return reply.send({ state: "active" as const });
    }
  );
}
