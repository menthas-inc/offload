// Generates design tokens as DATA from the design system's own CSS.
//
// Why generated and never hand-copied: OFF-7 says consume the tokens, never
// retype a value, and a literal hex in application code is a bug. This is the
// one place a token value is read, so a design sync propagates by rerunning
// this rather than by someone editing a second copy.
//
// It is also what keeps the native escape hatch open. Tokens ship as data, not
// as React Native StyleSheet objects, so a future SwiftUI client reads the same
// JSON rather than reimplementing a theme.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const TOKENS_DIR = join(here, "../../../.claude/skills/offload-design/tokens");
const OUT_DIR = join(here, "../dist");

// Custom properties live in :root for light and in a [data-theme="dark"] scope
// for dark. Both matter: dark is a real theme, not a filter over the light one.
const SCOPE_RE = /(:root(?![\w-])|\[data-theme="dark"\])([^{]*)\{([^}]*)\}/g;
const DECL_RE = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;

function parse(css) {
  const light = {};
  const dark = {};
  for (const [, selector, , body] of css.matchAll(SCOPE_RE)) {
    const target = selector.includes("dark") ? dark : light;
    for (const [, name, value] of body.matchAll(DECL_RE)) {
      target[name.slice(2)] = value.trim();
    }
  }
  return { light, dark };
}

const light = {};
const dark = {};
const files = readdirSync(TOKENS_DIR).filter((f) => f.endsWith(".css")).sort();

for (const file of files) {
  const parsed = parse(readFileSync(join(TOKENS_DIR, file), "utf8"));
  Object.assign(light, parsed.light);
  Object.assign(dark, parsed.dark);
}

if (Object.keys(light).length === 0) {
  throw new Error(
    "No tokens parsed. The design system's token files moved or changed shape; " +
      "fix this generator rather than hand-copying values."
  );
}

// Semantic aliases point at ramps: --text-accent is var(--moss-600). That is
// correct for CSS and useless for React Native, which has no var(). So we emit
// both: the raw values for the web, and a resolved copy for anything that
// cannot follow a reference. Resolving here rather than in each client is what
// keeps "tokens ship as data" true for a future native client too.
function resolve(scope, fallback) {
  const out = {};
  const lookup = (name, chain) => {
    if (chain.has(name)) {
      throw new Error(`Token cycle: ${[...chain, name].join(" -> ")}`);
    }
    const raw = scope[name] ?? fallback[name];
    if (raw === undefined) return undefined;
    // Substitute every var() inside the value, not only a value that is one
    // var(). The type roles are CSS `font:` shorthands holding four references
    // at once, so whole-value matching resolves none of them.
    return raw.replace(/var\(\s*--([a-z0-9-]+)\s*(?:,\s*([^)]*))?\)/gi, (_m, ref, fb) => {
      const value = lookup(ref, new Set([...chain, name]));
      if (value !== undefined) return value;
      if (fb !== undefined) return fb.trim();
      throw new Error(`Token --${name} references --${ref}, which does not exist.`);
    });
  };
  for (const name of new Set([...Object.keys(fallback), ...Object.keys(scope)])) {
    const value = lookup(name, new Set());
    if (value !== undefined) out[name] = value;
  }
  return out;
}

const resolvedLight = resolve(light, light);
const resolvedDark = resolve(dark, light);

const unresolved = Object.entries(resolvedLight).filter(([, v]) => v.includes("var("));
if (unresolved.length) {
  throw new Error(
    `Unresolved token references remain: ${unresolved.map(([k]) => k).join(", ")}. ` +
      "A client that cannot follow a var() would render nothing for these."
  );
}

const tokens = {
  light,
  dark,
  resolved: { light: resolvedLight, dark: resolvedDark },
  sources: files,
  generatedFrom: ".claude/skills/offload-design/tokens",
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "tokens.json"), JSON.stringify(tokens, null, 2) + "\n");

// A CSS file too, with the references intact, because in a browser var() is
// the point: one :root and one dark scope, and a component names a semantic
// alias rather than a value. This is what the web app imports, and it is
// generated for the same reason the JSON is: so no value is ever retyped.
const cssLines = [
  "/* Generated from the design system. Do not edit: run `pnpm tokens`. */",
  ":root {",
  ...Object.entries(light).map(([k, v]) => `  --${k}: ${v};`),
  "}",
  "",
  '[data-theme="dark"] {',
  ...Object.entries(dark).map(([k, v]) => `  --${k}: ${v};`),
  "}",
  "",
];
writeFileSync(join(OUT_DIR, "tokens.css"), cssLines.join("\n"));

console.log(
  `tokens: ${Object.keys(light).length} light, ${Object.keys(dark).length} dark, ` +
    `${Object.keys(resolvedLight).length} resolved, from ${files.length} files`
);
