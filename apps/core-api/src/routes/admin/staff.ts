// 034, section F. Staff: who may open the panel.
//
// Registered by the admin plugin in the owner scope, so every path here is
// relative to `/v1/admin` and already behind the owner check. Each route that
// is not a GET declares `config: { audit: <kind> }` and writes that entry in
// its own transaction, beside the alert every owner is sent.
//
// Access is never cached: the guard reads the staff table on every request,
// so a row written here is in force on that person's next one.
//
// `:id` is the account's id. A staff row has no id of its own.

import { z } from "zod";
import { sql } from "kysely";
import type { Transaction } from "kysely";
import type { App } from "../../app.js";
import { db } from "../../db.js";
import type { Database } from "../../schema.js";
import { audit } from "../../admin/audit.js";
import type { Staff, StaffRole } from "../../admin/staff.js";
import { enqueue, PRIORITY } from "../../jobs/queue.js";
import { uuidv7 } from "../../uuid.js";

const role = z.enum(["support", "owner"]);
const notFound = z.object({ error: z.literal("not-found") });

const member = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  email: z.string(),
  role,
  added: z.string(),
  /** Their newest audit entry. Null when they have written nothing. */
  lastHere: z.string().nullable(),
  you: z.boolean(),
});

type StaffAlert = "staff.added" | "staff.role_changed" | "staff.removed";

/** The email every owner gets when staff change, queued in the transaction
 *  that changed them. Ids only: the handler looks up who to tell. The id is
 *  minted per write and carried in the payload, which is what the handler
 *  keys its fan-out on, so two real changes are two emails. */
async function alertOwners(tx: Transaction<Database>, alert: StaffAlert, staff: Staff, targetAccountId: string): Promise<void> {
  const id = uuidv7();
  await enqueue({
    kind: "email.alert",
    payload: { alert, actorAccountId: staff.accountId, targetAccountId, id },
    priority: PRIORITY.interactive,
    idempotencyKey: `email.alert:${alert}:${targetAccountId}:${id}`,
    tx,
  });
}

/** Every owner's row, locked until the transaction ends.
 *
 *  This is what makes "there is always at least one owner" true under two
 *  requests at once: the second waits here, and when it is let through it
 *  reads the rows as the first left them. The route owns this transaction, so
 *  the lock holds until its own write has landed. Ordered, so two waiters
 *  never hold half each.
 *
 *  Only owners whose account still works count. A disabled account is not
 *  somebody who can open the panel. */
async function lockOwners(tx: Transaction<Database>): Promise<string[]> {
  const locked = await tx.selectFrom("staff").select("account_id").where("role", "=", "owner").orderBy("account_id").forUpdate().execute();
  if (locked.length === 0) return [];
  const working = await tx
    .selectFrom("accounts")
    .select("id")
    .where(
      "id",
      "in",
      locked.map((row) => row.account_id)
    )
    .where("state", "=", "active")
    .where("deleted_at", "is", null)
    .execute();
  return working.map((row) => row.id);
}

type Refusal = "self" | "last_owner" | "not-found";

/** What stands between an owner and a change to somebody else's row, in the
 *  order the answers matter. Returns the target's current role, or why not. */
async function mayChange(tx: Transaction<Database>, staff: Staff, targetId: string, leavesOwners: boolean): Promise<StaffRole | Refusal> {
  // Nobody changes or removes their own role, whoever else is there.
  if (targetId === staff.accountId) return "self";

  const owners = await lockOwners(tx);
  const target = await tx.selectFrom("staff").select("role").where("account_id", "=", targetId).forUpdate().executeTakeFirst();
  if (!target) return "not-found";

  if (target.role === "owner" && leavesOwners && owners.filter((id) => id !== targetId).length === 0) return "last_owner";
  // Whoever is asking stopped being an owner while they waited for the lock.
  // The guard would refuse their next request; this one is that request.
  if (!owners.includes(staff.accountId)) return "not-found";
  return target.role;
}

export async function staffAdminRoutes(app: App): Promise<void> {
  app.get(
    "/staff",
    { schema: { response: { 200: z.object({ staff: z.array(member), owners: z.number().int() }), 404: notFound } } },
    async (request, reply) => {
      const rows = await db
        .selectFrom("staff")
        .innerJoin("accounts", "accounts.id", "staff.account_id")
        .select([
          "staff.account_id as id",
          "staff.role as role",
          "staff.created_at as added",
          "accounts.display_name as name",
          "accounts.email as email",
          // No last-seen column, on purpose: stamping one would be a read that
          // writes. Last here is the newest thing they did.
          sql<Date | null>`(select max(at) from staff_audit where staff_audit.staff_account_id = staff.account_id)`.as("last_here"),
        ])
        .where("accounts.deleted_at", "is", null)
        .orderBy("staff.created_at")
        .orderBy("staff.account_id")
        .execute();

      return reply.send({
        staff: rows.map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          role: row.role,
          added: row.added.toISOString(),
          lastHere: row.last_here ? row.last_here.toISOString() : null,
          you: row.id === request.staff!.accountId,
        })),
        owners: rows.filter((row) => row.role === "owner").length,
      });
    }
  );

  // Add somebody, by address. They must already have an offload account that
  // works and that signs in one way: staff with two providers linked is two
  // ways into the panel, and 0007 refuses the second identity for the same
  // reason. Nothing is emailed to them.
  app.post(
    "/staff",
    {
      config: { audit: "staff.added" },
      schema: {
        body: z.object({ email: z.string().trim().toLowerCase().max(320).pipe(z.email()), role }),
        response: {
          200: z.object({ id: z.string().uuid() }),
          404: notFound,
          409: z.object({ error: z.enum(["no_account", "two_sign_ins", "already_staff"]) }),
        },
      },
    },
    async (request, reply) => {
      const { email } = request.body;
      let outcome: { id: string } | "no_account" | "two_sign_ins" | "already_staff";
      try {
        outcome = await db.transaction().execute(async (tx) => {
          const account = await tx
            .selectFrom("accounts")
            .select("id")
            .where((eb) => eb(eb.fn("lower", ["email"]), "=", email))
            .where("state", "=", "active")
            .where("deleted_at", "is", null)
            .executeTakeFirst();
          if (!account) return "no_account" as const;

          const already = await tx.selectFrom("staff").select("account_id").where("account_id", "=", account.id).executeTakeFirst();
          if (already) return "already_staff" as const;

          const identities = await tx
            .selectFrom("account_identities")
            .select(db.fn.countAll<string>().as("n"))
            .where("account_id", "=", account.id)
            .executeTakeFirstOrThrow();
          if (Number(identities.n) > 1) return "two_sign_ins" as const;

          await tx.insertInto("staff").values({ account_id: account.id, role: request.body.role }).execute();
          await audit(tx, { staff: request.staff!, kind: "staff.added", targetAccountId: account.id, new: request.body.role });
          await alertOwners(tx, "staff.added", request.staff!, account.id);
          return { id: account.id };
        });
      } catch (error) {
        // The two races the checks above cannot see, each refused by the
        // database: a second identity linked in between (0075's trigger), and
        // the same person added twice at once (the primary key).
        const code = (error as { code?: string }).code;
        if (code === "23514") outcome = "two_sign_ins";
        else if (code === "23505") outcome = "already_staff";
        else throw error;
      }

      if (typeof outcome === "string") return reply.status(409).send({ error: outcome });
      return reply.send(outcome);
    }
  );

  app.patch(
    "/staff/:id",
    {
      config: { audit: "staff.role_changed" },
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ role }),
        response: { 200: z.object({ role }), 404: notFound, 409: z.object({ error: z.enum(["self", "last_owner"]) }) },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const next = request.body.role;
      const outcome = await db.transaction().execute(async (tx) => {
        const current = await mayChange(tx, request.staff!, id, next !== "owner");
        if (current === "self" || current === "last_owner" || current === "not-found") return current;
        // A role that is already that role changes nothing and records nothing.
        if (current === next) return "same" as const;

        await tx.updateTable("staff").set({ role: next }).where("account_id", "=", id).execute();
        await audit(tx, { staff: request.staff!, kind: "staff.role_changed", targetAccountId: id, old: current, new: next });
        await alertOwners(tx, "staff.role_changed", request.staff!, id);
        return "changed" as const;
      });

      if (outcome === "not-found") return reply.status(404).send({ error: "not-found" as const });
      if (outcome === "self" || outcome === "last_owner") return reply.status(409).send({ error: outcome });
      return reply.send({ role: next });
    }
  );

  // Remove somebody from staff. The row goes and nothing else does: their own
  // offload account, and their sessions in the app, are untouched.
  app.delete(
    "/staff/:id",
    {
      config: { audit: "staff.removed" },
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ status: z.literal("removed") }), 404: notFound, 409: z.object({ error: z.enum(["self", "last_owner"]) }) },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const outcome = await db.transaction().execute(async (tx) => {
        const current = await mayChange(tx, request.staff!, id, true);
        if (current === "self" || current === "last_owner" || current === "not-found") return current;

        await tx.deleteFrom("staff").where("account_id", "=", id).execute();
        await audit(tx, { staff: request.staff!, kind: "staff.removed", targetAccountId: id, old: current });
        await alertOwners(tx, "staff.removed", request.staff!, id);
        return "removed" as const;
      });

      if (outcome === "not-found") return reply.status(404).send({ error: "not-found" as const });
      if (outcome === "self" || outcome === "last_owner") return reply.status(409).send({ error: outcome });
      return reply.send({ status: "removed" as const });
    }
  );
}
