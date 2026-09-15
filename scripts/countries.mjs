#!/usr/bin/env node
// Writes the agent's country name table from ICU.
//
// The Core API builds its picker from the same data at boot; this is the copy
// the Python side needs, generated rather than maintained so the two cannot
// drift into disagreeing about what PT is called.
//
//   node scripts/countries.mjs

import { writeFileSync } from "node:fs";

const names = new Intl.DisplayNames(["en"], { type: "region" });
const skip = new Set(["EU", "EZ", "UN", "QO", "XA", "XB", "ZZ"]);
const rows = [];

for (let a = 65; a <= 90; a += 1) {
  for (let b = 65; b <= 90; b += 1) {
    const code = String.fromCharCode(a) + String.fromCharCode(b);
    const name = names.of(code);
    if (name && name !== code && !skip.has(code)) rows.push([code, name]);
  }
}
rows.sort((x, y) => x[0].localeCompare(y[0]));

const body = rows.map(([c, n]) => `    ${JSON.stringify(c)}: ${JSON.stringify(n)},`).join("\n");

const header = [
  '"""Country codes and their names, for the one word a query may add.',
  "",
  "**Generated, not maintained.** Written by `scripts/countries.mjs` from the same",
  "ICU data `apps/core-api/src/countries.ts` builds its picker from, so the two",
  "cannot drift into disagreeing about what `PT` is called.",
  "",
  "The agent needs the name rather than the code for two reasons: the prompt reads",
  'better as "They are in Portugal" than "They are in PT", and the provenance bound',
  "has to recognise the word the model actually writes into a query, which is the",
  'name. A query saying "Portugal" against a bound that only knew "PT" was refused,',
  "which is the whole reason this file exists.",
  '"""',
  "",
  "NAMES: dict[str, str] = {",
].join("\n");

const footer = [
  "}",
  "",
  "",
  "def name_of(code: str | None) -> str | None:",
  '    """The country\'s name, or None for a code nobody recognises.',
  "",
  "    None rather than the code itself: an unknown code in a prompt reads as a",
  "    place, and the honest thing is to say nobody knows where they are.",
  '    """',
  "    if not code:",
  "        return None",
  "    return NAMES.get(code.upper())",
  "",
].join("\n");

writeFileSync("apps/agent/src/offload_agent/countries.py", `${header}\n${body}\n${footer}`);
console.log(`${rows.length} countries written`);
