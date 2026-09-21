// The mark: a prism, drawn once from the account's id.
//
// The design system's `components/core/Avatar.jsx` is the reference, and this
// is its arithmetic line for line: FNV-1a over the id, hue off a twelve-step
// wheel, one xorshift32 draw for one of eight facet angles, and two gradients
// held between L 0.42 and 0.52 at C 0.13, which is what keeps white initials
// above 4.5:1 on every hue the wheel can produce. Those two numbers are the
// ones not to relax, and `avatar.test.ts` pins them.
//
// **No letters.** The initials come from a name that changes and the picture
// must not, so every surface draws them over this in the product's type,
// which is also what `Avatar.jsx` does with its span. **No transparency**: a
// full square, clipped to a circle by whoever draws it, since the kit's
// circle is `border-radius`.
//
// The kit draws each side as a CSS `linear-gradient` between two `oklch()`
// stops. A browser interpolates non-legacy colours in Oklab, so this does the
// same: the stops are converted to Oklab, mixed there, and converted to sRGB
// per pixel. The facet edge is supersampled so it is a line rather than a
// staircase at 36px.

import { PNG } from "pngjs";

export const SIZE = 176;
const L_LO = 0.42;
const L_HI = 0.52;
const CHROMA = 0.13;
const HUES = 12;
const FACETS = 8;
/** Samples per axis at the edge. Sixteen per pixel, only where it matters. */
const SUPER = 4;

export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Prism {
  hue: number;
  /** Degrees, one of eight. The gradient direction and the facet's normal. */
  angle: number;
}

/** The two numbers an id decides. Exported for the test and nothing else. */
export function prismOf(accountId: string): Prism {
  const seed = fnv1a(accountId);
  const hue = (seed % HUES) * (360 / HUES);
  // One draw off the seed, in the kit's exact int32 arithmetic.
  let s = seed || 1;
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  const step = (s >>> 0) % FACETS;
  return { hue, angle: step * (360 / FACETS) };
}

type Lab = [number, number, number];

function oklch(l: number, c: number, hDeg: number): Lab {
  const h = ((((hDeg % 360) + 360) % 360) * Math.PI) / 180;
  return [l, c * Math.cos(h), c * Math.sin(h)];
}

/** Oklab to sRGB, Björn Ottosson's matrices, gamma applied and clamped. */
function toSrgb([L, a, b]: Lab): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const gamma = (x: number) => {
    const v = Math.min(1, Math.max(0, x));
    return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  };
  return [gamma(r), gamma(g), gamma(bl)];
}

function mix(a: Lab, b: Lab, t: number): Lab {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** The picture, as PNG bytes. Deterministic: the same id gives the same
 *  bytes on every machine, which is what lets the row be written once. */
export function drawAvatar(accountId: string): Buffer {
  const { hue, angle } = prismOf(accountId);
  // CSS: 0deg is to top, 90deg to right, clockwise, y down on screen.
  const rad = (angle * Math.PI) / 180;
  const dirX = Math.sin(rad);
  const dirY = -Math.cos(rad);
  // The gradient line's length for a square, per the CSS algorithm.
  const length = SIZE * (Math.abs(dirX) + Math.abs(dirY));
  // The facet's half plane, as the kit's polygon defines it: the side where
  // the kit's (dx, dy) = (cos, sin) rotated by 90 degrees points, in the
  // kit's own frame, where the polygon's angle is the CSS angle.
  const kx = Math.cos(rad);
  const ky = Math.sin(rad);
  const nx = -ky;
  const ny = kx;

  const base0 = oklch(L_LO, CHROMA, hue);
  const base1 = oklch(L_HI, CHROMA, hue + 30);
  const facet0 = oklch(L_HI, CHROMA, hue + 90);
  const facet1 = oklch(L_LO, CHROMA, hue + 120);

  const centre = SIZE / 2;
  const colourAt = (x: number, y: number): [number, number, number] => {
    const px = x - centre;
    const py = y - centre;
    const t = Math.min(1, Math.max(0, (px * dirX + py * dirY) / length + 0.5));
    const onFacet = px * nx + py * ny >= 0;
    return toSrgb(onFacet ? mix(facet0, facet1, t) : mix(base0, base1, t));
  };
  const sideOf = (x: number, y: number): boolean => (x - centre) * nx + (y - centre) * ny >= 0;

  const png = new PNG({ width: SIZE, height: SIZE, colorType: 2 });
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // A pixel whose four corners agree is off the edge and costs one sample.
      const corners = [sideOf(x, y), sideOf(x + 1, y), sideOf(x, y + 1), sideOf(x + 1, y + 1)];
      let rgb: [number, number, number];
      if (corners.every((c) => c === corners[0])) {
        rgb = colourAt(x + 0.5, y + 0.5);
      } else {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let sy = 0; sy < SUPER; sy++) {
          for (let sx = 0; sx < SUPER; sx++) {
            const [cr, cg, cb] = colourAt(x + (sx + 0.5) / SUPER, y + (sy + 0.5) / SUPER);
            r += cr;
            g += cg;
            b += cb;
          }
        }
        const n = SUPER * SUPER;
        rgb = [r / n, g / n, b / n];
      }
      const i = (y * SIZE + x) * 4;
      png.data[i] = Math.round(rgb[0] * 255);
      png.data[i + 1] = Math.round(rgb[1] * 255);
      png.data[i + 2] = Math.round(rgb[2] * 255);
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png, { colorType: 2 });
}
