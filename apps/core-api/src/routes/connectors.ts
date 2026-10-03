// Connecting a calendar, and everything Settings does to one afterwards.
//
// **This flow shares no route, no table and no hook with signing in.** See
// `connectors/vault.ts` for why, and `connectors/state.ts` for what that costs:
// state, PKCE and the redirect allowlist are written here rather than inherited.

import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { App } from "../app.js";
import { auth } from "../auth/auth.js";
import { db } from "../db.js";
import { env } from "../env.js";
import {
  consentUrl,
  exchangeCode,
  GrantRevoked,
  grantsAcl,
  listCalendars,
  revoke,
} from "../connectors/google.js";
import { calendarName, refreshCalendars } from "../connectors/calendars.js";
import { openState, pkce, sealState, LANDINGS, type Landing } from "../connectors/state.js";
import { isActive } from "../accounts/active.js";
import { connectorsAvailable, seal, VAULT_NAME } from "../connectors/vault.js";
import { revokeAndForget } from "../connectors/tokens.js";
import { syncNow } from "../connectors/sync.js";
import { confirmPending, declinePending } from "../connectors/tool-calls.js";

function fetchHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.append(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return headers;
}

async function currentAccountId(request: FastifyRequest): Promise<string | null> {
  const result = await auth.api.getSession({ headers: fetchHeaders(request) });
  return result?.session.userId ?? null;
}

const unauthenticated = z.object({ error: z.literal("unauthenticated") });

/** Where a landing enum actually sends somebody. Never a value from the
 *  request: an open redirect at the end of an authenticated flow. */
export function landingUrl(landing: Landing, outcome: "connected" | "failed"): string {
  // 019. Connected lands on the calendar page from both doors: every calendar
  // comes back unticked, and the page is where the person says which ones.
  // A failure from first run goes back to first run's offer.
  // 033. Bring things in gets both outcomes back: which calendars to use is a
  // choice for later, and first run ends on Today.
  return `${env.WEB_URL}${landingPath(landing, outcome)}?calendar=${outcome}`;
}

/** Exhaustive, so a new landing cannot compile without a destination. */
function landingPath(landing: Landing, outcome: "connected" | "failed"): string {
  switch (landing) {
    case "first-run-bring":
      return "/welcome/bring";
    case "first-run":
      // Only states minted before 033 shipped, which expire in ten minutes.
      return outcome === "failed" ? "/welcome" : "/settings/apps";
    case "settings":
      return "/settings/apps";
    default: {
      const never: never = landing;
      return never;
    }
  }
}

/** The account behind a calendar, resolved through its connection.
 *
 *  `connector_calendars` carries no `account_id` on purpose, and this is the
 *  function that makes that safe. Authorization written against a joined value
 *  that is never checked is a bug this repository has already fixed twice. */
async function calendarOwnedBy(calendarId: string, accountId: string) {
  return db
    .selectFrom("connector_calendars as c")
    .innerJoin("connector_connections as n", "n.id", "c.connection_id")
    .select(["c.id as id", "c.access_role as accessRole", "c.selected as selected", "n.id as connectionId"])
    .where("c.id", "=", calendarId)
    .where("n.account_id", "=", accountId)
    .where("n.deleted_at", "is", null)
    .executeTakeFirst();
}


export async function connectorRoutes(app: App): Promise<void> {
  // Is this offered at all. Every screen reads it and says "not available yet"
  // rather than drawing a button that cannot work.
  app.get(
    "/api/connectors",
    { schema: { response: { 200: z.object({ available: z.boolean() }), 401: unauthenticated } } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" });
      return reply.send({ available: connectorsAvailable() });
    }
  );

  // Start. Requires a session, and the account comes from it rather than from
  // anything the caller sent.
  app.get(
    "/api/connectors/google/start",
    { schema: { querystring: z.object({ landing: z.enum(LANDINGS).default("settings") }) } },
    async (request: FastifyRequest<{ Querystring: { landing: Landing } }>, reply: FastifyReply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" });
      // 033. Nothing is brought in before consent, whatever the client draws.
      if (!(await isActive(accountId))) return reply.status(403).send({ error: "not_active" });
      if (!connectorsAvailable()) return reply.status(503).send({ error: "unavailable" });

      const { verifier, challenge } = pkce();
      const state = sealState({ accountId, verifier, landing: request.query.landing }, Date.now());
      return reply.redirect(consentUrl(state, challenge));
    }
  );

  // Come back. The state is compared against the session that actually arrives,
  // byte for byte, and a mismatch is a refusal rather than a link.
  app.get(
    "/api/connectors/google/callback",
    {
      schema: {
        querystring: z.object({
          code: z.string().optional(),
          state: z.string().optional(),
          error: z.string().optional(),
        }),
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { code?: string; state?: string; error?: string } }>,
      reply: FastifyReply
    ) => {
      const opened = request.query.state ? openState(request.query.state, Date.now()) : null;
      // Nothing to trust, so nowhere to send them but the default. A forged or
      // expired state is not told which it was.
      if (!opened) return reply.redirect(landingUrl("settings", "failed"));

      const accountId = await currentAccountId(request);
      if (!accountId || accountId !== opened.accountId) {
        return reply.redirect(landingUrl(opened.landing, "failed"));
      }
      if (request.query.error || !request.query.code) {
        // They declined, which is an answer rather than a fault.
        return reply.redirect(landingUrl(opened.landing, "failed"));
      }

      try {
        const tokens = await exchangeCode(request.query.code, opened.verifier);
        const calendars = await listCalendars(tokens.accessToken);
        const primary = calendars.find((c) => c.primary);
        let connectionId: string | null = null;

        // **No placeholder for the account's identity.** It fell back to the
        // literal "google", and the unique key is
        // (account, provider, external_account_email): a second connection that
        // also had no primary would collide with the first and `onConflict`
        // would update it in place, silently merging two different Google
        // accounts into one connection. Refusing is the honest outcome, and it
        // is close to unreachable, since an account always has a primary
        // calendar.
        if (!primary) {
          console.warn(JSON.stringify({ at: "connectors.callback", outcome: "no_primary" }));
          return reply.redirect(landingUrl(opened.landing, "failed"));
        }

        await db.transaction().execute(async (tx) => {
          const connection = await tx
            .insertInto("connector_connections")
            .values({
              account_id: accountId,
              provider: "google",
              external_account_email: primary.externalId,
              state: "active",
            })
            .onConflict((oc) =>
              oc
                .columns(["account_id", "provider", "external_account_email"])
                .where("deleted_at", "is", null)
                .doUpdateSet({ state: "active", last_error_at: null, updated_at: new Date() })
            )
            .returning("id")
            .executeTakeFirstOrThrow();
          connectionId = connection.id;

          await tx
            .insertInto("connector_secrets")
            .values({
              connection_id: connection.id,
              access_token: seal(tokens.accessToken, connection.id, "access_token"),
              refresh_token: tokens.refreshToken
                ? seal(tokens.refreshToken, connection.id, "refresh_token")
                : null,
              access_expires_at: tokens.expiresAt,
              scope: tokens.scope,
              wrapped_by: VAULT_NAME,
            })
            .onConflict((oc) =>
              oc.column("connection_id").doUpdateSet((eb) => ({
                access_token: eb.ref("excluded.access_token"),
                // Only when Google sent one. A refresh on a repeat consent can
                // omit it, and overwriting with null is a connection that
                // cannot refresh and dies within the hour.
                refresh_token: eb.fn.coalesce(eb.ref("excluded.refresh_token"), eb.ref("connector_secrets.refresh_token")),
                access_expires_at: eb.ref("excluded.access_expires_at"),
                scope: eb.ref("excluded.scope"),
                wrapped_by: eb.ref("excluded.wrapped_by"),
                updated_at: new Date(),
              }))
            )
            .execute();
        });

        // The list, the colours and the participant counts, from the one
        // function the full pass also runs. Every calendar comes in unticked:
        // connecting is not consenting to all of them.
        if (connectionId) await refreshCalendars(connectionId, tokens.accessToken);

        return reply.redirect(landingUrl(opened.landing, "connected"));
      } catch (error) {
        // What happened, and nowhere does it guess why. A revoked grant and a
        // Google outage look the same from here and the screen offers the same
        // way forward either way.
        console.warn(
          JSON.stringify({
            at: "connectors.callback",
            outcome: error instanceof GrantRevoked ? "revoked" : "failed",
          })
        );
        return reply.redirect(landingUrl(opened.landing, "failed"));
      }
    }
  );

  // A person agreeing to a write offload proposed but did not make.
  //
  // **The outward test is run again here**, against live state, because minutes
  // may have passed since the proposal and a calendar can be shared in them.
  // Nothing in a pending row has reached Google; this is the only thing that
  // sends it.
  app.post(
    "/api/calendar/pending/:id/:answer",
    {
      schema: {
        params: z.object({ id: z.string().uuid(), answer: z.enum(["confirm", "decline"]) }),
        response: {
          200: z.object({ ok: z.literal(true) }),
          401: unauthenticated,
          404: z.object({ error: z.literal("not_found") }),
        },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" });

      const done =
        request.params.answer === "confirm"
          ? await confirmPending(accountId, request.params.id)
          : await declinePending(accountId, request.params.id);

      // Expired, already answered, or somebody else's. One answer for all
      // three: a caller who could tell them apart could probe.
      return done ? reply.send({ ok: true as const }) : reply.status(404).send({ error: "not_found" as const });
    }
  );

  // What Settings draws. Connections, their calendars, and where each one files.
  app.get(
    "/api/connectors/calendars",
    {
      schema: {
        response: {
          200: z.object({
            available: z.boolean(),
            /** 019. Every calendar write is put to the person first. One
             *  switch for the offload account, whatever Google accounts hang
             *  off it. */
            askFirst: z.boolean(),
            connections: z.array(
              z.object({
                id: z.string(),
                email: z.string(),
                state: z.enum(["active", "needs_reauth", "revoked"]),
                connectedAt: z.string(),
                /** The grant lacks the sharing scope, so every calendar on it
                 *  reads as more than one participant until they sign in
                 *  again. The connection keeps working. */
                needsScope: z.boolean(),
                calendars: z.array(
                  z.object({
                    id: z.string(),
                    /** Worded once here: the person's name for a primary
                     *  calendar, Google's summary otherwise. */
                    name: z.string(),
                    colour: z.string().nullable(),
                    /** Can offload write here at all. AC-4 of 012. */
                    writable: z.boolean(),
                    /** Somebody else owns it. The note says so without naming
                     *  them, since Google's list carries no name. */
                    sharedWithYou: z.boolean(),
                    primary: z.boolean(),
                    selected: z.boolean(),
                  })
                ),
              })
            ),
          }),
          401: unauthenticated,
        },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" });

      const account = await db
        .selectFrom("accounts")
        .select(["display_name", "calendar_ask_first"])
        .where("id", "=", accountId)
        .executeTakeFirst();

      const connections = await db
        .selectFrom("connector_connections as n")
        .leftJoin("connector_secrets as s", "s.connection_id", "n.id")
        .select([
          "n.id as id",
          "n.external_account_email as email",
          "n.state as state",
          "n.connected_at as connectedAt",
          "s.scope as scope",
        ])
        .where("n.account_id", "=", accountId)
        .where("n.deleted_at", "is", null)
        .orderBy("n.connected_at")
        .execute();

      const calendars = connections.length
        ? await db
            .selectFrom("connector_calendars")
            .selectAll()
            .where(
              "connection_id",
              "in",
              connections.map((c) => c.id)
            )
            .orderBy("is_primary", "desc")
            .orderBy("summary")
            .execute()
        : [];

      return reply.send({
        available: connectorsAvailable(),
        askFirst: account?.calendar_ask_first ?? false,
        connections: connections.map((connection) => ({
          id: connection.id,
          email: connection.email,
          state: connection.state,
          connectedAt: connection.connectedAt.toISOString(),
          needsScope: !grantsAcl(connection.scope),
          calendars: calendars
            .filter((calendar) => calendar.connection_id === connection.id)
            .map((calendar) => ({
              id: calendar.id,
              name: calendarName(calendar, account?.display_name ?? null),
              colour: calendar.colour,
              writable: calendar.access_role === "owner" || calendar.access_role === "writer",
              sharedWithYou: calendar.access_role !== "owner",
              primary: calendar.is_primary,
              selected: calendar.selected,
            })),
        })),
      });
    }
  );

  // Approving a calendar, or taking the approval back. One answer, one route.
  //
  // **Un-ticking removes the calendar from every thread that picked it, at
  // once and for good.** A pick that survived an un-tick would re-widen every
  // thread that had it the day the calendar was ticked again, silently, which
  // is the one thing the model forbids. Its copy goes with it: a copy nobody
  // may read is a copy nobody should keep.
  app.patch(
    "/api/connectors/calendars/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        // Older clients still send `threadId` and `isShared`. Stripped, not
        // refused: a field that stopped meaning anything is not an error.
        body: z.object({ selected: z.boolean() }),
        response: {
          200: z.object({ ok: z.literal(true) }),
          401: unauthenticated,
          404: z.object({ error: z.literal("not_found") }),
        },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" });

      // Ownership through the connection, never a denormalised column.
      const calendar = await calendarOwnedBy(request.params.id, accountId);
      if (!calendar) return reply.status(404).send({ error: "not_found" as const });

      const selected = request.body.selected;
      await db.transaction().execute(async (tx) => {
        await tx
          .updateTable("connector_calendars")
          .set({ selected, updated_at: new Date() })
          .where("id", "=", calendar.id)
          .execute();
        if (!selected) {
          await tx.deleteFrom("thread_calendars").where("calendar_id", "=", calendar.id).execute();
          await tx.deleteFrom("connector_events").where("calendar_id", "=", calendar.id).execute();
        }
      });

      // Turning one on is the moment somebody expects to see their week. The
      // recurring chain is fifteen minutes and only starts once a sync has run,
      // so without this the first one waited for the daily supervisor.
      if (selected && !calendar.selected) await syncNow(calendar.connectionId);

      return reply.send({ ok: true as const });
    }
  );

  // Disconnecting. One answer since 019: the grant goes back to Google, and
  // the calendars go with their copy and their picks, because nothing could
  // read them afterwards. The clients confirm once before calling this.
  app.post(
    "/api/connectors/:id/disconnect",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ ok: z.literal(true) }),
          401: unauthenticated,
          404: z.object({ error: z.literal("not_found") }),
        },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" });

      const connection = await db
        .selectFrom("connector_connections")
        .select("id")
        .where("id", "=", request.params.id)
        .where("account_id", "=", accountId)
        .where("deleted_at", "is", null)
        .executeTakeFirst();
      if (!connection) return reply.status(404).send({ error: "not_found" as const });

      // The grant goes back to Google, not only out of our table.
      await revokeAndForget(connection.id);
      return reply.send({ ok: true as const });
    }
  );
}
