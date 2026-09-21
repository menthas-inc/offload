#!/usr/bin/env node
// An icon name that does not exist renders nothing, and every gate is happy.
//
// `Icon` on web takes `name: string` and builds a URL from it, so a typo is a
// 404 for a mask image and an element with no glyph in it. `Glyph` on the phones
// is typed against `IconName`, so the phones would have caught this one, except
// the settings `Row` takes `icon?: string` and widens it back out again.
//
// Found when 016's Privacy row shipped with `icon="globe"`, which is not in the
// set. It drew an empty circle on a device and passed lint, typecheck, the
// suites and both dead-class scripts. Same family as `dead-classes.mjs`: the
// failure is silence, so the check has to be a list.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const known = new Set(
  readdirSync(join(root, "apps/web/public/icons"))
    .filter((f) => f.endsWith(".svg"))
    .map((f) => f.slice(0, -4)),
);

// Both spellings the codebase uses: a JSX prop and an object literal field.
const uses = /\bicon(?:Name)?\s*[:=]\s*[{"']([a-z0-9-]+)["'}]/g;

// Tracked and untracked alike: a screen written this session is exactly the
// one whose icon names nobody has checked yet.
const files = execSync(
  `git ls-files --cached --others --exclude-standard 'apps/web/src/**/*.tsx' 'apps/web/src/**/*.ts' 'apps/mobile/**/*.tsx'`,
  { cwd: root, encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean);

let dead = 0;
for (const file of files) {
  const text = readFileSync(join(root, file), "utf8");
  for (const [, name] of text.matchAll(uses)) {
    if (known.has(name)) continue;
    const line = text.slice(0, text.indexOf(name)).split("\n").length;
    console.log(`  ${file}:${line}  ${name}   (no icons/${name}.svg)`);
    dead += 1;
  }
}

console.log(dead === 0 ? "\nNo dead icon names." : `\n  ${dead} dead icon name(s).`);
process.exit(dead === 0 ? 0 : 1);
