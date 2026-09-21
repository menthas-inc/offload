// The launch screen's mark, from the design system's own SVG into the two
// PNGs the native splash takes, and a check that app.json's colours are the
// tokens' and not somebody's memory of them.
//
// Generated for the same reason the icons are: the mark is one file in the
// design system and the ink and the page are two tokens, and a splash drawn
// from a retyped hex is the version of "retyping a value" nobody notices
// until the dark page is a shade off. app.json cannot read a token, so the
// values are written there by hand and this refuses when they drift.
//
// Run with `pnpm splash` after a change to the mark or to either token, then
// rebuild the native app: the splash is baked at build time.

import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { resolved } from "@offload/tokens";

const MARK = "../../.claude/skills/offload-design/assets/mark.svg";
const SIZE = 1024;

const light = { image: "./assets/splash-mark.png", ink: resolved.light["text-primary"], page: resolved.light["surface-page"] };
const dark = { image: "./assets/splash-mark-dark.png", ink: resolved.dark["text-primary"], page: resolved.dark["surface-page"] };

const svg = readFileSync(MARK, "utf8");
// The mark draws in one colour. Read which, rather than assuming, so a
// re-exported file in another ink still tints.
const inks = [...new Set([...svg.matchAll(/(?:fill|stroke)="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]))];
if (inks.length !== 1) throw new Error(`splash: mark.svg draws in ${inks.length} colours, expected one`);
const drawn = inks[0];

for (const theme of [light, dark]) {
  // The whole 96 canvas, margins included: the plugin's imageWidth is the
  // canvas, so the holding screen can draw the same file at the same width
  // and land the mark in the same place.
  const tinted = svg.split(drawn).join(theme.ink).replace('width="96" height="96"', `width="${SIZE}" height="${SIZE}"`);
  await sharp(Buffer.from(tinted), { density: 300 }).resize(SIZE, SIZE).png().toFile(theme.image);
  const meta = await sharp(theme.image).metadata();
  if (meta.width !== SIZE || meta.height !== SIZE || !meta.hasAlpha) throw new Error(`splash: ${theme.image} came out wrong`);
  console.log(`splash: ${theme.image} in ${theme.ink}`);
}

// app.json holds the page colours by value. Refuse when they are not the tokens'.
const app = JSON.parse(readFileSync("app.json", "utf8"));
const plugin = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === "expo-splash-screen")?.[1];
if (!plugin) throw new Error("splash: app.json has no expo-splash-screen plugin entry");
const drift = [];
if (plugin.backgroundColor !== light.page) drift.push(`backgroundColor ${plugin.backgroundColor} is not --surface-page ${light.page}`);
if (plugin.dark?.backgroundColor !== dark.page) drift.push(`dark.backgroundColor ${plugin.dark?.backgroundColor} is not dark --surface-page ${dark.page}`);
if (plugin.image !== light.image || plugin.dark?.image !== dark.image) drift.push("the plugin does not point at the two files this writes");
if (drift.length) throw new Error(`splash: app.json drifted from the tokens:\n  ${drift.join("\n  ")}`);
console.log("splash: app.json matches the tokens");
