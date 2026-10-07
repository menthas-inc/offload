// The specs say what shipped. Each block is one finding of the 2026-10-07
// sweep: a spec that disagreed with the code or with a later spec. Where the
// claim is about the code, the code is read too, so the spec cannot drift
// back without this going red.
//
//   node --test docs/specs/specs-as-built.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const specs = dirname(fileURLToPath(import.meta.url));
const root = join(specs, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const spec = (path) => read(join("docs/specs", path));
/** The text with every ~~struck~~ span taken out. */
const unstruck = (text) => text.replace(/~~[^~]*~~/g, "");
const lineStarting = (text, start) => text.split("\n").find((l) => l.startsWith(start)) ?? "";

test("S29: 025 says the nightly label sort was deleted by 032, not switched off", () => {
  assert.ok(!existsSync(join(root, "apps/agent/src/offload_agent/label_sort.py")), "the sort's worker is gone");
  for (const file of ["025-labels/feature-spec.md", "025-labels/impl-spec.md", "025-labels/tasks.md"]) {
    const text = spec(file);
    assert.doesNotMatch(text, /\*\*Off for now/, `${file} still has the Off for now paragraph`);
    assert.doesNotMatch(text, /NIGHTLY_LABEL_SORT[^.]*\bis false/, `${file} still says the switch is false`);
    assert.match(text, /shipped 2026-09-27, switched off the same day, deleted by 032 on 2026-10-02/, `${file} has no as-built line`);
  }
});

test("S30: 038's body carries 040's five kinds and its reach", () => {
  const text = spec("038-memories/feature-spec.md");
  assert.doesNotMatch(text, /^\| \*\*Their words\*\* \|/m, "the Their words row is still a class");
  assert.doesNotMatch(text, /asked and answered before learned, then newest first/, "section 4 still says newest first");
  const reach = lineStarting(text, "**At most fifty reach a prompt**");
  assert.match(reach, /every rule/);
  assert.match(reach, /Amended 2026-10-06 by 040/);
  const ac14 = lineStarting(text, "- **AC-14**");
  assert.match(ac14, /every rule/);
  assert.match(ac14, /Amended 2026-10-06 by 040/);
});

const boxes = (text) =>
  text
    .split("\n")
    .filter((l) => /^- \[[ x]\] /.test(l))
    .map((l) => ({ done: l.startsWith("- [x]"), id: (l.match(/^- \[[ x]\] \*\*([A-Z]?\d[\d.]*|[A-Z]\d+)\*\*/) ?? [])[1], line: l }));

test("S31: the merged features' boxes are ticked, and an open one says why", () => {
  const t040 = boxes(spec("040-the-memories-tab/tasks.md"));
  for (const id of ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "B1", "B2", "B4", "B5", "C1", "C2", "C3", "C4", "C5", "D1", "D2"]) {
    assert.ok(t040.find((b) => b.id === id)?.done, `040 ${id} is not ticked`);
  }
  const t030 = boxes(spec("030-maps/tasks.md"));
  for (const id of ["T0.4", "T0.5", "T2.1", "T2.2", "T2.3", "T2.4", "T2.5", "T5.4"]) {
    assert.ok(t030.find((b) => b.id === id)?.done, `030 ${id} is not ticked`);
  }
  const t038 = boxes(spec("038-memories/tasks.md"));
  assert.ok(t038.find((b) => b.id === "T21")?.done, "038 T21 is not ticked");
  for (const [name, list] of [["040", t040], ["030", t030], ["038", t038]]) {
    for (const box of list.filter((b) => !b.done)) {
      assert.match(box.line, /\*\*Open:\*\*/, `${name} ${box.id ?? box.line.slice(0, 40)} is open and does not say why`);
    }
  }
});

test("S32: 014 says memory came back for account scope", () => {
  const head = spec("014-notes/feature-spec.md").split("## Why")[0];
  assert.match(head, /Amended 2026-10-05 by 038 and 2026-10-06 by 040/);
  assert.match(head, /account/);
  assert.match(head, /Memories/);
});

test("S33: 026's AC-1 and limits name the path that shipped", () => {
  const route = read("apps/core-api/src/routes/mail-in.ts");
  assert.match(route, /MAX_MAIL_BYTES = 26 \* 1024 \* 1024/);
  assert.match(route, /app\.post\("\/v1\/mail\/resend"/);
  const text = spec("026-mail-in/feature-spec.md");
  const ac1 = lineStarting(text, "- **AC-1**");
  assert.doesNotMatch(ac1, /Cloudflare|Worker/);
  for (const word of ["Resend", "Svix", "DKIM", "/v1/mail/resend", "26MB"]) assert.ok(ac1.includes(word), `AC-1 does not name ${word}`);
  assert.doesNotMatch(text, /refused by Cloudflare before offload sees it/);
  assert.doesNotMatch(text, /Cloudflare's row gains Email Routing/);
});

test("S34: 034 says deletion from Settings shipped with 035", () => {
  const page = read("apps/web/src/app/(marketing)/privacy/page.tsx");
  assert.match(page, /In Settings you can export everything, delete your account/);
  const text = spec("034-admin/feature-spec.md");
  assert.doesNotMatch(text, /dated note\*\* that the controls are not built \*\*stays\*\*/);
  assert.match(text, /deletion from Settings shipped with 035/);
});

test("S35: 028 names what 032 folded its worker and endpoint into", () => {
  assert.ok(!existsSync(join(root, "apps/agent/src/offload_agent/loose_propose.py")));
  assert.ok(!existsSync(join(root, "apps/agent/src/offload_agent/compact.py")));
  assert.match(read("apps/agent/src/offload_agent/nightly.py"), /KINDS = \["thread\.nightly"\]/);
  assert.match(read("apps/core-api/src/routes/internal.ts"), /\/internal\/v1\/nightly-result/);
  for (const file of ["028-loose/impl-spec.md", "028-loose/tasks.md"]) {
    const text = spec(file);
    const asBuilt = text.split("\n").filter((l) => l.startsWith("*As built after 032"));
    assert.equal(asBuilt.length, 1, `${file} has no as-built line`);
    for (const name of ["nightly.py", "thread.nightly", "/internal/v1/nightly-result"]) assert.ok(asBuilt[0].includes(name), `${file}'s line misses ${name}`);
    const rest = unstruck(text.replace(asBuilt[0], ""));
    for (const gone of ["loose_propose.py", "compact.py", "/internal/v1/loose-proposals", "loose.propose", "notes.compact"]) {
      assert.ok(!rest.includes(gone), `${file} still names ${gone} unstruck`);
    }
  }
});

test("S36: the README's first list is a dated record in today's words", () => {
  const text = spec("README.md");
  const [before, after] = text.split("## Where this started, 2026-08");
  assert.ok(after, "no dated heading");
  // Not a diff against HEAD: once this is committed HEAD is this text, and the check would fail on every later run.
  const headings = before.split("\n").filter((l) => /^#{1,2} /.test(l));
  assert.deepEqual(headings, ["# Specs", "## Volume and access is a required section", "## Conventions"], "the conventions and tables moved");
  assert.ok(!text.includes("## Suggested first specs"), "the old heading is still there");
  assert.doesNotMatch(after, /\bthings?\b/);
  assert.doesNotMatch(after, /\bmemory\b/);
  assert.doesNotMatch(after, /open decision \d/);
  assert.match(after, /Encryption is scoped to cold storage only/);
  assert.match(after, /record/);
});

test("S37: 029 says on its face that it is not built", () => {
  assert.match(read("docs/tech/decisions.md"), /WhatsApp is specced and not built/);
  const text = spec("029-whatsapp/feature-spec.md");
  const status = lineStarting(text, "**Status:**");
  assert.match(status, /Not built \(owner, 2026-10-02\); see `docs\/tech\/decisions\.md`, \*WhatsApp is specced and not built\*/);
  assert.doesNotMatch(text, /names three companies/);
  assert.match(text, /the companies page names every recipient; Meta joins it/);
});
