// Every icon slug the web app asks for exists in public/icons/.
//
// A slug that does not exist renders an empty box and nothing complains: no
// error, no warning, no build failure, just a hole where a glyph should be.
// Same invisible failure as a Tailwind class nobody defined and a CSS module
// key that is `any`, which is why this sits beside `dead-classes.mjs` and
// `dead-css.mjs` rather than being left to somebody noticing.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const have = new Set(readdirSync("apps/web/public/icons").map((f) => f.replace(/\.svg$/, "")));
const used = new Set();
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.tsx?$/.test(entry.name)) {
      const src = readFileSync(path, "utf8");
      // Only `<Icon name="...">`, not every attribute called name: a form
      // field named "email" is not an icon.
      for (const m of src.matchAll(/<Icon[^>]*?\bname="([a-z0-9-]+)"/gs)) used.add(m[1]);
      for (const m of src.matchAll(/\bicon:\s*"([a-z0-9-]+)"/g)) used.add(m[1]);
      for (const m of src.matchAll(/\bicon=\{?"([a-z0-9-]+)"/g)) used.add(m[1]);
    }
  }
};
walk("apps/web/src");
const missing = [...used].filter((n) => !have.has(n));
console.log(missing.length ? "  MISSING: " + missing.join(", ") : "  every icon slug resolves");
process.exit(missing.length ? 1 : 0);
