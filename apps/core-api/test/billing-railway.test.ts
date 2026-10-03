// 034 section C, task C1 for Railway. The puller is written against what
// Railway answered on 2026-10-03 (`fixtures/billing/railway.json`), not
// against its documentation: every key the code reads has to be a key that
// answer has, and the months and amounts are the ones on those invoices.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PULLERS } from "../src/billing/pull.js";
import { railwayPuller } from "../src/billing/railway.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/billing/railway.json", import.meta.url), "utf8")) as {
  projects: unknown;
  workspace: { data: { workspace: { customer: { invoices: Record<string, unknown>[] } & Record<string, unknown> } } };
};

type Sent = { url: string; headers: Record<string, string>; body: { query: string } & Record<string, unknown> };

/** Railway, answering what it answered. */
function railway(over: { workspace?: unknown; status?: number } = {}) {
  const sent: Sent[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Sent["body"];
    sent.push({ url: String(url), headers: init.headers as Record<string, string>, body });
    const answer = body.query.includes("projects") ? fixture.projects : (over.workspace ?? fixture.workspace);
    return new Response(JSON.stringify(answer), { status: over.status ?? 200 });
  }) as unknown as typeof fetch;
  return { sent, puller: railwayPuller({ fetcher, token: "t0ken" }) };
}

const FROM = new Date("2026-09-01T00:00:00Z");
const NOW = new Date("2026-10-03T12:00:00Z");

describe("the Railway puller", () => {
  it("is registered under its key's name", () => {
    expect(PULLERS.map((one) => [one.env, one.puller.vendor])).toEqual([["RAILWAY_API_TOKEN", "railway"]]);
  });

  it("files each invoice under the month most of its period is in, in millionths, closed", async () => {
    const { puller } = railway();
    const rows = await puller.pull(new Date("2026-05-01T00:00:00Z"), NOW);
    expect(rows).toEqual([
      { month: "2026-05", micros: 5_000_000, final: true },
      { month: "2026-06", micros: 5_000_000, final: true },
      { month: "2026-07", micros: 5_000_000, final: true },
      // Two invoices: the month's plan and a change of plan the next day.
      { month: "2026-08", micros: 19_480_000, final: true },
      { month: "2026-09", micros: 20_000_000, final: true },
      // The running period: what has been used so far, not yet a bill.
      { month: "2026-10", micros: 1_311_611, final: false },
    ]);
  });

  it("answers only the months in the range it was handed", async () => {
    const { puller } = railway();
    expect((await puller.pull(FROM, NOW)).map((row) => row.month)).toEqual(["2026-09", "2026-10"]);
  });

  it("reads only keys the recorded answer has", () => {
    const customer = fixture.workspace.data.workspace.customer;
    expect(Object.keys(customer).sort()).toEqual(["billingPeriod", "currentUsage", "invoices"]);
    for (const invoice of customer.invoices) expect(Object.keys(invoice).sort()).toEqual(["periodEnd", "periodStart", "status", "total"]);
  });

  it("sends the key and the question, and nothing else", async () => {
    const { puller, sent } = railway();
    await puller.pull(FROM, NOW);
    expect(sent).toHaveLength(2);
    for (const one of sent) {
      expect(one.url).toBe("https://backboard.railway.com/graphql/v2");
      expect(one.headers).toEqual({ authorization: "Bearer t0ken", "content-type": "application/json" });
      expect(Object.keys(one.body)).toEqual(["query"]);
    }
  });

  it("leaves out an invoice that was voided or never issued", async () => {
    const workspace = structuredClone(fixture.workspace);
    workspace.data.workspace.customer.invoices[0]!["status"] = "void";
    const { puller } = railway({ workspace });
    expect((await puller.pull(FROM, NOW)).find((row) => row.month === "2026-09")).toBeUndefined();
  });

  it("throws on an answer it cannot read, and on a refusal, saying nothing of the key", async () => {
    const broken = structuredClone(fixture.workspace);
    delete broken.data.workspace.customer.invoices[0]!["total"];
    await expect(railway({ workspace: broken }).puller.pull(FROM, NOW)).rejects.toThrow();
    await expect(railway({ workspace: { errors: [{ message: "Not Authorized" }], data: null } }).puller.pull(FROM, NOW)).rejects.toThrow();
    const refused = await railway({ status: 401 }).puller.pull(FROM, NOW).catch((error: Error) => error);
    expect(String(refused)).not.toContain("t0ken");
  });
});
