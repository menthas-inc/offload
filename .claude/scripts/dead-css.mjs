// Find `styles.foo` references with no matching class in the imported module.
//
// `apps/web/types.d.ts` declares `*.css` with no shape, so every `styles.x` is
// `any`: a class that does not exist typechecks, lints, builds and ships, and
// the element simply renders with `class="undefined"`. That is how the web's
// day-one Today screen went out with eight of its nine classes undefined and no
// styling at all, on the one screen this whole feature builds toward.
//
// Typed CSS modules would be the other way to close this. This is the smaller
// one, and it runs in the same second as the Tailwind scan beside it.
//
//   node .claude/scripts/dead-css.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// The checkout this script is in, never a fixed path: run from a worktree it
// read the main checkout's files and reported them clean.
const CHECKOUT = fileURLToPath(new URL("../..", import.meta.url));
const ROOT = join(CHECKOUT, "apps/web/src");

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.tsx?$/.test(path)) files.push(path);
  }
})(ROOT);

/** Class names a CSS module actually defines. */
function defined(cssPath) {
  const out = new Set();
  for (const m of readFileSync(cssPath, "utf8").matchAll(/\.([A-Za-z][\w-]*)/g)) out.add(m[1]);
  return out;
}

const findings = [];
for (const file of files) {
  const src = readFileSync(file, "utf8");
  // `import styles from "./x.module.css"` — the local name matters, since a
  // file can import more than one stylesheet under different names.
  for (const imp of src.matchAll(/import\s+(\w+)\s+from\s+"([^"]+\.css)"/g)) {
    const [, local, spec] = imp;
    let cssPath;
    try {
      cssPath = resolve(dirname(file), spec);
      statSync(cssPath);
    } catch {
      findings.push({ file, name: spec, why: "stylesheet not found" });
      continue;
    }
    const have = defined(cssPath);
    const used = new Set(
      // Not the import line itself: `people.module.css` is a path, not a class.
      [...src.replace(/^import\s.*$/gm, "").matchAll(new RegExp(`\\b${local}\\.([A-Za-z][\\w]*)`, "g"))].map((m) => m[1])
    );
    for (const name of used) {
      if (!have.has(name)) {
        const line = src.slice(0, src.indexOf(`${local}.${name}`)).split("\n").length;
        findings.push({
          file: `${file.replace(CHECKOUT, "")}:${line}`,
          name: `${local}.${name}`,
          why: `not defined in ${spec}`,
        });
      }
    }
  }
}

if (!findings.length) {
  console.log("No dead CSS module classes.");
  process.exit(0);
}
for (const f of findings) console.log(`  ${f.file}  ${f.name}   (${f.why})`);
console.log(`\n  ${findings.length} dead class reference(s).`);
process.exit(1);
