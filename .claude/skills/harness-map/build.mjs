#!/usr/bin/env node
// Builds "One turn through offload", the page that shows the LLM harness as it
// is built: the sequence, the loop, the prompt as sent, the tools, the bounds,
// where a person can already be asked, and every prompt's full text with its
// sections colour coded by what they do.
//
// What is generated here, from the repo, every run:
//   - the prompt map (section bar) for plan_v2.md, proportional to word count
//   - every prompt's full text, colour coded
//   - the models and the bounds tables, from the constants in the code
//   - the date and the commit
// What is hand drawn in template.html and has to be re-read against the code:
//   - the ten-step sequence (fig 1), the loop (fig 2), the user-turn blocks
//     and the tools column (fig 3), the tools table, the write-that-waits
//     sequence (fig 4). SKILL.md says which file each of those comes from.
//
// Usage: node .claude/skills/harness-map/build.mjs [--out path]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const prompts = join(root, "apps/agent/src/offload_agent/prompts");
const outArg = process.argv.indexOf("--out");
const out = outArg > -1 ? resolve(process.argv[outArg + 1]) : join(root, "docs/tech/harness-map.html");

const read = (rel) => readFileSync(join(root, rel), "utf8");
const grab = (src, re, fallback = "?") => {
  const m = src.match(re);
  return m ? m[1] : fallback;
};

// ---------------------------------------------------------------- constants
const planPy = read("apps/agent/src/offload_agent/harness/plan.py");
const workerPy = read("apps/agent/src/offload_agent/worker.py");
const readerPy = read("apps/agent/src/offload_agent/reader.py");
const configPy = read("apps/agent/src/offload_agent/config.py");
const internalTs = read("apps/core-api/src/routes/internal.ts");
const composerTsx = read("apps/web/src/components/shell/Composer.tsx");

const num = (s) => Number(String(s).replace(/_/g, ""));
const C = {
  modelCalls: num(grab(planPy, /^MAX_MODEL_CALLS\s*=\s*([\d_]+)/m)),
  toolCalls: num(grab(planPy, /^MAX_TOOL_CALLS\s*=\s*([\d_]+)/m)),
  maxTokens: num(grab(planPy, /max_tokens=([\d_]+)/)),
  promptCeiling: num(grab(configPy, /max_prompt_tokens:\s*int\s*=\s*([\d_]+)/)),
  threads: num(grab(configPy, /max_threads:\s*int\s*=\s*([\d_]+)/)),
  turns: num(grab(configPy, /max_turns:\s*int\s*=\s*([\d_]+)/)),
  searches: num(grab(workerPy, /^\s+SEARCHES\s*=\s*(\d+)/m)),
  reads: num(grab(workerPy, /^\s+READS\s*=\s*(\d+)/m)),
  pauses: num(grab(readerPy, /^MAX_PAUSES\s*=\s*(\d+)/m)),
  sources: num(grab(workerPy, /^MAX_SOURCES\s*=\s*(\d+)/m)),
  stepChars: num(grab(internalTs, /text:\s*z\.string\(\)[^\n]*\.max\((\d+)\)/, "80")),
  sayAfterMs: num(grab(composerTsx, /SAY_AFTER_MS\s*=\s*([\d_]+)/)),
  stopAfterMs: num(grab(composerTsx, /STOP_AFTER_MS\s*=\s*([\d_]+)/)),
  undoMs: num(grab(composerTsx, /UNDO_WINDOW_MS\s*=\s*([\d_]+)/)),
  model: grab(configPy, /^\s+model:\s*str\s*=\s*"([^"]+)"/m),
  sortModel: grab(configPy, /sort_model:\s*str\s*=\s*"([^"]+)"/),
  answerModel: grab(configPy, /answer_model:\s*str\s*=\s*"([^"]+)"/),
};

const commit = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

// ---------------------------------------------------------------- categories
// What a passage of a prompt is for. One colour each; the legend on the page
// names them. A header prompt is categorised by its headers; a prompt with no
// headers is categorised paragraph by paragraph, by the words in it, and the
// page says so.
const CATEGORIES = {
  frame: { label: "frame: who you are, what is data", css: "frame" },
  work: { label: "the work: filing, reading, answering", css: "work" },
  web: { label: "reaching the web, and where it stops", css: "web" },
  reply: { label: "what to say, and mostly not to", css: "reply" },
  refusal: { label: "refusals", css: "refusal" },
};

const HEADER_MAP = [
  [/nothing to file|refuse|cannot break/i, "refusal"],
  [/look|web|search|url|link/i, "web"],
  [/reply|answer|how to answer|being brief|say/i, "reply"],
  [/reading|data|what you are given|today/i, "frame"],
  [/filing|notes|what something is|dates|tags|changing|calendar|row|thread|what it is|doing|rules|photos/i, "work"],
];

const PARAGRAPH_MAP = [
  [/not sure\.|can't search|refus|political|self-harm|sexual|do not look up/i, "refusal"],
  [/look_up|web|search|query|bound|country|site/i, "web"],
  [/reply|`say`|sentence|markup|\*\*bold|list is the|answer is the|escape|no\b.*don't know|yes or no|say a thing once|shape the reply/i, "reply"],
  [/is data|never obey|not instruction|do not obey|whatever it appears|record of what was said/i, "frame"],
  [/list_content|list_agenda|account_facts|read|rows|thread|file|filing|note|task|event|tool|compaction|fold|supersede|remove|add/i, "work"],
];

function categorise(header, text, mode) {
  const rules = mode === "headers" ? HEADER_MAP : PARAGRAPH_MAP;
  const probe = mode === "headers" ? header : text;
  for (const [re, cat] of rules) if (re.test(probe)) return cat;
  return "frame";
}

// ---------------------------------------------------------------- prompts
const PROMPTS = [
  { file: "plan_v2.md", name: "plan_v2.md", path: "filing", model: C.model, mode: "headers", where: "the filing turn's system prompt" },
  { file: "answer.md", name: "answer.md", path: "answering", model: C.answerModel, mode: "paragraphs", where: "the answering turn's system prompt" },
  { file: "classify.md", name: "classify.md", path: "before the fork", model: C.sortModel, mode: "paragraphs", where: "the classifier, one forced tool call" },
  { file: "reader.md", name: "reader.md", path: "inside look_up", model: C.sortModel, mode: "headers", where: "the reader, with web_search and web_fetch" },
  { file: "quick_add.md", name: "quick_add.md", path: "thread.quick_add", model: C.model, mode: "headers", where: "a row typed straight into a thread" },
  { file: "compact.md", name: "compact.md", path: "notes.compact", model: C.sortModel, mode: "headers", where: "once a day, a thread's notes" },
];

const words = (s) => (s.trim().match(/\S+/g) || []).length;

function sectionsOf(md, mode) {
  const lines = md.split("\n");
  const sections = [];
  let current = { header: "", body: [] };
  for (const line of lines) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) {
      sections.push(current);
      current = { header: h[1].trim(), body: [] };
    } else current.body.push(line);
  }
  sections.push(current);
  const named = sections
    .map((s) => ({ header: s.header, text: s.body.join("\n").trim() }))
    .filter((s) => s.text.length > 0 || s.header);
  if (mode === "headers") {
    return named.map((s) => ({ ...s, category: s.header ? categorise(s.header, s.text, "headers") : "frame", words: words(s.text) }));
  }
  // paragraph mode: every blank-line separated block is its own passage
  const passages = [];
  for (const s of named) {
    for (const para of s.text.split(/\n\s*\n/)) {
      if (!para.trim()) continue;
      passages.push({ header: "", text: para.trim(), category: categorise("", para, "paragraphs"), words: words(para) });
    }
  }
  return passages;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Enough markdown to read a prompt as its author sees it. Nothing more.
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
}
function renderBody(text) {
  const blocks = text.split(/\n\s*\n/);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => /^\s*(-|\d+\.)\s+/.test(l) || /^\s{2,}/.test(l))) {
        const items = [];
        for (const l of lines) {
          const m = l.match(/^\s*(?:-|\d+\.)\s+(.*)$/);
          if (m) items.push(m[1]);
          else if (items.length) items[items.length - 1] += " " + l.trim();
        }
        const ordered = /^\s*\d+\./.test(lines[0]);
        return `<${ordered ? "ol" : "ul"}>${items.map((i) => `<li>${inline(i)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`;
      }
      if (/^`[^`]+`$/.test(block.trim())) return `<p class="line">${inline(block.trim())}</p>`;
      return `<p>${inline(block.replace(/\n/g, " "))}</p>`;
    })
    .join("");
}

function renderPrompt(p) {
  const md = readFileSync(join(prompts, p.file), "utf8");
  const sections = sectionsOf(md, p.mode);
  const total = words(md);
  const passages = sections
    .map((s) => {
      const cat = CATEGORIES[s.category];
      const head = s.header ? `<h4>${esc(s.header)} <span class="pcount">${s.words}</span></h4>` : "";
      return `<div class="passage ${cat.css}" data-category="${cat.css}">${head}${renderBody(s.text)}</div>`;
    })
    .join("");
  const byCat = {};
  for (const s of sections) byCat[s.category] = (byCat[s.category] || 0) + s.words;
  const mix = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<span class="pill ${CATEGORIES[k].css}">${CATEGORIES[k].label.split(":")[0]} ${Math.round((100 * v) / total)}%</span>`)
    .join(" ");
  return `
    <article class="prompt" id="prompt-${p.file.replace(/\W/g, "-")}">
      <header>
        <div>
          <h3>${esc(p.name)} <span class="pill">${esc(p.model)}</span></h3>
          <p class="where">${esc(p.where)} · ${total.toLocaleString("en-GB")} words · ${p.mode === "headers" ? "coloured by section" : "coloured by passage, by the words in it"}</p>
        </div>
        <div class="mix">${mix}</div>
      </header>
      <div class="passages">${passages}</div>
    </article>`;
}

// ---------------------------------------------------------------- the plan bar
function planBar() {
  const md = readFileSync(join(prompts, "plan_v2.md"), "utf8");
  const sections = sectionsOf(md, "headers");
  const total = sections.reduce((n, s) => n + s.words, 0);
  const x0 = 30, width = 940, y = 66, h = 34;
  let x = x0;
  const rects = [];
  const labels = [];
  const ticks = [];
  const fillFor = { frame: "var(--strong)", work: "var(--moss)", web: "var(--amber)", reply: "var(--blue)", refusal: "var(--clay)" };
  let above = true;
  let lastAboveEnd = -Infinity, lastBelowEnd = -Infinity;
  sections.forEach((s, i) => {
    const w = (s.words / total) * width;
    const alt = i % 2 === 0 ? 0.85 : 1;
    rects.push(`<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${h}" fill="${fillFor[s.category]}" opacity="${alt}"/>`);
    const cx = x + w / 2;
    const label = `${(s.header || "intro").toLowerCase()} · ${s.words}`;
    const est = label.length * 5.6;
    // Alternate sides; when a side is still occupied, push the label out on a tick.
    const side = above ? "above" : "below";
    let ly = side === "above" ? y - 10 : y + h + 16;
    const end = side === "above" ? lastAboveEnd : lastBelowEnd;
    let cxUsed = cx;
    if (cx - est / 2 < end + 6) {
      cxUsed = end + 6 + est / 2;
      ly = side === "above" ? y - 22 : y + h + 30;
      ticks.push(`<line x1="${cx.toFixed(1)}" y1="${side === "above" ? y : y + h}" x2="${cxUsed.toFixed(1)}" y2="${side === "above" ? ly + 3 : ly - 10}" stroke="var(--tertiary)" stroke-width="1"/>`);
    }
    labels.push(`<text x="${cxUsed.toFixed(1)}" y="${ly}" font-size="11" text-anchor="middle" fill="currentColor">${esc(label)}</text>`);
    if (side === "above") lastAboveEnd = cxUsed + est / 2; else lastBelowEnd = cxUsed + est / 2;
    above = !above;
    x += w;
  });
  return { svg: `<g stroke="var(--raised)" stroke-width="1">${rects.join("")}</g><g>${ticks.join("")}</g>${labels.join("")}`, total };
}

// ---------------------------------------------------------------- tables
const modelRows = [
  ["classify", C.sortModel, "One boolean, paid on every dump. Forced tool, 64 output tokens."],
  ["filing (plan_v2)", C.model, "The planner. Tools are the architecture every capability arrives on."],
  ["answering (answer.md)", C.answerModel, "Cross-thread reading. Its first round trip is the long wait."],
  ["reader", C.sortModel, "Extract fields from a page. Server-side web_search and web_fetch."],
  ["quick add", C.model, "Same loop, two tools, the row and its thread."],
  ["notes.compact", C.sortModel, "Folds a thread's notes when they pass the budget."],
  ["embeddings", "voyage-4, halfvec(1024)", "The search tool's vector half; text search alongside."],
]
  .map(([a, b, c]) => `<tr><td>${a}</td><td class="tool">${esc(b)}</td><td>${c}</td></tr>`)
  .join("\n");

const boundRows = [
  ["Model calls per turn", C.modelCalls, "harness MAX_MODEL_CALLS"],
  ["Filing tool calls per turn", C.toolCalls, "harness MAX_TOOL_CALLS"],
  ["Output tokens per call", C.maxTokens.toLocaleString("en-GB"), "harness"],
  ["Prompt ceiling", `${C.promptCeiling.toLocaleString("en-GB")} tokens`, "config; turns dropped first, then threads"],
  ["Threads in the prompt", C.threads, "config"],
  ["Earlier turns in the prompt", C.turns, "config; filing path only"],
  ["Web searches, reads per turn", `${C.searches}, ${C.reads}`, "worker Lookups; shared across every look_up"],
  ["Reader pauses per lookup", C.pauses, "reader"],
  ["Sources kept per turn", C.sources, "worker and API schema"],
  ["Step line", `${C.stepChars} chars`, "API check constraint"],
  ["Step shown from", `${C.sayAfterMs / 1000}s`, "client, from the press"],
  ["Stop offered from", `${C.stopAfterMs / 1000}s`, "client, from the press"],
  ["Undo window", `${C.undoMs / 1000}s`, "client toast"],
]
  .map(([a, b, c]) => `<tr><td>${a}</td><td class="n">${b}</td><td class="where">${c}</td></tr>`)
  .join("\n");

// ---------------------------------------------------------------- assemble
let html = readFileSync(join(here, "template.html"), "utf8");
const bar = planBar();
const promptWords = Object.fromEntries(PROMPTS.map((p) => [p.file, words(readFileSync(join(prompts, p.file), "utf8"))]));

const legend = Object.values(CATEGORIES)
  .map((c) => `<span class="key ${c.css}"><i></i>${c.label}</span>`)
  .join("");

const fill = {
  DATE: today,
  COMMIT: commit,
  PLAN_BAR: bar.svg,
  PLAN_WORDS: bar.total.toLocaleString("en-GB"),
  ANSWER_WORDS: promptWords["answer.md"].toLocaleString("en-GB"),
  QUICK_WORDS: promptWords["quick_add.md"].toLocaleString("en-GB"),
  READER_WORDS: promptWords["reader.md"].toLocaleString("en-GB"),
  MODEL: C.model,
  SORT_MODEL: C.sortModel,
  ANSWER_MODEL: C.answerModel,
  MODEL_ROWS: modelRows,
  BOUND_ROWS: boundRows,
  MODEL_CALLS: String(C.modelCalls),
  TOOL_CALLS: String(C.toolCalls),
  THREADS: String(C.threads),
  TURNS: String(C.turns),
  CEILING: `${C.promptCeiling / 1000}k`,
  SEARCHES: String(C.searches),
  READS: String(C.reads),
  STEP_CHARS: String(C.stepChars),
  SAY_AFTER: `${C.sayAfterMs / 1000}s`,
  MAX_TOKENS: C.maxTokens.toLocaleString("en-GB"),
  PROMPT_LEGEND: legend,
  PROMPTS_FULL: PROMPTS.map(renderPrompt).join("\n"),
};
for (const [k, v] of Object.entries(fill)) html = html.split(`{{${k}}}`).join(v);
const left = html.match(/\{\{[A-Z_]+\}\}/g);
if (left) throw new Error(`unfilled placeholders: ${[...new Set(left)].join(", ")}`);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB) at ${commit}`);
