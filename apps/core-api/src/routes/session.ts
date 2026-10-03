// Who am I, and finishing first run.
//
// Three small routes that the web and mobile shells both need before they can
// render anything: the current account, the address a refused sign-in used,
// and the write that ends onboarding.

import { webMapsOn } from "../settings.js";
import { mapsConfig } from "../places/resolve.js";
import { atDailyLimit } from "../budget.js";
import { layoutShape, resolveLayout, todayLayout } from "../today/layout.js";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { sql } from "kysely";
import type { App } from "../app.js";
import { COUNTRIES, isCountry } from "../countries.js";
import { auth } from "../auth/auth.js";
import { ATTEMPT_COOKIE, readCookie, unseal } from "../auth/attempt.js";
import { db } from "../db.js";
import { initialsOf } from "../accounts/initials.js";
import { requestsWaiting } from "../people/people.js";
import { cleanName } from "../accounts/name.js";
import { emit } from "../analytics.js";
import { env, isProduction, webOrigins } from "../env.js";
import { deleteAccount, LastOwner } from "../accounts/delete.js";
import { resolveTimeZone } from "../time-zone.js";
import { adoptZone } from "../accounts/zone.js";
import { activityNew } from "../notifications/activity.js";

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
  /** 022. Their own id, for the mark: every other person arrives with one
   *  and the settings index draws the viewer's the same way. */
  accountId: z.string(),
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
  /** 016. Whether offload may search the web, and whether it may open a link
   *  they pasted. Drawn as two rows in settings, and read here so the switch
   *  state comes from the account rather than from anything a client kept. */
  webSearch: z.boolean(),
  webLinks: z.boolean(),
  /** 030. Whether the map is on, on every surface. The server's switch; a
   *  request never sets it. */
  maps: z.boolean(),
  /** The web's map, which the owner can turn off on its own (0073). */
  webMaps: z.boolean(),
  /** 019. Every calendar write is put to them first. */
  calendarAskFirst: z.boolean(),
  /** Where they are, ISO 3166-1 alpha-2, theirs to set. Null until they do, and
   *  offload then says it does not know rather than assuming. */
  country: z.string().nullable(),
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
  /** 022. Connection requests waiting for this person's answer: the dot on
   *  the gear and on the My people row. Their own requests do not count, and
   *  neither does one they answered Not now. */
  requestsWaiting: z.number(),
  /** 023. The account's clock, or null until a device names one. */
  timeZone: z.string().nullable(),
  followDevice: z.boolean(),
  keptTimeZone: z.string().nullable(),
  /** 024. The four switches, named as the sends are, the two hours as HH:MM
   *  in the account's zone, and whether Activity holds something newer than
   *  its last opening. */
  notifyDueToday: z.boolean(),
  notifyDueTodayAt: z.string(),
  notifyComingTomorrow: z.boolean(),
  notifyComingTomorrowAt: z.string(),
  notifyPeopleRequests: z.boolean(),
  notifySharedActivity: z.boolean(),
  activityNew: z.boolean(),
  /** 026. Whether mail forwarded from the sign-in address can reach this
   *  account: false for an Apple private relay address, which is never the
   *  address mail comes from. */
  mailAvailable: z.boolean(),
  /** 031. The providers this account can sign in with, Apple first, so My
   *  account can say where its email came from. Empty for an account with no
   *  identity yet, rather than a guess. */
  signInProviders: z.array(z.enum(["apple", "google"])),
  /** 027. Customize Today's layout, resolved: every kind present, in order. */
  todayLayout: layoutShape,
  /** The day's model budget is spent or its turns are used, so the composer is
   *  closed until the window moves (budget.ts). */
  atDailyLimit: z.boolean(),
});

/** 024. An hour as the page sends it, HH:MM, twenty-four hour. */
const HOUR = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The version of the privacy policy the consent on first run is against.
 *
 *  The date the policy carries at the top, so a row in `accounts` says which
 *  wording someone agreed to rather than only that they agreed to something.
 *  When the policy changes materially this changes with it, and the gap between
 *  a stored version and this one is the query that finds who has to be asked
 *  again. Must match UPDATED in apps/web/src/app/(marketing)/privacy/page.tsx. */
export const CONSENT_VERSION = "2026-10-03";

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
  displayName: string | null,
  timeZone: string | null = null,
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    await adoptZone(accountId, timeZone, tx);
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
  /** 023. The device's zone, once, at first run: it becomes the account's
   *  clock until they change it in Settings. Optional on the wire for the
   *  same reason the name is, and an unknown name is dropped rather than
   *  refused, because first run must not fail over it. */
  timeZone: z.string().max(64).optional(),
});

/** The identity, or null when there is nothing to render.
 *
 *  Shared by the read and the write so a changed name comes back in exactly the
 *  shape the client already holds. That is what makes 011 AC-7 true without a
 *  refetch, and it keeps initials coming from one place: a client patching the
 *  name locally and recomputing its own two letters is the disagreement 010
 *  moved them server-side to prevent. */
export async function meFor(accountId: string): Promise<z.infer<typeof meResponse> | null> {
  const account = await db
    .selectFrom("accounts")
    .select([
      "state",
      "display_name",
      "provider_name",
      "email",
      "web_search_enabled",
      "web_links_enabled",
      "calendar_ask_first",
      "country",
      "time_zone",
      "kept_time_zone",
      "follow_device",
      "notify_due_today",
      "notify_due_today_at",
      "notify_coming_tomorrow",
      "notify_coming_tomorrow_at",
      "notify_people_requests",
      "notify_shared_activity",
      "today_layout",
    ])
    .where("id", "=", accountId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();

  // A session outliving its account, or an account disabled since the session
  // was issued. Both are 401 rather than 200-with-a-flag: there is nothing for
  // the shell to render either way.
  if (!account || (account.state !== "invited" && account.state !== "active")) return null;

  return {
    accountId,
    state: account.state,
    displayName: account.display_name,
    email: account.email,
    initials: initialsOf(account.display_name ?? ""),
    needsFirstRun: account.state === "invited",
    needsName: account.display_name === null,
    suggestedName: account.provider_name,
    requestsWaiting: await requestsWaiting(accountId),
    // 016. Two switches rather than one, because they are two different
    // promises: a search sends their own words to a third party, and reading a
    // link they pasted opens something they already chose.
    webSearch: account.web_search_enabled,
    webLinks: account.web_links_enabled,
    maps: mapsConfig().on,
    webMaps: await webMapsOn(),
    calendarAskFirst: account.calendar_ask_first,
    country: account.country,
    // 023. The clock, and the two facts the strip on Today reads beside it.
    timeZone: account.time_zone,
    followDevice: account.follow_device,
    keptTimeZone: account.kept_time_zone,
    // 024. Postgres hands a time back as HH:MM:SS; the page shows HH:MM.
    notifyDueToday: account.notify_due_today,
    notifyDueTodayAt: String(account.notify_due_today_at).slice(0, 5),
    notifyComingTomorrow: account.notify_coming_tomorrow,
    notifyComingTomorrowAt: String(account.notify_coming_tomorrow_at).slice(0, 5),
    notifyPeopleRequests: account.notify_people_requests,
    notifySharedActivity: account.notify_shared_activity,
    activityNew: await activityNew(accountId),
    mailAvailable: !/@privaterelay\.appleid\.com$/i.test(account.email),
    signInProviders: await signInProviders(accountId),
    todayLayout: resolveLayout(account.today_layout),
    atDailyLimit: await atDailyLimit(accountId),
  };
}

/** 031. Read from the identity rows Better Auth already keeps; nothing new is
 *  stored for it. */
async function signInProviders(accountId: string): Promise<("apple" | "google")[]> {
  const rows = await db
    .selectFrom("account_identities")
    .select("provider")
    .distinct()
    .where("account_id", "=", accountId)
    .execute();
  const held = new Set(rows.map((row) => row.provider));
  return (["apple", "google"] as const).filter((provider) => held.has(provider));
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
        body: z.object({
          displayName: nameField.optional(),
          webSearch: z.boolean().optional(),
          webLinks: z.boolean().optional(),
          calendarAskFirst: z.boolean().optional(),
          /** **Checked against the list the clients are offered**, not just
           *  against a two-letter shape: a code the server would refuse is a
           *  setting that silently fails to save. `null` clears it, and that is
           *  a real state rather than an empty one: offload then says it does
           *  not know where they are instead of assuming. */
          country: z
            .string()
            .refine((code) => isCountry(code), "not a country")
            .nullable()
            .optional(),
          /** 023. The clock. Resolved through ICU and refused when unknown,
           *  because it reaches a prompt and a query; setting it clears the
           *  zone that was kept, since the person has moved. */
          timeZone: z
            .string()
            .max(64)
            .refine((name) => resolveTimeZone(name) !== null, "not a zone")
            .optional(),
          followDevice: z.boolean().optional(),
          /** The device zone they answered Keep to, or null to forget it. */
          keptTimeZone: z
            .string()
            .max(64)
            .refine((name) => resolveTimeZone(name) !== null, "not a zone")
            .nullable()
            .optional(),
          /** 024. The switches and the hours, one field at a time. */
          notifyDueToday: z.boolean().optional(),
          notifyDueTodayAt: z.string().regex(HOUR, "not an hour").optional(),
          notifyComingTomorrow: z.boolean().optional(),
          notifyComingTomorrowAt: z.string().regex(HOUR, "not an hour").optional(),
          notifyPeopleRequests: z.boolean().optional(),
          notifySharedActivity: z.boolean().optional(),
          /** 027. The whole document, refused as a 400 unless it parses. */
          todayLayout: todayLayout.optional(),
        }),
        response: { 200: meResponse, 401: unauthenticated },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" });

      // Only what was sent. A patch that names one field must not clear the
      // others, and a name still cannot be cleared: the product draws a
      // nameless account correctly, but that is the state of an account nobody
      // has got to yet rather than somewhere to return to by emptying a field.
      const {
        displayName, webSearch, webLinks, calendarAskFirst, country, timeZone, followDevice, keptTimeZone,
        notifyDueToday, notifyDueTodayAt, notifyComingTomorrow, notifyComingTomorrowAt, notifyPeopleRequests, notifySharedActivity,
        todayLayout: layout,
      } = request.body;
      // Stored as ICU resolves the name, never as sent: the schema above has
      // already refused anything ICU does not know.
      const zone = timeZone === undefined ? undefined : resolveTimeZone(timeZone);
      const kept = keptTimeZone == null ? keptTimeZone : resolveTimeZone(keptTimeZone);
      await db
        .updateTable("accounts")
        .set({
          ...(displayName !== undefined ? { display_name: displayName } : {}),
          ...(zone !== undefined ? { time_zone: zone, kept_time_zone: null } : {}),
          ...(followDevice !== undefined ? { follow_device: followDevice } : {}),
          ...(kept !== undefined && zone === undefined ? { kept_time_zone: kept } : {}),
          ...(webSearch !== undefined ? { web_search_enabled: webSearch } : {}),
          ...(webLinks !== undefined ? { web_links_enabled: webLinks } : {}),
          ...(calendarAskFirst !== undefined ? { calendar_ask_first: calendarAskFirst } : {}),
          ...(country !== undefined ? { country } : {}),
          ...(notifyDueToday !== undefined ? { notify_due_today: notifyDueToday } : {}),
          ...(notifyDueTodayAt !== undefined ? { notify_due_today_at: notifyDueTodayAt } : {}),
          ...(notifyComingTomorrow !== undefined ? { notify_coming_tomorrow: notifyComingTomorrow } : {}),
          ...(notifyComingTomorrowAt !== undefined ? { notify_coming_tomorrow_at: notifyComingTomorrowAt } : {}),
          ...(notifyPeopleRequests !== undefined ? { notify_people_requests: notifyPeopleRequests } : {}),
          ...(notifySharedActivity !== undefined ? { notify_shared_activity: notifySharedActivity } : {}),
          ...(layout !== undefined ? { today_layout: JSON.stringify(layout) } : {}),
          updated_at: new Date(),
        })
        .where("id", "=", accountId)
        .where("deleted_at", "is", null)
        .execute();

      // 024. A changed hour, switch or zone deletes the digests queued ahead
      // for this account; the next hourly pass places whatever now falls in
      // its hour. One already due stays, since its hour was the old one.
      if (
        zone !== undefined ||
        notifyDueToday !== undefined ||
        notifyDueTodayAt !== undefined ||
        notifyComingTomorrow !== undefined ||
        notifyComingTomorrowAt !== undefined
      ) {
        await db
          .deleteFrom("jobs")
          .where("kind", "=", "account.digest")
          .where("account_id", "=", accountId)
          .where("state", "=", "queued")
          .where("run_after", ">", sql<Date>`now()`)
          .execute();
      }

      // No event. OFF-1, and 011 AC-11: `assertNoContent` would not catch a
      // name under sixty characters, since it looks like neither an email nor
      // a URL, so this is a rule rather than a check that fires.
      const me = await meFor(accountId);
      return me ? reply.send(me) : reply.status(401).send({ error: "unauthenticated" });
    }
  );

  // The countries somebody can say they are in.
  //
  // **One list, served rather than shipped twice.** The clients draw what this
  // returns and the patch above validates against the same set, so a code a
  // client can offer is always a code the server accepts. No session: it is the
  // ISO register, not anything about anybody.
  app.get(
    "/api/countries",
    {
      schema: {
        response: {
          200: z.object({
            countries: z.array(z.object({ code: z.string(), name: z.string() })),
          }),
        },
      },
    },
    async (_request, reply) => reply.send({ countries: COUNTRIES })
  );

  // 035. Delete the account. Not undoable, so it is confirmed: the body
  // carries the word the person typed, and the server checks it rather than
  // trusting a button that was enabled (OFF-6, SEC-2).
  //
  // Open to an account still in first run, which is why it lives beside
  // `/api/me` and outside the prefixes `refuseWritesBeforeConsent` guards.
  // Refused from any origin but the web app's: the session cookie spans the
  // registrable domain, so SameSite alone does not make this the app's own
  // request. The phones send no Origin. JSON only, which a form cannot post.
  app.delete(
    "/api/me",
    {
      schema: {
        // The word is checked in the schema, so a wrong one and a missing one
        // are refused the one way Fastify refuses a body.
        body: z.object({
          confirm: z
            .string()
            .max(32)
            .refine((word) => word.trim().toLowerCase() === "delete", "not the word"),
        }),
        response: {
          204: z.null(),
          401: unauthenticated,
          403: z.object({ error: z.literal("origin") }),
          409: z.object({ error: z.literal("last_owner") }),
        },
      },
    },
    async (request, reply) => {
      const origin = request.headers.origin;
      if (origin && !webOrigins.includes(origin)) return reply.status(403).send({ error: "origin" });
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" });
      try {
        await deleteAccount(accountId);
      } catch (error) {
        if (error instanceof LastOwner) return reply.status(409).send({ error: "last_owner" });
        throw error;
      }
      // Ids only, and not the one that no longer exists.
      request.log.info("account deleted");
      return reply.status(204).send(null);
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

      await completeFirstRun(accountId, request.body.displayName ?? null, request.body.timeZone ?? null);
      return reply.send({ state: "active" as const });
    }
  );
}
