// The icon set, from the design system's own SVGs into something React Native
// can draw.
//
// Generated for the same reason the tokens are: retyping a path is the version
// of "retyping a value" that OFF-7 forbids and nobody would notice was wrong.
// `react-native-svg` takes the same `d` attributes the web's masks do, so this
// reads the vendored files and emits them rather than converting anything.
//
// Run with `pnpm icons`. The output is committed, unlike the token bundle,
// because Metro needs it present at build time and an icon set changes about
// once a quarter.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = "../../.claude/skills/offload-design/assets/icons";
const OUT = "components/icons.generated.ts";

const shapes = {};

for (const file of readdirSync(SOURCE).sort()) {
  if (!file.endsWith(".svg")) continue;
  const name = file.replace(/\.svg$/, "");
  const svg = readFileSync(join(SOURCE, file), "utf8");

  const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => ({
    kind: "path",
    d: m[1],
  }));
  // Attribute order is not guaranteed: lucide writes `x1 x2 y1 y2` on some
  // icons and `x1 y1 x2 y2` on others, and `calendar.svg` arrived with `x y
  // width height` where every other rect had `width height x y`. A regex that
  // fixed the order dropped that rect and the glyph shipped as two pegs and a
  // line, which no gate could see. Read each attribute by name.
  const attrs = (tag) => (name) => Number((tag.match(new RegExp(`\\b${name}="([\\d.-]+)"`)) ?? [])[1] ?? 0);
  const circles = [...svg.matchAll(/<circle\b([^>]*)>/g)].map((m) => {
    const at = attrs(m[1]);
    return { kind: "circle", cx: at("cx"), cy: at("cy"), r: at("r") };
  });
  const rects = [...svg.matchAll(/<rect\b([^>]*)>/g)].map((m) => {
    const at = attrs(m[1]);
    return { kind: "rect", width: at("width"), height: at("height"), x: at("x"), y: at("y"), rx: at("rx") };
  });
  const lines = [...svg.matchAll(/<line\b([^>]*)>/g)].map((m) => {
    const at = attrs(m[1]);
    return { kind: "line", x1: at("x1"), y1: at("y1"), x2: at("x2"), y2: at("y2") };
  });

  // A polyline is a path with an implicit move and lines between the points.
  const polylines = [...svg.matchAll(/<polyline[^>]*points="([^"]+)"/g)].map((m) => {
    const nums = m[1].trim().split(/[\s,]+/).map(Number);
    const points = [];
    for (let i = 0; i + 1 < nums.length; i += 2) points.push(`${nums[i]} ${nums[i + 1]}`);
    return { kind: "path", d: `M${points.join("L")}` };
  });

  const all = [...paths, ...circles, ...rects, ...lines, ...polylines];
  // A generated artifact that fails by doing nothing is the worst kind: an
  // icon silently absent renders as empty space and every gate passes. This
  // refuses instead, and it refuses a partial icon too: every drawable element
  // in the file has to come out as a shape, or the file has something this
  // does not read.
  const drawable = (svg.match(/<(path|circle|rect|line|polyline)\b/g) ?? []).length;
  if (all.length === 0) throw new Error(`icons: ${name}.svg produced no shapes`);
  if (all.length !== drawable) {
    throw new Error(`icons: ${name}.svg has ${drawable} drawable elements and ${all.length} were read`);
  }
  shapes[name] = all;
}

const count = Object.keys(shapes).length;
if (count === 0) throw new Error("icons: read no icons at all, refusing to write an empty set");

writeFileSync(
  OUT,
  `// Generated from the design system. Do not edit: run \`pnpm icons\`.\n` +
    `// Source: .claude/skills/offload-design/assets/icons\n\n` +
    `export type IconName = ${Object.keys(shapes)
      .map((n) => JSON.stringify(n))
      .join(" | ")};\n\n` +
    `export type Shape =\n` +
    `  | { kind: "path"; d: string }\n` +
    `  | { kind: "circle"; cx: number; cy: number; r: number }\n` +
    `  | { kind: "rect"; width: number; height: number; x: number; y: number; rx: number }\n` +
    `  | { kind: "line"; x1: number; y1: number; x2: number; y2: number };\n\n` +
    `export const ICONS: Record<IconName, Shape[]> = ${JSON.stringify(shapes, null, 2)};\n`,
);

console.log(`icons: ${count} icons written to ${OUT}`);
