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
import { wrongCount } from "../health/alerts.js";
import { waitlistAdminRoutes } from "./admin/waitlist.js";
import { peopleAdminRoutes } from "./admin/people.js";
import { costsAdminRoutes } from "./admin/costs.js";
import { billingAdminRoutes } from "./admin/billing.js";
import { limitsAdminRoutes } from "./admin/limits.js";
import { healthAdminRoutes, jobAdminRoutes } from "./admin/health.js";
import { staffAdminRoutes } from "./admin/staff.js";
import { auditAdminRoutes } from "./admin/audit.js";

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

      // What support sees: Waitlist, People and a person's page.
      await admin.register(waitlistAdminRoutes);
      await admin.register(peopleAdminRoutes);
      await admin.register(jobAdminRoutes);

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
