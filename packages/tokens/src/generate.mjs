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

// ---------------------------------------------------------------- NativeWind
//
// Two more outputs, for the phones. NativeWind is Tailwind's authoring model
// over React Native styles, and it reads a theme the same way Tailwind does, so
// the theme has to come from here rather than from a hand-written config that
// drifts.
//
// Colours go out as CSS variables holding space-separated RGB channels, which
// is the shape `rgb(var(--x) / <alpha-value>)` needs. That indirection is not
// decoration: it is what makes dark mode a variable swap rather than a second
// palette, so `bg-surface-page` is one class that means the right thing in both
// themes. A generated map of literal hexes cannot do that.
//
// Everything that is not a colour goes out as a literal, because a border
// radius does not change with the theme.

/** #RGB, #RRGGBB or an rgb()/rgba() function, to "R G B". Returns null for
 *  anything else, which is how non-colour tokens are filtered out. */
function toChannels(value) {
  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d) : hex[1].match(/../g);
    return digits.map((pair) => parseInt(pair, 16)).join(" ");
  }
  const fn = value.trim().match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  // The alpha of an rgba() token is deliberately dropped: Tailwind applies its
  // own through <alpha-value>, and keeping both multiplies them. State layers
  // like state-hover carry their alpha in the utility that uses them.
  return fn ? [fn[1], fn[2], fn[3]].map((n) => Math.round(Number(n))).join(" ") : null;
}

const colorNames = Object.keys(light).filter((name) => toChannels(light[name]) !== null);

const channelLines = (source) =>
  colorNames
    .filter((name) => source[name] !== undefined && toChannels(source[name]) !== null)
    .map((name) => `  --c-${name}: ${toChannels(source[name])};`);

writeFileSync(
  join(OUT_DIR, "nativewind.css"),
  [
    "/* Generated from the design system. Do not edit: run `pnpm tokens`. */",
    "@tailwind base;",
    "@tailwind components;",
    "@tailwind utilities;",
    "",
    "@layer base {",
    "  :root {",
    ...channelLines(light).map((line) => "  " + line),
    "  }",
    "",
    "  .dark:root {",
    // Dark only redefines what it actually changes, so a token the design
    // system leaves alone stays alone rather than being restated identically.
    ...channelLines(dark).map((line) => "  " + line),
    "  }",
    "}",
    "",
  ].join("\n")
);

/** Strip a token prefix, so `radius-sm` becomes `sm` under borderRadius. Only
 *  used where shadowing a Tailwind default is the intent. */
const group = (prefix) =>
  Object.fromEntries(
    Object.entries(resolvedLight)
      .filter(([name]) => name.startsWith(`${prefix}-`))
      .map(([name, value]) => [name.slice(prefix.length + 1), value])
  );

/** Keep the full token name as the key. For scales where a short key would
 *  silently shadow a Tailwind default with a different value, which is the
 *  worst kind of wrong: `p-4` still compiles and quietly means 8px instead of
 *  16px. */
const named = (...prefixes) =>
  Object.fromEntries(
    Object.entries(resolvedLight).filter(([name]) =>
      prefixes.some((prefix) => name === prefix || name.startsWith(`${prefix}-`))
    )
  );

// Fixed heights the design system names. Exposed so a screen writes
// `min-h-composer-height` rather than a raw 52px, which the adherence lint
// rejects and OFF-7 forbids.
const heights = named("appbar", "composer", "row", "tabbar", "tap");

const preset = {
  colors: Object.fromEntries(
    colorNames.map((name) => [name, `rgb(var(--c-${name}) / <alpha-value>)`])
  ),
  // Shadowing Tailwind's radius scale is deliberate: the design system's
  // radii should be the only ones reachable, and every key here has a
  // counterpart there.
  borderRadius: group("radius"),
  spacing: named("space", "gutter", "tap"),
  height: heights,
  minHeight: heights,
  width: heights,
  fontSize: group("size"),
  fontWeight: group("weight"),
  lineHeight: group("leading"),
  letterSpacing: group("tracking"),
  fontFamily: {
    // The first family only. React Native has no font stack: it resolves one
    // name, and a comma-separated list silently matches nothing.
    core: [light["font-core"].split(",")[0].replace(/"/g, "")],
    quiet: [light["font-quiet"].split(",")[0].replace(/"/g, "")],
  },
};

writeFileSync(
  join(OUT_DIR, "tailwind-preset.cjs"),
  "// Generated from the design system. Do not edit: run `pnpm tokens`.\n" +
    "//\n" +
    "// .cjs, not .js: this package is type: module, and a Tailwind config is\n" +
    "// loaded with require(). A .js file here is an ES module and the require\n" +
    "// throws ERR_REQUIRE_ESM before Tailwind ever sees the theme.\n" +
    "module.exports = { theme: { extend: " +
    JSON.stringify(preset, null, 2) +
    " } };\n"
);

console.log(
  `nativewind: ${colorNames.length} colours as channels, ` +
    `${Object.keys(preset.spacing).length} spacing, ${Object.keys(preset.height).length} heights`
);

// ------------------------------------------------------------------ Android
//
// Android is a real fork, not a skin. The design system's Android kit defines a
// platform scope that replaces three things: the Material surface roles (--a-*,
// derived from offload's own neutrals so the brand still owns the palette),
// Material's shape scale in place of offload's radii, and taller bars.
//
// Those live in the kit's index.html rather than in tokens/, so they are read
// from there rather than retyped. A hex typed into the app is the thing OFF-7
// exists to prevent, and "it was only for Android" is how that starts.
//
// Emitted with an `a-` prefix into the same preset, always defined rather than
// swapped at runtime: the Android screens are separate files by platform
// extension, so each set is only reachable from the surface it belongs to.

const ANDROID_KIT = join(here, "../../../.claude/skills/offload-design/ui_kits/android_app/index.html");

function parsePlatformScope(html) {
  const light = {};
  const dark = {};
  const scopes = html.matchAll(/\[data-platform="android"\](\[data-theme="dark"\])?\s*\{([^}]*)\}/g);
  for (const [, isDark, body] of scopes) {
    const target = isDark ? dark : light;
    for (const [, name, value] of body.matchAll(DECL_RE)) target[name.slice(2)] = value.trim();
  }
  return { light, dark };
}

const android = parsePlatformScope(readFileSync(ANDROID_KIT, "utf8"));

if (Object.keys(android.light).length === 0) {
  throw new Error(
    "No Android platform tokens parsed. The Android kit's scope moved or changed shape; " +
      "fix this generator rather than hand-copying values into the app."
  );
}

/** Android values resolve against the light theme's variables, since the scope
 *  references them (--a-surface is var(--surface-page)). */
const resolveAndroid = (source, base) =>
  Object.fromEntries(
    Object.entries(source).map(([name, value]) => [
      name,
      value.replace(/var\(\s*(--[a-z0-9-]+)\s*\)/gi, (_, ref) => base[ref.slice(2)] ?? ref),
    ])
  );

const androidLight = resolveAndroid(android.light, resolvedLight);
const androidDark = resolveAndroid({ ...android.light, ...android.dark }, resolvedDark);

tokens.android = { light: androidLight, dark: androidDark };
writeFileSync(join(OUT_DIR, "tokens.json"), JSON.stringify(tokens, null, 2) + "\n");

// Colours join the channel variables so `bg-a-c-low` works and swaps with the
// theme like every other colour.
const androidColors = Object.keys(androidLight).filter((n) => toChannels(androidLight[n]) !== null);

/** The surface roles are already named a-*, so they are used as-is. Prefixing
 *  again gives a-a-surface, which is nobody's idea of a class name. */
const androidCss = readFileSync(join(OUT_DIR, "nativewind.css"), "utf8")
  .replace(
    /(  :root \{\n)/,
    (m) =>
      m +
      androidColors.map((n) => `    --c-${n}: ${toChannels(androidLight[n])};`).join("\n") +
      "\n"
  )
  .replace(
    /(  \.dark:root \{\n)/,
    (m) =>
      m +
      androidColors
        .filter((n) => toChannels(androidDark[n]) !== null)
        .map((n) => `    --c-${n}: ${toChannels(androidDark[n])};`)
        .join("\n") +
      "\n"
  );
writeFileSync(join(OUT_DIR, "nativewind.css"), androidCss);

const androidPreset = {
  colors: Object.fromEntries(
    androidColors.map((n) => [n, `rgb(var(--c-${n}) / <alpha-value>)`])
  ),
  borderRadius: Object.fromEntries(
    Object.entries(androidLight)
      .filter(([n]) => n.startsWith("radius-"))
      .map(([n, v]) => [`a-${n.slice("radius-".length)}`, v])
  ),
  // -height anywhere in the name, not only at the end: row-height-lg is a
  // height too and a suffix test silently drops it.
  height: Object.fromEntries(
    Object.entries(androidLight)
      .filter(([n]) => n.includes("-height"))
      .map(([n, v]) => [`a-${n}`, v])
  ),
};
androidPreset.minHeight = androidPreset.height;

const presetFile = join(OUT_DIR, "tailwind-preset.cjs");
const merged = readFileSync(presetFile, "utf8").replace(
  /module\.exports = \{ theme: \{ extend: ([\s\S]*)\} \};\n$/,
  (_, body) => {
    const extend = JSON.parse(body);
    for (const key of Object.keys(androidPreset)) {
      extend[key] = { ...(extend[key] ?? {}), ...androidPreset[key] };
    }
    return "module.exports = { theme: { extend: " + JSON.stringify(extend, null, 2) + " } };\n";
  }
);
writeFileSync(presetFile, merged);

console.log(
  `android: ${androidColors.length} surface roles, ` +
    `${Object.keys(androidPreset.borderRadius).length} radii, ` +
    `${Object.keys(androidPreset.height).length} heights`
);
