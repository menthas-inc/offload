// The iOS app icon: the white tile with the ink mark, at the geometry of the
// design system's assets/app-icon.svg, with the mark scaled about the tile's
// centre. 1.45 since 2026-10-11, when the mark read small on a home screen.
//
// Opaque on purpose: App Store Connect refuses a 1024 icon with alpha. Android
// keeps its adaptive icon, whose mask already shows the mark larger.
//
// Run with `pnpm app-icon`, then rebuild the native app: the icon is baked at
// build time.

import sharp from "sharp";
import { resolved } from "@offload/tokens";

const OUT = "./assets/icon-ios.png";
const SIZE = 1024;
const SCALE = 1.45;
const t = 96 - 48 * SCALE; // keeps the mark's 96 box centred on the 192 tile
const tile = resolved.light["surface-raised"];
const ink = resolved.light["text-primary"];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="${SIZE}" height="${SIZE}"><rect width="192" height="192" fill="${tile}"/><g transform="translate(${t} ${t}) scale(${SCALE})"><circle cx="48" cy="21" r="10" fill="${ink}"/><path d="M22 46 V62 a12 12 0 0 0 12 12 h28 a12 12 0 0 0 12 -12 V46" fill="none" stroke="${ink}" stroke-width="10" stroke-linecap="round"/></g></svg>`;

await sharp(Buffer.from(svg)).resize(SIZE, SIZE).flatten({ background: tile }).removeAlpha().png().toFile(OUT);
const meta = await sharp(OUT).metadata();
if (meta.width !== SIZE || meta.height !== SIZE || meta.hasAlpha) throw new Error(`app-icon: ${OUT} came out wrong`);
console.log(`app-icon: ${OUT} at ${SCALE}`);
