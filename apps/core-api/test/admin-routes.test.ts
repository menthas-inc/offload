// 034. Three rules about the admin API, asserted against the route table the
// app actually registered rather than against a list somebody maintains:
//
//   AC-3   every `/v1/admin` route carries the staff check, at the right rank
//   AC-6   no GET writes anything
//   AC-52  every write declares the audit entry it produces
//
// A section adds a route and these walk it without being told. The guard is
// one `onRequest` hook on the prefix, so a route nobody remembered to guard
// is refused anyway; this is the test that says so for each one.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "better-auth/api";
import { auth } from "../src/auth/auth.js";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App, type RouteEntry } from "../src/app.js";
import { AUDIT_KINDS } from "../src/admin/audit.js";
import { activeAccount, adminRoutesOf, fill, signIn, staffMember, wipeAdmin } from "./admin-kit.js";
import { waitlistAdminRoutes } from "../src/routes/admin/waitlist.js";
import { peopleAdminRoutes } from "../src/routes/admin/people.js";
import { costsAdminRoutes } from "../src/routes/admin/costs.js";
import { billingAdminRoutes } from "../src/routes/admin/billing.js";
import { limitsAdminRoutes } from "../src/routes/admin/limits.js";
import { healthAdminRoutes, jobAdminRoutes } from "../src/routes/admin/health.js";
import { staffAdminRoutes } from "../src/routes/admin/staff.js";
import { auditAdminRoutes } from "../src/routes/admin/audit.js";

await migrate(() => {});

let app: App;
let routes: RouteEntry[];

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  routes = adminRoutesOf(app);
});

afterAll(async () => {
  await app.close();
  await closeDb();
});

beforeEach(wipeAdmin);
afterEach(() => {
  vi.restoreAllMocks();
});

/** Owner pages, by where they live. Health, Costs, Limits, Staff and Audit:
 *  support does not see them refused, it does not see them. */
const OWNER_PREFIXES = ["/v1/admin/health", "/v1/admin/costs", "/v1/admin/billing", "/v1/admin/settings", "/v1/admin/limits", "/v1/admin/staff", "/v1/admin/audit"];

/** Owner-only routes inside pages support does see. Each declares
 *  `config.rank`, and the prefix guard reads it. */
const OWNER_ROUTES = [
  "PATCH /v1/admin/people/:id/limits",
  "POST /v1/admin/people/:id/delete",
  "POST /v1/admin/people/:id/delete/cancel",
  "POST /v1/admin/jobs/:id/dismiss",
];

const name = (route: RouteEntry) => `${route.method} ${route.url}`;
const ownerOnly = (route: RouteEntry) =>
  OWNER_PREFIXES.some((prefix) => route.url === prefix || route.url.startsWith(`${prefix}/`)) ||
  OWNER_ROUTES.includes(name(route)) ||
  route.config.rank === "owner";

const call = (route: RouteEntry, cookie?: string) =>
  app.inject({
    method: route.method as "GET",
    url: fill(route.url),
    headers: cookie ? { cookie } : {},
    // A body, so a write is refused by the guard and not by the parser.
    ...(route.method === "GET" || route.method === "DELETE" ? {} : { payload: {} }),
  });

/** The admin API as it was before 034 added a page. */
const BEFORE = [
  "GET /v1/admin/me",
  "GET /v1/admin/waitlist",
  "POST /v1/admin/waitlist/:id/invite",
  "POST /v1/admin/waitlist/invite",
  "POST /v1/admin/waitlist/:id/resend",
  "DELETE /v1/admin/waitlist/:id",
  "POST /v1/admin/waitlist/remove",
  "POST /v1/admin/waitlist/invite-next",
  "GET /v1/admin/settings",
  "PATCH /v1/admin/settings",
];

describe("the route table", () => {
  it("holds the admin API, including the routes that existed before 034", () => {
    const names = routes.map(name);
    for (const expected of BEFORE) {
      expect(names, expected).toContain(expected);
    }
  });

  it("registers one file per section, each a function that takes the app", () => {
    for (const section of [
      waitlistAdminRoutes,
      peopleAdminRoutes,
      costsAdminRoutes,
      billingAdminRoutes,
      limitsAdminRoutes,
      healthAdminRoutes,
      jobAdminRoutes,
      staffAdminRoutes,
      auditAdminRoutes,
    ]) {
      expect(typeof section).toBe("function");
    }
  });
});

describe("AC-3 every admin route carries the staff check at the right rank", () => {
  it("answers 404 to nobody, whatever the route", async () => {
    for (const route of routes) {
      expect((await call(route)).statusCode, name(route)).toBe(404);
    }
  });

  it("answers 404 to a signed-in account that is not staff", async () => {
    const cookie = await signIn(await activeAccount());
    for (const route of routes) {
      const response = await call(route, cookie);
      expect(response.statusCode, name(route)).toBe(404);
      expect(response.json(), name(route)).toEqual({ error: "not-found" });
    }
  });

  it("answers 404 to support on every owner route", async () => {
    const support = await staffMember("support");
    const owners = routes.filter(ownerOnly);
    expect(owners.map(name)).toContain("GET /v1/admin/settings");
    for (const route of owners) {
      const response = await call(route, support.cookie);
      expect(response.statusCode, name(route)).toBe(404);
      expect(response.json(), name(route)).toEqual({ error: "not-found" });
    }
  });

  it("lets support past the guard on every other write", async () => {
    // The guard answers before the body is read, so a body that cannot be
    // parsed is refused with 400 only by a request that got through it.
    const support = await staffMember("support");
    const writes = routes.filter((one) => !ownerOnly(one) && (one.method === "POST" || one.method === "PATCH"));
    expect(writes.length).toBeGreaterThan(0);
    for (const route of writes) {
      const response = await app.inject({
        method: route.method as "POST",
        url: fill(route.url),
        headers: { cookie: support.cookie, "content-type": "application/json" },
        payload: "{",
      });
      expect(response.statusCode, name(route)).toBe(400);
    }
  });

  it("marks the owner-only routes inside support pages, where they exist", () => {
    for (const route of routes.filter((one) => OWNER_ROUTES.includes(name(one)))) {
      expect(route.config.rank, name(route)).toBe("owner");
    }
  });

  // The session row can go between the cookie being read and the row being
  // used, and the lookup can fail outright. Neither is a different answer:
  // the panel does not say why it will not place a request.
  it("answers 404 when the session cannot be looked up, as it does to anybody it cannot place", async () => {
    const owner = await staffMember("owner");
    const settings = routes.find((route) => name(route) === "GET /v1/admin/settings")!;
    const disable = routes.find((route) => name(route) === "POST /v1/admin/people/:id/disable")!;

    for (const failure of [new APIError("UNAUTHORIZED", { message: "Failed to get session" }), new Error("Connection terminated unexpectedly")]) {
      for (const route of [settings, disable]) {
        vi.spyOn(auth.api, "getSession").mockRejectedValueOnce(failure);
        const response = await call(route, owner.cookie);
        expect(response.statusCode, `${name(route)}: ${failure.message}`).toBe(404);
        expect(response.json(), name(route)).toEqual({ error: "not-found" });
      }
    }
    // And the same cookie is good again once the lookup is.
    expect((await call(settings, owner.cookie)).statusCode).toBe(200);

    // The admin API is left out of the rule that holds writes until consent
    // (`accounts/active.ts`), because this guard is that rule and more: staff
    // whose account is not active are not found, on a write as on a read.
    await db.updateTable("accounts").set({ state: "invited" }).where("id", "=", owner.id).execute();
    for (const route of [settings, disable]) {
      const response = await call(route, owner.cookie);
      expect(response.statusCode, name(route)).toBe(404);
      expect(response.json(), name(route)).toEqual({ error: "not-found" });
    }
  });

  it("closes for staff the moment the role goes", async () => {
    const owner = await staffMember("owner");
    const settings = routes.find((route) => name(route) === "GET /v1/admin/settings")!;
    expect((await call(settings, owner.cookie)).statusCode).toBe(200);
    await db.updateTable("staff").set({ role: "support" }).where("account_id", "=", owner.id).execute();
    expect((await call(settings, owner.cookie)).statusCode).toBe(404);
  });
});

describe("AC-6 no GET under the admin API writes", () => {
  it("declares no audit entry on any GET, because a GET has nothing to record", () => {
    for (const route of routes.filter((one) => one.method === "GET")) {
      expect(route.config.audit, name(route)).toBeUndefined();
    }
  });

  it("uses only the methods the API's CORS allows", () => {
    for (const route of routes) {
      expect(["GET", "POST", "PATCH", "DELETE"], name(route)).toContain(route.method);
    }
  });
});

describe("AC-52 every write declares its audit entry", () => {
  it("names a kind from the closed set on every route that is not a GET", () => {
    const writes = routes.filter((one) => one.method !== "GET");
    expect(writes.length).toBeGreaterThan(0);
    for (const route of writes) {
      expect(AUDIT_KINDS, name(route)).toContain(route.config.audit);
    }
  });
});

// Red until deletion lands. Groundwork registered each section's file empty
// and the six sections filled them; the two delete routes are stage 2. This
// is the list from the impl-spec, reconciled at the merge with what the
// sections registered beyond it (invite by address, the two stats rows'
// reads, the audit filters' choices), and the marker comes off when every
// one of them is registered.
describe("every route the impl-spec names", () => {
  const SPEC = [
    // 2026-10-04, going-public 17b: the panel's own session.
    "POST /v1/admin/session",
    "POST /v1/admin/waitlist/invite-address",
    "GET /v1/admin/waitlist/stats",
    "GET /v1/admin/people",
    "GET /v1/admin/people/stats",
    "POST /v1/admin/people/:id/disable",
    "POST /v1/admin/people/:id/enable",
    "POST /v1/admin/people/:id/sign-out",
    "POST /v1/admin/people/:id/viewed",
    "GET /v1/admin/people/:id",
    "GET /v1/admin/people/:id/usage",
    "GET /v1/admin/people/:id/timeline",
    "GET /v1/admin/people/:id/hits",
    "PATCH /v1/admin/people/:id/limits",
    "POST /v1/admin/people/:id/delete",
    "POST /v1/admin/people/:id/delete/cancel",
    "GET /v1/admin/costs/summary",
    "GET /v1/admin/costs/daily",
    "GET /v1/admin/costs/by",
    "GET /v1/admin/costs/trends",
    "GET /v1/admin/costs/usage",
    "GET /v1/admin/costs/heaviest",
    "GET /v1/admin/costs/export.csv",
    "GET /v1/admin/billing",
    "GET /v1/admin/limits/hits",
    "GET /v1/admin/limits/now",
    "GET /v1/admin/health/services",
    "GET /v1/admin/health/incidents",
    "GET /v1/admin/health/queue",
    "GET /v1/admin/health/backups",
    "GET /v1/admin/health/scheduled",
    "GET /v1/admin/health/scheduled/:kind",
    "GET /v1/admin/health/stuck",
    "GET /v1/admin/health/dead",
    "GET /v1/admin/health/calls",
    "GET /v1/admin/health/vendors",
    "POST /v1/admin/jobs/:id/retry",
    "POST /v1/admin/jobs/:id/dismiss",
    "GET /v1/admin/staff",
    "POST /v1/admin/staff",
    "PATCH /v1/admin/staff/:id",
    "DELETE /v1/admin/staff/:id",
    "GET /v1/admin/audit",
    "GET /v1/admin/audit/facets",
  ];

  it("is registered", () => {
    const names = routes.map(name);
    expect(SPEC.filter((route) => !names.includes(route))).toEqual([]);
  });

  it("is the whole admin API: nothing is registered that no list names", () => {
    const listed = new Set([...BEFORE, ...SPEC]);
    expect(routes.map(name).filter((route) => !listed.has(route))).toEqual([]);
  });
});
