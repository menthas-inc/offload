// 2026-10-04, going-public 17b. The panel has a session of its own.
//
// The app's session alone used to be the panel: one cookie lifted from a
// laptop, or a phone's token, was every staff write there is. Now the panel
// opens only for a staff session that signed in within the last few minutes,
// stays open for twelve hours on a pass bound to that one session, and a
// staff session without the pass is told to sign in again.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { PANEL_COOKIE, PANEL_FRESH_MS, PANEL_TTL_MS, sealPanel } from "../src/admin/panel.js";
import { activeAccount, signIn, wipeAdmin } from "./admin-kit.js";

await migrate(() => {});

let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});
beforeEach(wipeAdmin);

async function staff(role: "support" | "owner" = "owner") {
  const id = await activeAccount();
  await db.insertInto("staff").values({ account_id: id, role }).execute();
  const cookie = await signIn(id);
  const session = await db.selectFrom("sessions").select("id").where("account_id", "=", id).orderBy("created_at", "desc").executeTakeFirstOrThrow();
  return { id, cookie, sessionId: session.id };
}

const me = (cookie: string) => app.inject({ method: "GET", url: "/v1/admin/me", headers: { cookie } });
const open = (cookie: string) => app.inject({ method: "POST", url: "/v1/admin/session", headers: { cookie } });
const pass = (response: { headers: Record<string, unknown> }): string => {
  const set = [response.headers["set-cookie"]].flat().map(String).find((one) => one.startsWith(`${PANEL_COOKIE}=`));
  if (!set) throw new Error("no pass");
  return set.split(";")[0]!;
};

describe("the panel's own session", () => {
  it("is locked to a staff session that has not opened it, and is still nothing to anybody else", async () => {
    const owner = await staff();
    const locked = await me(owner.cookie);
    expect([locked.statusCode, locked.json()]).toEqual([401, { error: "locked" }]);

    const stranger = await signIn(await activeAccount());
    expect((await me(stranger)).statusCode).toBe(404);
    expect((await open(stranger)).statusCode).toBe(404);
    expect((await me("")).statusCode).toBe(404);
  });

  it("opens for a session that has just signed in, on a pass only the API path is sent", async () => {
    const owner = await staff();
    const opened = await open(owner.cookie);
    expect(opened.statusCode).toBe(200);
    const set = [opened.headers["set-cookie"]].flat().map(String).find((one) => one.startsWith(`${PANEL_COOKIE}=`))!;
    expect(set).toContain("HttpOnly");
    expect(set).toContain("SameSite=Strict");
    expect(set).toContain("Path=/v1/admin");
    expect(set).toContain(`Max-Age=${PANEL_TTL_MS / 1000}`);
    expect(set).not.toContain("Domain=");

    const inside = await me(`${owner.cookie}; ${pass(opened)}`);
    expect(inside.statusCode).toBe(200);
    expect(inside.json().role).toBe("owner");

    const entries = await db.selectFrom("staff_audit").select(["kind", "staff_account_id"]).execute();
    expect(entries).toEqual([{ kind: "panel.opened", staff_account_id: owner.id }]);
  });

  it("asks for a new sign-in from a session that is not fresh, and hands out no pass", async () => {
    const owner = await staff();
    await db
      .updateTable("sessions")
      .set({ created_at: new Date(Date.now() - PANEL_FRESH_MS - 60_000) })
      .where("id", "=", owner.sessionId)
      .execute();
    const refused = await open(owner.cookie);
    expect([refused.statusCode, refused.json()]).toEqual([401, { error: "sign-in-again" }]);
    expect(refused.headers["set-cookie"]).toBeUndefined();
    expect(await db.selectFrom("staff_audit").select("kind").execute()).toEqual([]);
  });

  it("keeps a pass to the one session it was made for", async () => {
    const owner = await staff();
    const theirs = pass(await open(owner.cookie));
    // The same person, signed in somewhere else: that session opens nothing
    // with this pass, and neither does another member of staff.
    const second = await signIn(owner.id);
    expect((await me(`${second}; ${theirs}`)).statusCode).toBe(401);
    const other = await staff("support");
    expect((await me(`${other.cookie}; ${theirs}`)).statusCode).toBe(401);
    // And it goes with the session: signed out, it is nobody's.
    await db.deleteFrom("sessions").where("id", "=", owner.sessionId).execute();
    expect((await me(`${owner.cookie}; ${theirs}`)).statusCode).toBe(404);
  });

  it("closes after twelve hours, and refuses a pass nobody sealed", async () => {
    const owner = await staff();
    const now = Date.now();
    const sealed = (at: number) => `${owner.cookie}; ${PANEL_COOKIE}=${encodeURIComponent(sealPanel(owner.sessionId, owner.id, at))}`;
    expect((await me(sealed(now))).statusCode).toBe(200);
    expect((await me(sealed(now - PANEL_TTL_MS - 1000))).statusCode).toBe(401);
    const forged = sealPanel(owner.sessionId, owner.id, now).replace(/.$/, (last) => (last === "A" ? "B" : "A"));
    expect((await me(`${owner.cookie}; ${PANEL_COOKIE}=${encodeURIComponent(forged)}`)).statusCode).toBe(401);
  });

  it("reads the pass wherever it sits among cookies of the same name", async () => {
    // A cookie of this name set for the parent domain arrives beside the real
    // one, and reading only the first would lock staff out for good.
    const owner = await staff();
    const real = pass(await open(owner.cookie));
    expect((await me(`${owner.cookie}; ${PANEL_COOKIE}=junk; ${real}`)).statusCode).toBe(200);
    expect((await me(`${owner.cookie}; ${PANEL_COOKIE}=junk`)).statusCode).toBe(401);
  });

  it("is opened by one route and no other", () => {
    const opening = app.routeTable.filter((route) => route.config?.opensPanel).map((route) => `${route.method} ${route.url}`);
    expect(opening).toEqual(["POST /v1/admin/session"]);
  });

  it("locks every route under the panel, a write as much as a read", async () => {
    const owner = await staff();
    const person = await activeAccount();
    for (const [method, url] of [
      ["GET", "/v1/admin/people"],
      ["GET", `/v1/admin/people/${person}`],
      ["POST", `/v1/admin/people/${person}/disable`],
      ["GET", "/v1/admin/staff"],
    ] as const) {
      const response = await app.inject({ method, url, headers: { cookie: owner.cookie } });
      expect([response.statusCode, response.json()], `${method} ${url}`).toEqual([401, { error: "locked" }]);
    }
    expect((await db.selectFrom("accounts").select("state").where("id", "=", person).executeTakeFirstOrThrow()).state).toBe("active");
  });
});
