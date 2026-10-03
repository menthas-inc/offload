// Railway's own bill (034, section 4.1), read from its public GraphQL API.
//
// Written against what the interface answered on 2026-10-03, kept as
// `test/fixtures/billing/railway.json`. What that showed, none of it from the
// documentation:
//
// - A workspace token answers `projects` and `workspace`, and not `me`.
// - An invoice's `total` is whole cents. `currentUsage` is dollars, a float,
//   for the running period, and is use so far, not yet a bill.
// - A period runs from the day the subscription began to the same day a month
//   on, not a calendar month, so an invoice is filed under the month most of
//   its period is in.
// - The bill is the whole workspace's. Railway prices no project on its own,
//   so another project in the same workspace is in this figure too.
//
// It sends the key and the question. The range it is handed only chooses
// which months it answers; Railway is not sent it.

import { z } from "zod";
import type { Pulled, Puller } from "./pull.js";

const URL = "https://backboard.railway.com/graphql/v2";

const PROJECTS = "{ projects { edges { node { workspaceId } } } }";
const bill = (workspaceId: string) =>
  `{ workspace(workspaceId: "${workspaceId}") { customer { currentUsage billingPeriod { start end } invoices { periodStart periodEnd status total } } } }`;

const projects = z.object({
  data: z.object({ projects: z.object({ edges: z.array(z.object({ node: z.object({ workspaceId: z.uuid() }) })).min(1) }) }),
});

const customer = z.object({
  data: z.object({
    workspace: z.object({
      customer: z.object({
        currentUsage: z.number().nonnegative(),
        billingPeriod: z.object({ start: z.iso.datetime(), end: z.iso.datetime() }),
        invoices: z.array(
          z.object({ periodStart: z.iso.datetime(), periodEnd: z.iso.datetime(), status: z.string().nullable(), total: z.number().int().nonnegative() }),
        ),
      }),
    }),
  }),
});

/** An invoice that is a bill: paid, or issued and waiting. A draft, a void
 *  one and one written off are not money owed. */
const BILLED = new Set(["paid", "open"]);

/** The UTC month most of a period is in. */
function monthOf(start: string, end: string): string {
  return new Date((Date.parse(start) + Date.parse(end)) / 2).toISOString().slice(0, 7);
}

export function railwayPuller(options: { fetcher?: typeof fetch; token?: string } = {}): Puller {
  const ask = async (query: string): Promise<unknown> => {
    const token = options.token ?? process.env["RAILWAY_API_TOKEN"] ?? "";
    const response = await (options.fetcher ?? fetch)(URL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
    // The status and nothing the response or the request said.
    if (!response.ok) throw new Error(`railway ${response.status}`);
    return response.json();
  };

  return {
    vendor: "railway",
    async pull(from: Date, _to: Date): Promise<Pulled[]> {
      const { data } = projects.parse(await ask(PROJECTS));
      const account = customer.parse(await ask(bill(data.projects.edges[0]!.node.workspaceId))).data.workspace.customer;

      const months = new Map<string, Pulled>();
      for (const invoice of account.invoices) {
        if (!BILLED.has(invoice.status ?? "")) continue;
        const month = monthOf(invoice.periodStart, invoice.periodEnd);
        const so = months.get(month);
        months.set(month, { month, micros: (so?.micros ?? 0) + invoice.total * 10_000, final: true });
      }
      // The running period, unless an invoice has already closed its month.
      const running = monthOf(account.billingPeriod.start, account.billingPeriod.end);
      if (!months.has(running)) months.set(running, { month: running, micros: Math.round(account.currentUsage * 1_000_000), final: false });

      const first = from.toISOString().slice(0, 7);
      return [...months.values()].filter((row) => row.month >= first).sort((a, b) => a.month.localeCompare(b.month));
    },
  };
}
