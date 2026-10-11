#!/usr/bin/env node
// Builds the cost report: reads the constants that move cost out of the code,
// the latest eval run, and optionally the production ledger, runs model.mjs
// over them, and writes one self-contained HTML page.
//
//   node .claude/skills/cost-report/build.mjs [--out <path>] [--root <checkout>] [--ledger]
//
// --ledger reads aggregate token counts from llm_usage through the URL in
// LEDGER_DATABASE_URL. Aggregates only: no row, no account, no content.

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as model from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
// --root reads another checkout's code, so a branch can be costed before it merges.
const ROOT = args.includes("--root") ? resolve(args[args.indexOf("--root") + 1]) : resolve(HERE, "../../..");
const OUT = args.includes("--out") ? resolve(args[args.indexOf("--out") + 1]) : join(HERE, "cost-report.html");
const WITH_LEDGER = args.includes("--ledger");

const read = (p) => readFileSync(join(ROOT, p), "utf8");
const prices = JSON.parse(readFileSync(join(HERE, "prices.json"), "utf8"));
const assumptions = JSON.parse(readFileSync(join(HERE, "assumptions.json"), "utf8"));
const problems = [];

// A constant read from code. A pattern that no longer matches fails the build,
// because a report quietly built on a stale number is worse than no report.
function grab(file, re, name, map = Number) {
  const m = read(file).match(re);
  if (!m) {
    problems.push(`${name}: pattern no longer matches ${file}`);
    return null;
  }
  const line = read(file).slice(0, m.index).split("\n").length;
  return { value: map(m[1].replace(/_/g, "")), ref: `${file}:${line}` };
}
const num = (s) => Function(`return (${s.replace(/_/g, "")})`)();

const AGENT = "apps/agent/src/offload_agent";
const c = {
  file: grab(`${AGENT}/config.py`, /^\s*model: str = "([^"]+)"/m, "filing model", String),
  sort: grab(`${AGENT}/config.py`, /^\s*sort_model: str = "([^"]+)"/m, "sort model", String),
  answer: grab(`${AGENT}/config.py`, /^\s*answer_model: str = "([^"]+)"/m, "answer model", String),
  nightly: grab(`${AGENT}/config.py`, /^\s*nightly_model: str = "([^"]+)"/m, "nightly model", String),
  look: grab(`${AGENT}/config.py`, /^\s*look_model: str = "([^"]+)"/m, "look model", String),
  memory: grab(`${AGENT}/config.py`, /^\s*memory_model: str = "([^"]+)"/m, "memory model", String),
  maxPrompt: grab(`${AGENT}/config.py`, /max_prompt_tokens: int = ([\d_]+)/, "prompt budget"),
  running: grab(`${AGENT}/config.py`, /per_account_running: int = (\d+)/, "jobs per account"),
  voiceRate: grab(`${AGENT}/config.py`, /assemblyai_micros_per_second: float = ([\d.]+)/, "ledger voice rate"),
  maxCalls: grab(`${AGENT}/harness/plan.py`, /^MAX_MODEL_CALLS = (\d+)/m, "model calls per turn"),
  maxOut: grab(`${AGENT}/harness/plan.py`, /^MAX_OUTPUT_TOKENS = (\d+)/m, "output tokens per call"),
  maxTools: grab(`${AGENT}/harness/plan.py`, /^MAX_TOOL_CALLS = (\d+)/m, "tool calls per turn"),
  fileEffort: grab(`${AGENT}/harness/plan.py`, /^FILE_EFFORT = "(\w+)"/m, "filing effort", String),
  answerEffort: grab(`${AGENT}/harness/plan.py`, /^ANSWER_EFFORT = "(\w+)"/m, "answering effort", String),
  searches: grab(`${AGENT}/worker.py`, /SEARCHES = (\d+)/, "searches per turn"),
  reads: grab(`${AGENT}/worker.py`, /READS = (\d+)/, "reads per turn"),
  budget: grab("apps/core-api/src/budget.ts", /DAILY_MODEL_BUDGET_MICROS = ([\d_]+)/, "daily model budget"),
  photosPerDump: grab("apps/core-api/src/blobs/photos.ts", /MAX_PHOTOS = (\d+)/, "photos per dump"),
  photosPerDay: grab("apps/core-api/src/blobs/photos.ts", /DAILY_PHOTOS = (\d+)/, "photos per day"),
  photoBytesPerDay: grab("apps/core-api/src/blobs/photos.ts", /DAILY_BYTES = ([\d *]+);/, "photo bytes per day", num),
  voicePerDay: grab("apps/core-api/src/blobs/audio.ts", /DAILY_VOICE_NOTES = (\d+)/, "voice notes per day"),
  voiceMsPerDay: grab("apps/core-api/src/blobs/audio.ts", /DAILY_VOICE_MS = ([\d *]+);/, "voice ms per day", num),
  voiceMaxMs: grab("apps/core-api/src/blobs/audio.ts", /MAX_DURATION_MS = ([\d_]+)/, "longest voice note"),
  mailHour: grab("apps/core-api/src/mail-in/caps.ts", /HOURLY_MAIL = (\d+)/, "emails per hour"),
  mailDay: grab("apps/core-api/src/mail-in/caps.ts", /DAILY_MAIL = (\d+)/, "emails per day"),
  // 041. A PDF counts toward the day's photos; the model reads its first pages.
  pdfsPerDump: grab("apps/core-api/src/blobs/photos.ts", /MAX_PDFS = (\d+)/, "PDFs per dump"),
  pdfPages: grab(`${AGENT}/pdfs.py`, /^CUT_PAGES = (\d+)/m, "PDF pages the model reads"),
  nightlyThreads: grab("apps/core-api/src/jobs/handlers.ts", /NIGHTLY_THREADS = (\d+)/, "nightly passes per member"),
};
// Optional constants: present once the code has them, absent before.
const maybe = (file, re, name, map = Number) => (existsSync(join(ROOT, file)) && re.test(read(file)) ? grab(file, re, name, map) : null);
c.dailyTurns = maybe("apps/core-api/src/budget.ts", /DAILY_TURNS = ([\d_]+)/, "turns per day");
c.speechModel = maybe(`${AGENT}/transcribe.py`, /SPEECH_MODELS = \["([^"]+)"/, "speech model", String);

const promptDir = `${AGENT}/prompts`;
const promptChars = Object.fromEntries(
  readdirSync(join(ROOT, promptDir)).filter((f) => f.endsWith(".md")).map((f) => [f.replace(/\.md$/, ""), read(`${promptDir}/${f}`).length]),
);
// The nightly prompt is three variants of one file; most passes send the
// learning one, which is the file without its propose blocks or any marker
// (nightly.py, _variant).
if (promptChars.nightly != null) {
  const learn = read(`${promptDir}/nightly.md`)
    .replace(/<!-- propose -->[\s\S]*?<!-- \/propose -->\n?/g, "")
    .replace(/<!-- \/?learn -->\n?/g, "")
    .replace(/\n{3,}/g, "\n\n");
  if (learn.includes("<!--")) problems.push("nightly prompt: a marker the build does not strip");
  promptChars.nightly = learn.length;
} else problems.push(`nightly prompt: ${promptDir}/nightly.md is missing`);

// Findings the code shows on every run. Each is a check, not a sentence: if the
// code changes, the finding goes away or comes back on its own.
const worker = read(`${AGENT}/worker.py`);
const transcribe = read(`${AGENT}/transcribe.py`);
const harness = readdirSync(join(ROOT, `${AGENT}/harness`)).filter((f) => f.endsWith(".py")).map((f) => read(`${AGENT}/harness/${f}`)).join("\n");
const srcHasLangfuse = (() => {
  try { return execSync(`grep -rli langfuse apps/*/src || true`, { cwd: ROOT }).toString().trim().length > 0; } catch { return false; }
})();
const findings = [];
const budgetWorks = !/"costMicros": 0,/.test(worker) && existsSync(join(ROOT, "apps/core-api/src/pricing.ts"));
if (!budgetWorks) findings.push({ severity: "critical", title: "The daily model budget never trips",
  body: "Every model turn is written to the ledger at a cost of zero, so the $5 a day budget only ever counts voice, which tops out near $0.21 a day. Nothing stops an account sending dumps or questions all day. Turn on Budget enforced above to see what the cap would hold a bad actor to.",
  ref: `${AGENT}/worker.py, _usage_wire; apps/core-api/src/budget.ts` });
if (!c.dailyTurns) findings.push({ severity: "critical", title: "No limit on how many dumps an account can send",
  body: "Photos, voice and email have daily caps. Typed dumps and questions have none beyond two jobs running at a time per account. Checked by hand on 2026-10-02; re-check when core-api gains a rate limit.",
  ref: "apps/core-api/src/routes/dumps.ts, threads.ts" });
if (!/speech_models?/.test(transcribe)) findings.push({ severity: "warning", title: "Voice is priced at an old rate",
  body: `No speech model is sent, so AssemblyAI's default runs, which is Universal-3.5 Pro at $${prices.assemblyai.universal35ProPerHour.toFixed(2)} an hour. The ledger prices it at $${((c.voiceRate?.value ?? 0) * 3600 / 1e6).toFixed(2)} an hour.`,
  ref: `${AGENT}/transcribe.py; ${c.voiceRate?.ref}` });
if (!existsSync(join(ROOT, `${AGENT}/ledger.py`))) findings.push({ severity: "warning", title: "Some model calls are never ledgered",
  body: "The classifier, the open-question judge, the mail image look, the reader's tokens and every embedding cost money and write no ledger row. Cache writes are not recorded either. A ledger total is a floor.",
  ref: "apps/agent/src/offload_agent/harness/plan.py, look.py, reader.py" });
if (!/output_config/.test(harness)) findings.push({ severity: "info", title: "No effort setting anywhere",
  body: "stack.md says adaptive thinking with an effort level; the code sends no effort, so filing and answering think at each model's default inside the output budget. Effort is the first cost lever after caching.",
  ref: "docs/tech/stack.md; harness/plan.py" });
{
  // The small calls mark their prompt for the cache; one under its model's
  // minimum caches nothing and pays full input, with no error.
  const small = { classify: c.sort, judge: c.sort, reader: c.sort, look: c.look };
  const short = Object.entries(small).filter(([k, m]) => m && promptChars[k] != null && prices.anthropic.models[m.value]
    && model.promptTokens(promptChars[k], assumptions.turn) < prices.anthropic.models[m.value].minCacheTokens);
  if (short.length) findings.push({ severity: "info", title: "The small prompts are too short to cache",
    body: short.map(([k, m]) => `${k} on ${m.value} is under its ${prices.anthropic.models[m.value].minCacheTokens.toLocaleString("en-US")} token minimum`).join("; ")
      + ". cache_control does nothing there and every call pays full input, which is how the sheet prices them.",
    ref: short.map(([k]) => `${promptDir}/${k}.md`).join(", ") });
}
if (!srcHasLangfuse) findings.push({ severity: "info", title: "Langfuse is not wired", body: "stack.md names it for LLM observability; no service code calls it, so it costs nothing today and the report carries it at $0.", ref: "docs/tech/stack.md" });

// Calibration: the latest full eval run, and per-surface means from the newest
// per-case results on disk.
const history = read("apps/agent/evals/history.jsonl").trim().split("\n").map((l) => JSON.parse(l));
const lastFull = [...history].reverse().find((h) => h.scope === "all" && h.cost_usd);
let surfaces = null;
const resultsDir = join(ROOT, "apps/agent/evals/results");
if (existsSync(resultsDir)) {
  const all = readdirSync(resultsDir).filter((f) => f.endsWith("-all.json")).sort();
  if (all.length) {
    const r = JSON.parse(readFileSync(join(resultsDir, all.at(-1)), "utf8"));
    const by = {};
    for (const cs of r.cases) (by[cs.surface] ??= []).push(cs.cost_usd ?? 0);
    surfaces = { file: all.at(-1), when: r.when, models: r.models,
      means: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { n: v.length, mean: v.reduce((a, b) => a + b, 0) / v.length }])) };
  }
}

// The production ledger, aggregated, when asked for.
let ledger = null;
if (WITH_LEDGER) {
  const url = process.env.LEDGER_DATABASE_URL;
  if (!url) problems.push("--ledger needs LEDGER_DATABASE_URL in the environment");
  else {
    const require = createRequire(join(ROOT, "apps/core-api/package.json"));
    const pg = require("pg");
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    const usage = (await client.query(`
      select job_kind, model, count(*)::int as rows, count(distinct account_id)::int as accounts,
             sum(input_tokens)::bigint as input, sum(output_tokens)::bigint as output, sum(cache_read_tokens)::bigint as cache_read
        from llm_usage where created_at > now() - interval '30 days' group by 1, 2 order by 1, 2`)).rows;
    const dumps = (await client.query(`
      select count(*)::int as dumps, count(distinct account_id)::int as accounts
        from messages where role = 'person' and created_at > now() - interval '30 days'`)).rows[0];
    const searches = (await client.query(`select count(*)::int as n from lookups where created_at > now() - interval '30 days' and kind = 'search'`).catch(() => ({ rows: [{ n: null }] }))).rows[0];
    await client.end();
    ledger = { days: 30, usage, dumps, searches };
  }
}

const git = (cmd) => { try { return execSync(`git ${cmd}`, { cwd: ROOT }).toString().trim(); } catch { return "unknown"; } };
const today = new Date().toISOString().slice(0, 10);
const stale = [];
for (const [k, v] of Object.entries(prices)) {
  if (!v?.checked) continue;
  const age = (Date.parse(today) - Date.parse(v.checked)) / 864e5;
  if (age > 45) stale.push(`${k}, checked ${v.checked}`);
}

const code = {
  models: { file: c.file?.value, sort: c.sort?.value, answer: c.answer?.value, nightly: c.nightly?.value, look: c.look?.value, memory: c.memory?.value },
  pdfsPerDump: c.pdfsPerDump?.value ?? null,
  pdfPages: c.pdfPages?.value ?? null,
  nightlyThreads: c.nightlyThreads?.value ?? null,
  promptChars,
  budgetMicros: c.budget?.value,
  dailyTurns: c.dailyTurns?.value ?? null,
  // Each call marks its last block for the cache (harness/plan.py, 2026-10-02).
  cachesConversation: /def _cache_so_far/.test(harness),
  budgetWorks,
  constants: Object.fromEntries(Object.entries(c).filter(([, v]) => v).map(([k, v]) => [k, v])),
};

if (problems.length) {
  console.error("The cost report did not build:\n- " + problems.join("\n- "));
  process.exit(1);
}

// The voice price follows the model the code asks for.
if (c.speechModel?.value === "universal-2") prices.assemblyai.used = "universal2PerHour";
assumptions.options.budgetEnforced = budgetWorks;
const input = { prices, code, assumptions, options: { ...assumptions.options, whatsappMarket: "mix" } };
{
  const f = model.fleet(input, 1000, "mau");
  if (!f.parts.googleMaps || !(f.parts.googleMaps.loads > 0)) throw new Error("the fleet has no Google Maps part");
  // 038 and 041. Every model call the worker makes has a unit here, and the
  // fleet pays for each: a memory pass a night, a PDF in a filing turn.
  for (const k of ["memory", "filePdfPerPage", "look", "pdfLook"]) if (!(f.units[k] > 0)) throw new Error(`no unit cost for ${k}`);
  const normal = f.profiles.find((p) => p.fk === "heavy" && p.bk === "normal").row.counts;
  if (!(normal.memoryPasses > 0) || !(normal.pdfs > 0)) throw new Error("a heavy normal month has no memory passes or no PDFs");
}
// 030. Google Maps bills by tier past a free monthly cap; check the tier
// arithmetic against the price list before trusting a fleet figure.
{
  const g = prices.googleMaps;
  const check = (got, want, what) => { if (Math.abs(got - want) > 0.005) throw new Error(`Google Maps ${what}: ${got}, want ${want}`); };
  check(model.tiered(g.dynamicMaps, 9_000), 0, "loads under the free cap");
  check(model.tiered(g.dynamicMaps, 20_000), 70, "10,000 loads past the cap at $7");
  check(model.tiered(g.placeDetails, 150_000), 90 * 5 + 50 * 4, "details across two tiers");
}

// Check the model runs, and print what a reader would look for first.
for (const level of assumptions.fleet.levels) {
  const f = model.fleet(input, level, assumptions.fleet.basis);
  console.log(`${String(level).padStart(7)} ${assumptions.fleet.basis.toUpperCase()}  ${Math.round(f.pop.mau).toString().padStart(7)} MAU  $${Math.round(f.total).toLocaleString("en-US").padStart(9)}/mo  $${f.perMau.toFixed(2)} per person  (Google Maps $${Math.round(f.parts.googleMaps.cost).toLocaleString("en-US")})`);
}

const data = {
  built: today, commit: git("rev-parse --short HEAD"), branch: git("rev-parse --abbrev-ref HEAD"),
  prices, assumptions, code, findings, stale,
  calibration: { lastFull, surfaces, decisions: { file: [0.025, 0.055], opus: [0.04, 0.09], ref: "docs/tech/decisions.md, 2026-09-17" } },
  ledger,
};

const modelSource = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const template = readFileSync(join(HERE, "template.html"), "utf8");
const html = template
  .replace("/*__DATA__*/", () => `const DATA = ${JSON.stringify(data).replace(/</g, "\\u003c")};`)
  .replace("/*__MODEL__*/", () => modelSource);
if (html.includes("__DATA__") || html.includes("__MODEL__")) throw new Error("a placeholder was left in the template");
writeFileSync(OUT, html);
console.log(`\nWrote ${OUT}${stale.length ? `\nStale prices: ${stale.join("; ")}` : ""}`);
