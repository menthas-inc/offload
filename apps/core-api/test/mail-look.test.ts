// 026. The look's verdict, applied by core-api (AC-9, SEC-2).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { receiveMail } from "../src/mail-in/receive.js";
import { resetObjectStore } from "../src/blobs/store.js";
import { wipe } from "./labels-kit.js";
import { DOMAIN, person, resolver, signed, withImages } from "./mail-kit.js";

await migrate(() => {});
let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});

let jo: string;
beforeEach(async () => {
  resetObjectStore();
  await sql`delete from mail_signatures`.execute(db);
  await db.deleteFrom("blobs").execute();
  await wipe();
  jo = await person(`jo@${DOMAIN}`);
});

async function mailWith(count: number) {
  await receiveMail(await signed(withImages(count, "")), { resolver: resolver() });
  const job = await db.selectFrom("jobs").select(["id", "payload"]).where("account_id", "=", jo).where("kind", "=", "dump.answer").orderBy("created_at", "desc").limit(1).executeTakeFirstOrThrow();
  const { messageId, mailLook } = job.payload as { messageId: string; mailLook: string[] };
  return { jobId: job.id, messageId, look: mailLook };
}

const look = (messageId: string, jobId: string, keep: string[]) =>
  app.inject({
    method: "POST",
    url: `/internal/v1/messages/${messageId}/look`,
    headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
    payload: { jobId, keep },
  });

describe("the look's verdict (AC-9)", () => {
  it("claims what it kept, in the email's order, and deletes the rest", async () => {
    const { jobId, messageId, look: ids } = await mailWith(3);
    const res = await look(messageId, jobId, [ids[2]!, ids[0]!]);
    expect(res.statusCode).toBe(200);
    const blobs = await db.selectFrom("blobs").select(["id", "message_id", "deleted_at"]).where("id", "in", ids).execute();
    const byId = new Map(blobs.map((b) => [b.id, b]));
    expect(byId.get(ids[0]!)!.message_id).toBe(messageId);
    expect(byId.get(ids[2]!)!.message_id).toBe(messageId);
    expect(byId.get(ids[1]!)!.deleted_at).not.toBeNull();
    expect(res.json()).toEqual({ kept: [ids[0], ids[2]] });
    const message = await db.selectFrom("messages").select("type").where("id", "=", messageId).executeTakeFirstOrThrow();
    expect(message.type).toBe("image");
  });

  it("refuses an id the job did not name", async () => {
    const { jobId, messageId } = await mailWith(1);
    const res = await look(messageId, jobId, ["01a0f3fb-b9e9-7d36-88a1-3d2cfd2dda3e"]);
    expect(res.statusCode).toBe(400);
  });

  it("refuses a job that is not this message's", async () => {
    const { messageId } = await mailWith(1);
    const res = await look(messageId, "01a0f3fb-b9e9-7d36-88a1-3d2cfd2dda3e", []);
    expect(res.statusCode).toBe(404);
  });

  it("changes nothing the second time", async () => {
    const { jobId, messageId, look: ids } = await mailWith(2);
    await look(messageId, jobId, [ids[0]!]);
    const again = await look(messageId, jobId, [ids[0]!]);
    expect(again.json()).toEqual({ kept: [ids[0]] });
  });

  it("keeps nothing when the look kept nothing", async () => {
    const { jobId, messageId, look: ids } = await mailWith(2);
    await look(messageId, jobId, []);
    const live = await db.selectFrom("blobs").select("id").where("id", "in", ids).where("deleted_at", "is", null).execute();
    expect(live).toEqual([]);
  });

  it("serves the worker a candidate's bytes for its own job, and not for another's", async () => {
    const first = await mailWith(1);
    const second = await mailWith(1);
    const get = (blobId: string, jobId: string) =>
      app.inject({
        method: "GET",
        url: `/internal/v1/blobs/${blobId}/original?jobId=${jobId}`,
        headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
      });
    const own = await get(first.look[0]!, first.jobId);
    expect(own.statusCode).toBe(200);
    expect(own.headers["content-type"]).toBe("image/png");
    expect((await get(first.look[0]!, second.jobId)).statusCode).toBe(404);
  });
});
