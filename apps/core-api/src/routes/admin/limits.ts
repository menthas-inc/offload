// 034, section D. Limits: every cap and switch an owner can change while
// offload runs.
//
// Registered by the admin plugin in the owner scope, so every path here is
// relative to `/v1/admin` and already behind the owner check. The registry,
// its bounds and the save itself live in `settings.ts`; this file is the
// shape of the requests.

import { z } from "zod";
import type { FastifyReply } from "fastify";
import type { App } from "../../app.js";
import { db } from "../../db.js";
import { SettingsRefused, clearSettingsCache, listSettings, saveSettings } from "../../settings.js";

const value = z.union([z.number(), z.boolean(), z.null(), z.record(z.string(), z.number())]);

const row = z.object({
  key: z.string(),
  kind: z.enum(["int", "micros", "bool", "money-map"]),
  value,
  default: value,
  /** Bounds for a number, and for each amount in a map. Null for a switch. */
  min: z.number().nullable(),
  max: z.number().nullable(),
  /** Whether null is a value, meaning off. */
  nullable: z.boolean(),
  /** The stored row made no sense, and the default is what is in force. */
  malformed: z.boolean(),
  updatedAt: z.string().nullable(),
});

const settings = z.object({ settings: z.array(row) });
const notFound = z.object({ error: z.literal("not-found") });

export async function limitsAdminRoutes(app: App): Promise<void> {
  app.get("/settings", { schema: { response: { 200: settings, 404: notFound } } }, async (_request, reply) =>
    reply.send({ settings: await listSettings() })
  );

  // One save for the page. PATCH, as every edit here is: the API's CORS
  // allows no PUT.
  //
  // `expected` is what the page showed for each key it is changing. A value
  // somebody else has since moved is a conflict: nothing is written and the
  // answer carries the current values, so the page can show them. A value
  // outside its bounds is refused with the bounds, and nothing is written.
  //
  // 400 is not in the response map, for the reason `dumps.ts` gives: a
  // validation failure answers 400 too, with a body of its own.
  app.patch(
    "/settings",
    {
      config: { audit: "setting.changed" },
      schema: {
        body: z.object({ changes: z.record(z.string(), z.unknown()), expected: z.record(z.string(), z.unknown()) }),
        response: { 200: settings, 404: notFound, 409: settings.extend({ error: z.literal("conflict"), key: z.string() }) },
      },
    },
    async (request, reply) => {
      try {
        await db.transaction().execute((tx) => saveSettings(request.body.changes, request.body.expected, request.staff!, tx));
      } catch (error) {
        if (!(error instanceof SettingsRefused)) throw error;
        if (error.code === "conflict") {
          clearSettingsCache();
          return reply.code(409).send({ error: "conflict" as const, key: error.key, settings: await listSettings() });
        }
        // Untyped on purpose: 400 has no schema here, as above.
        return (reply as FastifyReply).code(400).send({ error: error.code, key: error.key, min: error.min, max: error.max });
      }
      // After the commit, so this instance reads what it just wrote. Every
      // other instance sees it inside the cache's fifteen seconds.
      clearSettingsCache();
      return reply.send({ settings: await listSettings() });
    }
  );
}
