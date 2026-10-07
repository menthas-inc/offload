// Dry runs of the sweep's two workflow scripts against stubbed agents, so their
// control flow is tested without spending a single model call.
// Run: node --test .claude/workflows/test-sweep-workflows.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// The workflow runtime: the script body runs as an async function with these in scope.
async function run(file, args, answer) {
  const source = readFileSync(join(here, file), "utf8").replace(/^export const meta/m, "const meta");
  const calls = [];
  const agent = async (prompt, opts = {}) => {
    calls.push({ prompt, ...opts });
    return answer(prompt, opts);
  };
  const parallel = async thunks => Promise.all(thunks.map(t => t().catch(() => null)));
  const pipeline = async (items, ...stages) => Promise.all(items.map(async (item, i) => {
    let value = item;
    for (const [n, stage] of stages.entries()) {
      try { value = await stage(n === 0 ? item : value, item, i); } catch { return null; }
    }
    return value;
  }));
  const body = new Function("agent", "parallel", "pipeline", "log", "phase", "args",
    `return (async () => {\n${source}\n})()`);
  const result = await body(agent, parallel, pipeline, () => {}, () => {}, args);
  return { result, calls };
}

const finding = (severity, file) => ({
  severity, title: `${severity} in ${file}`, file, evidence: "e", failure_scenario: "f", fix: "x", owner_call: false,
});

const reviewArgs = { worktree: "/w", reviewed: "abc", base: "def", since: "2026-09-22",
  focus: { legal: ["026 added a mail vendor"] } };

test("every lane is reviewed once, with its persona and its focus", async () => {
  const { calls } = await run("sweep-review.js", reviewArgs, () => ({ checked: [{ item: "i", evidence: "e" }], findings: [] }));
  const reviews = calls.filter(c => c.phase === "Review");
  assert.equal(reviews.length, 9);
  assert.equal(reviews.find(c => c.label === "review:security").agentType, "security-reviewer");
  assert.equal(reviews.find(c => c.label === "review:legal").agentType, undefined);
  assert.match(reviews.find(c => c.label === "review:legal").prompt, /026 added a mail vendor/);
  assert.match(reviews.find(c => c.label === "review:code-mobile").prompt, /Your area is apps\/mobile/);
});

test("low findings skip verification, medium gets one skeptic, high gets two", async () => {
  const { result, calls } = await run("sweep-review.js", reviewArgs, (prompt, opts) => {
    if (opts.phase === "Verify") return { refuted: false, reason: "real", severity: "high" };
    if (opts.label === "review:seams-data") {
      return { checked: [{ item: "i", evidence: "e" }],
        findings: [finding("low", "a.ts"), finding("medium", "b.ts"), finding("high", "c.ts")] };
    }
    return { checked: [{ item: "i", evidence: "e" }], findings: [] };
  });
  assert.equal(calls.filter(c => c.phase === "Verify").length, 3);
  const lane = result.lanes.find(l => l.lane === "seams-data");
  assert.deepEqual(lane.findings.map(f => f.verdict), ["PLAUSIBLE", "CONFIRMED", "CONFIRMED"]);
});

test("a finding every skeptic refutes is marked refuted, not dropped", async () => {
  const { result } = await run("sweep-review.js", reviewArgs, (prompt, opts) => {
    if (opts.phase === "Verify") return { refuted: true, reason: "handled by the predicate", severity: "low" };
    if (opts.label === "review:security") return { checked: [{ item: "i", evidence: "e" }], findings: [finding("critical", "d.ts")] };
    return { checked: [{ item: "i", evidence: "e" }], findings: [] };
  });
  const f = result.lanes.find(l => l.lane === "security").findings[0];
  assert.equal(f.verdict, "REFUTED");
  assert.match(f.notes, /predicate/);
});

test("a lane that returns nothing twice is named as missing", async () => {
  const { result, calls } = await run("sweep-review.js", reviewArgs,
    (prompt, opts) => (opts.label?.startsWith("review:product") ? null : { checked: [{ item: "i", evidence: "e" }], findings: [] }));
  assert.deepEqual(result.missing, ["product"]);
  assert.equal(calls.filter(c => c.label?.startsWith("review:product")).length, 2);
});

// The first sweep's second run took a code-web lane with no checklist and no
// findings as a clean lane. Nothing checked is not nothing found.
test("a lane that returns an empty checklist is retried, and named missing if it stays empty", async () => {
  const { result, calls } = await run("sweep-review.js", reviewArgs,
    (prompt, opts) => (opts.label?.startsWith("review:code-web") ? { checked: [], findings: [] } : { checked: [{ item: "i", evidence: "e" }], findings: [] }));
  assert.equal(calls.filter(c => c.label?.startsWith("review:code-web")).length, 2);
  assert.deepEqual(result.missing, ["code-web"]);
});

// The first sweep lost its code-agent lane to a reviewer whose structured output
// never parsed; one retry with a shorter-output instruction is what recovered it.
test("a lane whose reviewer returns nothing is retried once, asking for shorter output", async () => {
  let product = 0;
  const { result, calls } = await run("sweep-review.js", reviewArgs, (prompt, opts) => {
    if (opts.label?.startsWith("review:product")) {
      product += 1;
      return product === 1 ? null : { checked: [{ item: "i", evidence: "e" }], findings: [] };
    }
    return { checked: [{ item: "i", evidence: "e" }], findings: [] };
  });
  assert.deepEqual(result.missing, []);
  const retry = calls.filter(c => c.label?.startsWith("review:product"))[1];
  assert.match(retry.prompt, /short/i);
  assert.equal(result.lanes.find(l => l.lane === "product").checked.length, 1);
});

const pkg = (id, extra = {}) => ({ id, title: `t${id}`, area: "apps/web", files: [`apps/web/${id}.ts`],
  envFile: `/s/env-${id}.sh`, findings: [finding("medium", `apps/web/${id}.ts`)], ...extra });

test("each package is implemented, reviewed by the right persona, and answered only when the review found something", async () => {
  const { result, calls } = await run("sweep-fix.js",
    { worktree: "/w", packages: [pkg("p1"), pkg("p2", { security: true })] },
    (prompt, opts) => {
      if (opts.phase === "Review") {
        return { findings: opts.label === "review:p2" ? [{ severity: "high", file: "f", issue: "i", fix: "x" }] : [] };
      }
      return { findings: [{ title: "t", status: "fixed" }], created: [], outside: [] };
    });
  assert.equal(calls.find(c => c.label === "review:p1").agentType, "code-reviewer");
  assert.equal(calls.find(c => c.label === "review:p2").agentType, "security-reviewer");
  assert.deepEqual(calls.filter(c => c.phase === "Answer").map(c => c.label), ["answer:p2"]);
  // A worktree-isolated session refuses `source` of a file outside the tree,
  // which every fix agent of the first sweep had to work around.
  assert.match(calls.find(c => c.label === "fix:p1").prompt, /--env-file=\/s\/env-p1\.sh/);
  assert.doesNotMatch(calls.find(c => c.label === "fix:p1").prompt, /`source /);
  assert.match(calls.find(c => c.label === "fix:p1").prompt, /Commit nothing/);
  assert.equal(result.packages.length, 2);
});

test("a package whose implementer returns nothing is reported, not reviewed", async () => {
  const { result, calls } = await run("sweep-fix.js", { worktree: "/w", packages: [pkg("p1")] },
    (prompt, opts) => (opts.phase === "Implement" ? null : { findings: [] }));
  assert.equal(calls.filter(c => c.phase === "Review").length, 0);
  assert.deepEqual(result.packages, [{ id: "p1", missing: true }]);
});
