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
//
// Found again on 2026-09-16: the phones' content row kept its names in a
// `Record<string, string>` keyed by content type, so none of them was an
// `icon=` and the first version of this script never looked. Three of the nine
// were not in the set and a task, file or note row drew an empty tile. So the
// scan now also reads the `name` attribute of every `Glyph` and `Icon` element,
// including the literals inside a `{...}` expression, which is where a
// fallback like `?? "text-quote"` lives, and every string value in an object
// literal whose identifier says it holds icons.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

// The checkout this script is in, whatever directory it is run from.
const root = fileURLToPath(new URL("../..", import.meta.url));
const known = new Set(
  readdirSync(join(root, "apps/web/public/icons"))
    .filter((f) => f.endsWith(".svg"))
    .map((f) => f.slice(0, -4)),
);

const SLUG = /^[a-z0-9-]+$/;

// Every place a name can sit. Each pattern yields { index, names }.
const patterns = [
  // A JSX prop or an object literal field: `icon="x"`, `iconName: "x"`.
  {
    re: /\bicon(?:Name)?\s*[:=]\s*[{"']([a-z0-9-]+)["'}]/g,
    names: (m) => [m[1]],
  },
  // The `name` attribute on an icon element: `<Glyph name="x">` or
  // `<Icon name={MAP[t] ?? "x"}>`. Inside braces, every quoted slug counts
  // except the operand of a comparison, which is a type being tested rather
  // than a name being drawn: `name={t === "event" ? "calendar" : "clock"}`.
  {
    re: /<(?:Glyph|Icon)\b[^>]*?\bname=(?:"([a-z0-9-]+)"|\{([^}]*)\})/g,
    names: (m) => (m[1] ? [m[1]] : literals(m[2])),
  },
  // An object literal whose identifier says it holds icons: `ICON`,
  // `TYPE_ICON`, `rowIcons`. Every string value in it is a name.
  {
    re: /\b(?:const|let)\s+\w*(?:ICON|Icon)\w*\s*(?::[^=]*?)?=\s*\{([^}]*)\}/g,
    names: (m) => literals(m[1]),
  },
];

function literals(expr) {
  return [...expr.matchAll(/(?<![=!]=\s*)["']([a-z0-9-]+)["']/g)].map((m) => m[1]);
}

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
  const seen = new Set();
  for (const { re, names } of patterns) {
    for (const m of text.matchAll(re)) {
      for (const name of names(m)) {
        if (!SLUG.test(name) || known.has(name)) continue;
        const key = `${m.index}:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const line = text.slice(0, m.index).split("\n").length;
        console.log(`  ${file}:${line}  ${name}   (no icons/${name}.svg)`);
        dead += 1;
      }
    }
  }
}

console.log(dead === 0 ? "\nNo dead icon names." : `\n  ${dead} dead icon name(s).`);
process.exit(dead === 0 ? 0 : 1);
