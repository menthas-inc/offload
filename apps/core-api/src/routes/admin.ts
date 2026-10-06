// The admin panel's API.
//
// One plugin, mounted at `/v1/admin`. Everything about who may call it lives
// in admin/staff.ts and is applied here, once: an `onRequest` staff check on
// the whole prefix, and an owner check on the scope the owner pages register
// in. A route added under either is guarded by where it was registered, not by
// its author remembering to, and `test/admin-routes.test.ts` walks the route
// table to hold that (034 AC-3).
//
// One file per page, under routes/admin/. This file is the shell: the guard,
// the registration, and the one read the panel's nav makes.

import { z } from "zod";
import type { App } from "../app.js";
import { db } from "../db.js";
import { requireStaff } from "../admin/staff.js";
import { audit } from "../admin/audit.js";
import { PANEL_FRESH_MS, PANEL_TTL_MS, panelCookie, sealPanel } from "../admin/panel.js";
import { wrongCount } from "../health/alerts.js";
import { waitlistAdminRoutes } from "./admin/waitlist.js";
import { peopleAdminRoutes } from "./admin/people.js";
import { costsAdminRoutes } from "./admin/costs.js";
import { billingAdminRoutes } from "./admin/billing.js";
import { limitsAdminRoutes } from "./admin/limits.js";
import { healthAdminRoutes, jobAdminRoutes } from "./admin/health.js";
import { staffAdminRoutes } from "./admin/staff.js";
import { auditAdminRoutes } from "./admin/audit.js";
import { codeAdminRoutes } from "./admin/codes.js";

export async function adminRoutes(app: App): Promise<void> {
  await app.register(
    async (admin: App) => {
      // Before the body is read, so the answer to somebody who is not staff
      // is the same whatever they sent.
      admin.addHook("onRequest", requireStaff());

      // What the panel's own shell asks first: am I staff, and which pages exist
      // for me? The role decides which nav items render at all, because support
      // does not see costs and limits refused, it does not see them.
      admin.get(
        "/me",
        {
          schema: {
            response: {
              200: z.object({
                role: z.enum(["support", "owner"]),
                /** Shown in the nav. The kit says "signed in as" and then an
                 *  address, because a role is not who you are and support often
                 *  has two accounts open. */
                email: z.string(),
                /** The count beside Waitlist in the nav. */
                waiting: z.number().int(),
                /** 034. The count beside Health: dead jobs, services down, a
                 *  late backup. Zero for support, who does not see Health. */
                wrong: z.number().int(),
              }),
              404: z.object({ error: z.literal("not-found") }),
            },
          },
        },
        async (request, reply) => {
          const [account, counts] = await Promise.all([
            db
              .selectFrom("accounts")
              .select(["email"])
              .where("id", "=", request.staff!.accountId)
              .executeTakeFirstOrThrow(),
            db
              .selectFrom("accounts")
              .select(db.fn.countAll<string>().as("n"))
              .where("state", "=", "waitlist")
              .where("deleted_at", "is", null)
              .executeTakeFirstOrThrow(),
          ]);

          return reply.send({
            role: request.staff!.role,
            email: account.email,
            waiting: Number(counts.n),
            wrong: request.staff!.role === "owner" ? await wrongCount() : 0,
          });
        }
      );

      // Opening the panel. A staff session that signed in within the last few
      // minutes is handed the pass every other route here asks for; an older
      // one is told to sign in again. Recorded, as every write here is.
      admin.post(
        "/session",
        {
          config: { opensPanel: true, audit: "panel.opened" },
          schema: {
            response: {
              200: z.object({ status: z.literal("open"), until: z.string() }),
              401: z.object({ error: z.literal("sign-in-again") }),
              404: z.object({ error: z.literal("not-found") }),
            },
          },
        },
        async (request, reply) => {
          const staff = request.staff!;
          const now = Date.now();
          if (now - staff.signedInAt.getTime() > PANEL_FRESH_MS) return reply.status(401).send({ error: "sign-in-again" as const });
          await db.transaction().execute((tx) => audit(tx, { staff, kind: "panel.opened" }));
          reply.header("set-cookie", panelCookie(sealPanel(staff.sessionId, staff.accountId, now)));
          return reply.send({ status: "open" as const, until: new Date(now + PANEL_TTL_MS).toISOString() });
        },
      );

      // What support sees: Waitlist, People and a person's page.
      await admin.register(waitlistAdminRoutes);
      await admin.register(peopleAdminRoutes);
      await admin.register(jobAdminRoutes);
      // 039. Review codes, on the Waitlist page: inviting is support's job.
      await admin.register(codeAdminRoutes);

      // What only an owner sees: Health, Costs, Limits, Staff and Audit.
      await admin.register(async (owner: App) => {
        owner.addHook("onRequest", requireStaff("owner"));
        await owner.register(healthAdminRoutes);
        await owner.register(costsAdminRoutes);
        await owner.register(billingAdminRoutes);
        await owner.register(limitsAdminRoutes);
        await owner.register(staffAdminRoutes);
        await owner.register(auditAdminRoutes);
      });
    },
    { prefix: "/v1/admin" }
  );
}
