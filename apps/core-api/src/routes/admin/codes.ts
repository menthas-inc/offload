// 039. Review codes: make one, list them, revoke one.
//
// Registered in the support scope, beside the waitlist: a code is a handful of
// invites to people nobody can name in advance, and inviting is support's job.
// Paths are relative to `/v1/admin`. What a code is and does lives in
// `admin/review-codes.ts`; this file is the shape of the requests.

import { z } from "zod";
import type { App } from "../../app.js";
import {
  DEFAULT_DAYS,
  DEFAULT_USES,
  MAX_DAYS,
  MAX_USES,
  NOTE_MAX,
  createCode,
  listCodes,
  revokeCode,
} from "../../admin/review-codes.js";

const notFound = z.object({ error: z.literal("not-found") });

const row = z.object({
  id: z.string().uuid(),
  note: z.string(),
  uses: z.number().int(),
  maxUses: z.number().int(),
  expiresAt: z.string(),
  state: z.enum(["live", "expired", "used", "revoked"]),
});

export async function codeAdminRoutes(app: App): Promise<void> {
  app.get(
    "/codes",
    { schema: { response: { 200: z.object({ rows: z.array(row) }), 404: notFound } } },
    async (_request, reply) => reply.send({ rows: await listCodes() })
  );

  // The response is the only place the code is ever written down.
  app.post(
    "/codes",
    {
      config: { audit: "code.created" },
      schema: {
        body: z.object({
          note: z.string().trim().min(1).max(NOTE_MAX),
          maxUses: z.number().int().min(1).max(MAX_USES).default(DEFAULT_USES),
          days: z.number().int().min(1).max(MAX_DAYS).default(DEFAULT_DAYS),
        }),
        response: { 200: row.extend({ code: z.string() }), 404: notFound },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      return reply.send(await createCode(request.body, request.staff!));
    }
  );

  app.post(
    "/codes/:id/revoke",
    {
      config: { audit: "code.revoked" },
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ status: z.enum(["revoked", "already"]) }), 404: notFound },
      },
    },
    async (request, reply) => reply.send({ status: await revokeCode(request.params.id, request.staff!) })
  );
}
