// Builds "offload's model calls" from the repository and jobs.mjs.
//
//   node .claude/skills/model-calls/build.mjs [--out <path>] [--check]
//
// Reads every prompt as the worker assembles it (through prompt_files.load, the
// real loader), the models from config.py, and splits each prompt by the
// anchors in jobs.mjs. Fails, and says what, when an anchor no longer matches,
// a prompt file is mapped to no job, the segments do not cover a prompt, or
// any hand-written copy holds a dash. `--check` builds without writing.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { INTENTS, LANES, JOBS, LAYOUT, FINDINGS } from "./jobs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const args = process.argv.slice(2);
const out = args.includes("--out") ? resolve(args[args.indexOf("--out") + 1]) : join(here, "model-calls.html");
const checkOnly = args.includes("--check");
const AGENT = join(repo, "apps/agent/src");
const PROMPTS = join(AGENT, "offload_agent/prompts");

const problems = [];
const tok = (s) => Math.round(s.length / 4);
const words = (s) => (s.match(/\S+/g) || []).length;
const DASH = /[–—]/;

// The prompt as the worker assembles it, includes and all, through its own loader.
function assembled(name) {
  const py = [
    "import json, sys",
    `sys.path.insert(0, ${JSON.stringify(AGENT)})`,
    "from offload_agent.prompt_files import load",
    "print(json.dumps(load(sys.argv[1])))",
  ].join("\n");
  return JSON.parse(execFileSync("python3", ["-c", py, name]).toString());
}

// The models, from the worker's own config.
const config = readFileSync(join(AGENT, "offload_agent/config.py"), "utf8");
const models = Object.fromEntries([...config.matchAll(/^\s+(\w*model): str = "([^"]+)"/gm)].map((m) => [m[1], m[2]]));
const tierOf = (model) => (/haiku/.test(model) ? "haiku" : /sonnet/.test(model) ? "sonnet" : /opus|fable/.test(model) ? "opus" : "vendor");

const mapped = new Set();
let total = 0;
let prompts = 0;
for (const job of JOBS) {
  if (job.tier !== "vendor") {
    const id = models[job.model];
    if (!id) problems.push(`${job.id}: config.py has no ${job.model}`);
    job.modelId = id ?? job.model;
    job.tier = tierOf(job.modelId);
    job.model = job.modelId;
  }
  if (!job.source) continue;
  const name = job.source.file.split("/").pop().replace(/\.md$/, "");
  mapped.add(name);
  let text = assembled(name);
  if (job.source.calendar) {
    text = text.replace("<!-- with-calendar -->\n", "").replace("<!-- /with-calendar -->\n", "");
    job.variantNote = "Shown as an account with a calendar receives it";
  }
  if (job.source.markers) {
    text = text.replace(/^<!-- \/?(\w+) -->\n/gm, "");
    job.variantNote = "Both variants in one: the notes say which half each section belongs to";
  }
  let from = 0;
  const starts = job.segments.map((s) => {
    const at = text.indexOf(s.at, from);
    if (at < 0) problems.push(`${job.id}: no section starts "${s.at}" in ${name}.md any more`);
    from = at < 0 ? from : at + 1;
    return at;
  });
  if (starts.includes(-1)) continue;
  if (starts[0] !== 0) problems.push(`${job.id}: the first section does not start ${name}.md`);
  job.segs = job.segments.map((s, n) => {
    const body = text.slice(starts[n], n + 1 < starts.length ? starts[n + 1] : text.length).replace(/\s+$/, "");
    return { i: s.i, t: s.t, n: s.n, text: body, tokens: tok(body) };
  });
  job.tokens = tok(text);
  job.words = words(text);
  job.sourceRef = job.source.file.replace("apps/agent/src/offload_agent/", "");
  delete job.segments;
  total += job.tokens;
  prompts += 1;
}

// Every prompt the worker can send belongs to a job on this page.
for (const file of readdirSync(PROMPTS)) {
  if (file.endsWith(".md") && !mapped.has(file.replace(/\.md$/, ""))) {
    problems.push(`prompts/${file} is on no job in jobs.mjs: add it, with its cadence and sections`);
  }
}
const handWritten = JSON.stringify([JOBS.map(({ segs, ...rest }) => rest), FINDINGS, (JOBS.flatMap((j) => j.segs || [])).map((s) => [s.t, s.n])]);
if (DASH.test(handWritten)) problems.push("a dash in jobs.mjs copy");

if (problems.length) {
  console.error("model-calls: the page is out of date with the code:\n  " + problems.join("\n  "));
  process.exit(1);
}

const commit = execFileSync("git", ["-C", repo, "rev-parse", "--short", "HEAD"]).toString().trim();
const date = new Date().toISOString().slice(0, 10);
const data = { intents: INTENTS, lanes: LANES, jobs: JOBS, layout: LAYOUT, findings: FINDINGS, commit, date, prompts, totalTokens: total };
const html = readFileSync(join(here, "template.html"), "utf8").replace("/*DATA*/null", JSON.stringify(data).replace(/</g, "\\u003c"));
if (!checkOnly) writeFileSync(out, html);
console.log(`model-calls: ${prompts} prompts, ${total} tokens, ${FINDINGS.filter((f) => f.status === "open").length} open on the list, commit ${commit}${checkOnly ? " (checked)" : `, wrote ${out}`}`);
