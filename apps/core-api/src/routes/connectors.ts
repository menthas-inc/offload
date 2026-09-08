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
import { connectorsAvailable, seal, open, VAULT_NAME } from "../connectors/vault.js";

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

        await db.transaction().execute(async (tx) => {
          const connection = await tx
            .insertInto("connector_connections")
            .values({
              account_id: accountId,
              provider: "google",
              external_account_email: primary?.externalId ?? "google",
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
}
