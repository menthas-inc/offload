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
  listCalendars,
  revoke,
} from "../connectors/google.js";
import { openState, pkce, sealState, LANDINGS, type Landing } from "../connectors/state.js";
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
function landingUrl(landing: Landing, outcome: "connected" | "failed"): string {
  const path = landing === "first-run" ? "/welcome" : "/settings/apps";
  return `${env.WEB_URL}${path}?calendar=${outcome}`;
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
    .select([
      "c.id as id",
      "c.access_role as accessRole",
      "c.is_shared as isShared",
      "c.selected as selected",
      "c.default_thread_id as defaultThreadId",
      "n.id as connectionId",
    ])
    .where("c.id", "=", calendarId)
    .where("n.account_id", "=", accountId)
    .where("n.deleted_at", "is", null)
    .executeTakeFirst();
}

/** A thread this account is actually in.
 *
 *  006 shipped this exact fix for a dump's sort destination: a thread id from a
 *  client is an access decision, and trusting it routes somebody's calendar
 *  into any thread id they can name. */
async function isMember(threadId: string, accountId: string): Promise<boolean> {
  const row = await db
    .selectFrom("thread_members")
    .select("thread_id")
    .where("thread_id", "=", threadId)
    .where("account_id", "=", accountId)
    .where("state", "=", "accepted")
    .executeTakeFirst();
  return Boolean(row);
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
    { schema: { querystring: z.object({ landing: z.enum(["settings", "first-run"]).default("settings") }) } },
    async (request: FastifyRequest<{ Querystring: { landing: Landing } }>, reply: FastifyReply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.status(401).send({ error: "unauthenticated" });
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

          for (const calendar of calendars) {
            await tx
              .insertInto("connector_calendars")
              .values({
                connection_id: connection.id,
                external_id: calendar.externalId,
                summary: calendar.summary,
                timezone: calendar.timezone,
                access_role: calendar.accessRole,
                // Shared until they say otherwise, except their own primary.
                is_shared: !(calendar.primary && calendar.accessRole === "owner"),
                is_primary: calendar.primary,
                selected: false,
              })
              .onConflict((oc) =>
                oc.columns(["connection_id", "external_id"]).doUpdateSet((eb) => ({
                  summary: eb.ref("excluded.summary"),
                  timezone: eb.ref("excluded.timezone"),
                  access_role: eb.ref("excluded.access_role"),
                  updated_at: new Date(),
                }))
              )
              .execute();
          }
        });

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
            connections: z.array(
              z.object({
                id: z.string(),
                email: z.string(),
                state: z.enum(["active", "needs_reauth", "revoked"]),
                calendars: z.array(
                  z.object({
                    id: z.string(),
                    summary: z.string(),
                    accessRole: z.enum(["owner", "writer", "reader", "freeBusyReader"]),
                    /** Can offload write here at all. AC-4. */
                    writable: z.boolean(),
                    isShared: z.boolean(),
                    isPrimary: z.boolean(),
                    selected: z.boolean(),
                    threadId: z.string().nullable(),
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

      const connections = await db
        .selectFrom("connector_connections")
        .select(["id", "external_account_email as email", "state"])
        .where("account_id", "=", accountId)
        .where("deleted_at", "is", null)
        .orderBy("connected_at")
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
        connections: connections.map((connection) => ({
          id: connection.id,
          email: connection.email,
          state: connection.state,
          calendars: calendars
            .filter((calendar) => calendar.connection_id === connection.id)
            .map((calendar) => ({
              id: calendar.id,
              summary: calendar.summary,
              accessRole: calendar.access_role,
              writable: calendar.access_role === "owner" || calendar.access_role === "writer",
              isShared: calendar.is_shared,
              isPrimary: calendar.is_primary,
              selected: calendar.selected,
              threadId: calendar.default_thread_id,
            })),
        })),
      });
    }
  );

  // Where a calendar files, whether it files at all, and whether anybody else
  // sees it. Three small answers, one route, because they are one row.
  app.patch(
    "/api/connectors/calendars/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          selected: z.boolean().optional(),
          isShared: z.boolean().optional(),
          threadId: z.string().uuid().nullable().optional(),
        }),
        response: {
          200: z.object({ ok: z.literal(true) }),
          400: z.object({ error: z.enum(["not_writable", "needs_thread", "not_a_member"]) }),
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

      const body = request.body;
      const threadId = body.threadId === undefined ? calendar.defaultThreadId : body.threadId;
      const selected = body.selected ?? calendar.selected;
      const isShared = body.isShared ?? calendar.isShared;

      // A thread id from a client is an access decision.
      if (threadId && threadId !== calendar.defaultThreadId && !(await isMember(threadId, accountId))) {
        return reply.status(400).send({ error: "not_a_member" as const });
      }
      // An event offload holds is a content row, and content.thread_id is not
      // null. A calendar that reads has to have somewhere to put things.
      if (selected && !threadId) return reply.status(400).send({ error: "needs_thread" as const });
      // Somebody else owning it is proof somebody else sees it.
      if (!isShared && calendar.accessRole !== "owner") {
        return reply.status(400).send({ error: "not_writable" as const });
      }

      await db
        .updateTable("connector_calendars")
        .set({ selected, is_shared: isShared, default_thread_id: threadId, updated_at: new Date() })
        .where("id", "=", calendar.id)
        .execute();

      // Turning one on is the moment somebody expects to see their week. The
      // recurring chain is fifteen minutes and only starts once a sync has run,
      // so without this the first one waited for the daily supervisor.
      if (selected && !calendar.selected) await syncNow(calendar.connectionId);

      return reply.send({ ok: true as const });
    }
  );

  // Disconnecting. Two answers, never one: stopping the sync and removing what
  // was already filed are different decisions and only the second destroys
  // anything.
  app.post(
    "/api/connectors/:id/disconnect",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ removeFiled: z.boolean().default(false) }),
        response: {
          200: z.object({ removed: z.number() }),
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

      let removed = 0;
      if (request.body.removeFiled) {
        const calendars = await db
          .selectFrom("connector_calendars")
          .select("external_id")
          .where("connection_id", "=", connection.id)
          .execute();

        for (const calendar of calendars) {
          const result = await db
            .updateTable("content")
            .set({ deleted_at: new Date(), updated_at: new Date() })
            .where("account_id", "=", accountId)
            .where("source", "=", "calendar")
            .where("source_ref", "like", `${calendar.external_id}:%`)
            .where("deleted_at", "is", null)
            .executeTakeFirst();
          removed += Number(result.numUpdatedRows ?? 0);
        }
      }

      // The grant goes back to Google, not only out of our table.
      await revokeAndForget(connection.id);
      return reply.send({ removed });
    }
  );
}
