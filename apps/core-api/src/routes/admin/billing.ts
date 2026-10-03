// 034, section C. What offload really costs.
//
// Registered by the admin plugin in the owner scope, so the path here is
// relative to `/v1/admin` and already behind the owner check. One read and no
// write: the figures are stored by the daily `billing.pull`, and the amounts
// an owner types are a setting, saved through Limits.
//
// The billing keys live in the environment and are read only by the pull.
// Nothing in this file, or in what it returns, touches one (AC-59).

import { z } from "zod";
import type { App } from "../../app.js";
import { billingMonths } from "../../billing/read.js";

const row = z.object({
  vendor: z.string(),
  name: z.string(),
  source: z.enum(["billed", "metered", "fixed"]),
  micros: z.number().int(),
  metered: z.number().int().optional(),
  difference: z.number().int().optional(),
  readAt: z.string().optional(),
  final: z.boolean(),
  recorded: z.boolean(),
});

const month = z.object({
  month: z.string(),
  final: z.boolean(),
  total: z.number().int(),
  rows: z.array(row),
});

export async function billingAdminRoutes(app: App): Promise<void> {
  // Oldest month first, so the last is the month in progress.
  app.get(
    "/billing",
    {
      schema: {
        querystring: z.object({ months: z.coerce.number().int().min(1).max(36).default(12) }),
        response: { 200: z.object({ months: z.array(month) }), 404: z.object({ error: z.literal("not-found") }) },
      },
    },
    async (request, reply) => reply.send({ months: await billingMonths(request.query.months) }),
  );
}
