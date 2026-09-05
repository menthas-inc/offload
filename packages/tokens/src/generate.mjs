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

// Custom properties live in :root for light, in a [data-theme="dark"] scope for
// dark, and in [data-type="large"] for the Settings type size. All three matter:
// dark is a real theme rather than a filter over the light one, and large is a
// real scale rather than a multiplier a client can apply.
const SCOPE_RE =
  /(:root(?![\w-])|\[data-theme="dark"\]|\[data-type="large"\])([^{]*)\{([^}]*)\}/g;
const DECL_RE = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;

// Comments first, always. A comment is not a selector, and one of them said so:
// typography.css explains that the large block is "scoped without :root on
// purpose", the scope match found that `:root`, ran its selector group through
// the rest of the prose to the next brace, and read the large sizes in as the
// base ones. Every size token shipped 15% bigger on every platform and nothing
// raised, because a generated stylesheet with the wrong numbers in it is still
// a valid stylesheet.
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function parse(css) {
  const light = {};
  const dark = {};
  const large = {};
  for (const [, selector, , body] of strip(css).matchAll(SCOPE_RE)) {
    const target = selector.includes("dark")
      ? dark
      : selector.includes("large")
        ? large
        : light;
    for (const [, name, value] of body.matchAll(DECL_RE)) {
      target[name.slice(2)] = value.trim();
    }
  }
  return { light, dark, large };
}

const light = {};
const dark = {};
const large = {};
const files = readdirSync(TOKENS_DIR).filter((f) => f.endsWith(".css")).sort();

for (const file of files) {
  const parsed = parse(readFileSync(join(TOKENS_DIR, file), "utf8"));
  Object.assign(light, parsed.light);
  Object.assign(dark, parsed.dark);
  Object.assign(large, parsed.large);
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
  large,
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
  // After :root and at the same specificity, so it wins on order rather than
  // on a client guessing which file the bundler emits last.
  '[data-type="large"] {',
  ...Object.entries(large).map(([k, v]) => `  --${k}: ${v};`),
  "}",
  "",
];
writeFileSync(join(OUT_DIR, "tokens.css"), cssLines.join("\n"));

if (light["size-body"] === large["size-body"]) {
  throw new Error(
    "The base type scale and the large one came out identical. A scope leaked: " +
      "check that no comment in tokens/ contains a selector the parser matches."
  );
}
if (Object.keys(large).length === 0) {
  throw new Error("No [data-type=\"large\"] tokens parsed. The Settings type size would do nothing.");
}

console.log(
  `tokens: ${Object.keys(light).length} light, ${Object.keys(dark).length} dark, ` +
    `${Object.keys(large).length} large, ` +
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

// Resolved, not raw. A semantic colour is usually an alias: text-inverse is
// var(--paper), text-primary is var(--ink-900). toChannels() returns null for
// anything holding a var(), so filtering the raw scope silently dropped every
// aliased colour and kept only the handful declared as literal hex. The result
// was a preset with 6 semantic colours instead of 40, and classes like
// text-text-inverse that Tailwind did not recognise and therefore did not
// emit: no error anywhere, just black label text on the black Apple button.
//
// resolve() exists for exactly this and the rest of the file already uses it.
const colorNames = Object.keys(resolvedLight).filter(
  (name) => toChannels(resolvedLight[name]) !== null
);

// Dark is resolved against itself, so a dark-only alias points at the dark
// ramp rather than inheriting light's value through the fallback.
const channelLines = (source) =>
  colorNames
    .filter((name) => source[name] !== undefined && toChannels(source[name]) !== null)
    .map((name) => `  --c-${name}: ${toChannels(source[name])};`);

const NATIVEWIND_CSS = [
    "/* Generated from the design system. Do not edit: run `pnpm tokens`. */",
    "@tailwind base;",
    "@tailwind components;",
    "@tailwind utilities;",
    "",
    // Deliberately NOT wrapped in @layer base.
    //
    // NativeWind's Metro transformer hangs on an @layer base block, forever,
    // with no error and no CPU. It is a known issue (nativewind#1532) and it
    // cost most of an evening: every bundle on this machine stalled the moment
    // this file was involved, and the failure looked like a broken bundler
    // rather than a stylesheet.
    //
    // Plain :root works identically here. The variables are consumed by the
    // Tailwind preset's rgb(var(--c-x) / <alpha-value>) colours, which do not
    // care which layer declared them.
    ":root {",
    ...channelLines(resolvedLight),
    "}",
    "",
    ".dark:root {",
    // Dark only redefines what it actually changes, so a token the design
    // system leaves alone stays alone rather than being restated identically.
    ...channelLines(resolvedDark),
    "}",
    "",
  ].join("\n");

writeFileSync(join(OUT_DIR, "nativewind.css"), NATIVEWIND_CSS);

// And straight into the app, because a CSS `@import` across a workspace
// package hangs NativeWind's Metro transformer outright: no error, no CPU,
// forever. Verified by bisection, and it cost most of a session. The same
// bytes inlined bundle in about a minute.
//
// Generated rather than committed, and gitignored, so it cannot drift from the
// design system: `pnpm tokens` is what puts it there and nothing else edits it.
const MOBILE_CSS = join(here, "../../../apps/mobile/global.css");
try {
  writeFileSync(MOBILE_CSS, NATIVEWIND_CSS);
} catch {
  // The mobile app is not always present, a web-only checkout for instance.
  // Its absence is not a reason for the token build to fail.
}

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
const insertInto = (css, selector, lines) => {
  // Anchored to the start of a line and tolerant of indentation. The previous
  // pattern hard-coded two leading spaces, which was right while the variables
  // sat inside @layer base and silently matched nothing the moment that
  // wrapper came off: String.replace() with no match is not an error, so the
  // whole Android scope vanished from the stylesheet without a word. Every
  // a- class on the Android screens resolved to an undefined variable, which
  // is why the gate came out in system greys instead of the design's.
  const pattern = new RegExp(`^([ \\t]*)\\${selector} \\{\\n`, "m");
  if (!pattern.test(css)) {
    throw new Error(
      `Could not find "${selector} {" in the generated stylesheet. The Android ` +
        `scope would be dropped silently, so this fails instead.`
    );
  }
  return css.replace(pattern, (m, indent) => m + lines(indent).join("\n") + "\n");
};

let androidCss = readFileSync(join(OUT_DIR, "nativewind.css"), "utf8");
androidCss = insertInto(androidCss, ":root", (indent) =>
  androidColors.map((n) => `${indent}  --c-${n}: ${toChannels(androidLight[n])};`)
);
androidCss = insertInto(androidCss, ".dark:root", (indent) =>
  androidColors
    .filter((n) => toChannels(androidDark[n]) !== null)
    .map((n) => `${indent}  --c-${n}: ${toChannels(androidDark[n])};`)
);

writeFileSync(join(OUT_DIR, "nativewind.css"), androidCss);
// And into the app, again. The first write above happened before the Android
// scope existed, so stopping there left the app with the stylesheet minus
// every a- variable, which is the bug this block just fixed one layer up.
try {
  writeFileSync(MOBILE_CSS, androidCss);
} catch {
  /* mobile app may be absent */
}

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

// Every colour the preset offers must have a variable behind it.
//
// The preset and the stylesheet are generated by two separate passes, and a
// colour present in one and missing from the other fails silently in the worst
// possible way: Tailwind emits `color: rgb(var(--c-a-surface) / 1)`, the
// variable does not exist, and the platform falls back to its own default. No
// build error, no lint error, just a screen quietly wearing system greys. That
// is exactly how the whole Android scope went missing, and how text-inverse
// left the Apple button's label black on black.
//
// Checked against the file actually written, not the values in memory, because
// what the app compiles is the file.
{
  const css = readFileSync(join(OUT_DIR, "nativewind.css"), "utf8");
  // The :root block only. Scanning the whole file lets the .dark:root block
  // vouch for a variable that light never declared, which is not a theory:
  // this check passed against a deliberately emptied light block until it was
  // scoped. Light is the base every theme falls back to, so light is what has
  // to be complete.
  const rootBlock = css.match(/^[ \t]*:root \{\n([\s\S]*?)^[ \t]*\}/m);
  if (!rootBlock) throw new Error("No :root block in the generated stylesheet.");
  const declared = new Set(
    [...rootBlock[1].matchAll(/--c-([a-z0-9-]+)\s*:/gi)].map((m) => m[1])
  );
  const offered = Object.keys(JSON.parse(
    readFileSync(presetFile, "utf8").match(/extend: ([\s\S]*)\} \};\n$/)[1]
  ).colors ?? {});
  const orphans = offered.filter((name) => !declared.has(name));
  if (orphans.length) {
    throw new Error(
      `${orphans.length} preset colour(s) have no --c- variable in the stylesheet: ` +
        `${orphans.join(", ")}. A class using one renders as the platform default.`
    );
  }
  console.log(`invariant: ${offered.length} preset colours all backed by variables`);
}
