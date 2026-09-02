// Find utility classes the generated theme cannot satisfy.
//
// A class Tailwind does not recognise is not an error anywhere: it emits no
// rule, the element keeps the platform default, and the screen renders in
// system greys while every file involved looks correct. That is how the gate
// shipped with a black label on the black Apple button, and how 27 colours,
// 24 of them semantic, went missing from both platforms at once.
//
// Run after `pnpm tokens`, since it reads the generated preset.
//
//   node .claude/scripts/dead-classes.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const preset = require("~/dev/offload_app/packages/tokens/dist/tailwind-preset.cjs").theme.extend;
const colors = new Set(Object.keys(preset.colors ?? {}));
const spacing = new Set(Object.keys(preset.spacing ?? {}));
const radius = new Set(Object.keys(preset.borderRadius ?? {}));
const fontSize = new Set(Object.keys(preset.fontSize ?? {}));
const fontFamily = new Set(Object.keys(preset.fontFamily ?? {}));
const heights = new Set(Object.keys(preset.height ?? {}));
const minH = new Set(Object.keys(preset.minHeight ?? {}));

// Tailwind built-ins that legitimately survive without a token.
const BUILTIN_COLOR = /^(transparent|current|inherit|black|white|red-\d{2,3}|green-\d{2,3}|slate-\d{2,3}|gray-\d{2,3})$/;
const BUILTIN_SIZE = /^(px|auto|full|screen|min|max|fit|\d+(\.\d+)?|\[.+\])$/;
const BUILTIN_FONT = /^(thin|extralight|light|normal|medium|semibold|bold|extrabold|black|sans|serif|mono|italic|not-italic)$/;

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (e !== "node_modules" && e !== "android" && e !== "ios") walk(p); }
    else if (/\.(tsx|ts)$/.test(p)) files.push(p);
  }
})("~/dev/offload_app/apps/mobile");

const findings = [];
for (const file of files) {
  const src = readFileSync(file, "utf8");
  // className="..." and className={`...`}
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const blob = (m[1] ?? m[2] ?? "");
    const line = src.slice(0, m.index).split("\n").length;
    for (let cls of blob.split(/[\s"'`]+/)) {
      if (!cls || cls.includes("${")) continue;
      cls = cls.replace(/^(active|disabled|focus|hover|dark|web|ios|android):/, "");
      let mm;
      if ((mm = cls.match(/^(?:text|bg|border|fill|stroke)-(.+)$/))) {
        const v = mm[1];
        if (BUILTIN_COLOR.test(v)) continue;
        if (colors.has(v)) continue;
        // text- also carries sizes, weights, alignment
        if (fontSize.has(v) || BUILTIN_FONT.test(v)) continue;
        if (/^(center|left|right|justify|start|end)$/.test(v)) continue;
        // border- also carries widths
        if (/^(0|2|4|8|t|b|l|r|x|y|hairline|solid|dashed|dotted|none)$/.test(v)) continue;
        if (spacing.has(v) || radius.has(v)) continue;
        findings.push({ file, line, cls, why: "no colour/size named " + v });
      } else if ((mm = cls.match(/^font-(.+)$/))) {
        const v = mm[1];
        if (fontFamily.has(v) || BUILTIN_FONT.test(v)) continue;
        findings.push({ file, line, cls, why: "no font family named " + v });
      } else if ((mm = cls.match(/^(?:min-h|h|w|max-h)-(.+)$/))) {
        const v = mm[1];
        if (heights.has(v) || minH.has(v) || spacing.has(v) || BUILTIN_SIZE.test(v)) continue;
        findings.push({ file, line, cls, why: "no height/width named " + v });
      } else if ((mm = cls.match(/^rounded-(.+)$/))) {
        const v = mm[1];
        if (radius.has(v) || /^(none|full|sm|md|lg|xl)$/.test(v)) continue;
        findings.push({ file, line, cls, why: "no radius named " + v });
      }
    }
  }
}

if (!findings.length) { console.log("No dead classes."); process.exit(0); }
for (const f of findings) {
  console.log(`  ${f.file.replace("~/dev/offload_app/", "")}:${f.line}  ${f.cls}   (${f.why})`);
}
console.log(`\n  ${findings.length} dead class use(s).`);
