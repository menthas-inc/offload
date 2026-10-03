// 037. The arithmetic of a thread icon's wash, apart from Skia so it can be
// tested: where the texture sits, what its filter is, and what a rendered
// wash is cached by. The design's rule is the web's CSS (`.mk.wash:before`):
// the texture at 220% of a box 30% larger than the icon, placed by percent,
// turned about the centre, greyscaled, then contrast and brightness.

export interface WashRect {
  left: number;
  top: number;
  side: number;
  angle: number;
}

/** The texture's square, in the icon's own points. The box is the icon grown
 *  by 30% a side; `background-position` at p% lines up the point p% across the
 *  texture with the point p% across the box. */
export function washRect(size: number, wash: { x: number; y: number; angle: number }): WashRect {
  const box = size * 1.6;
  const side = box * 2.2;
  const edge = -size * 0.3;
  return {
    left: edge + (box - side) * (wash.x / 100),
    top: edge + (box - side) * (wash.y / 100),
    side,
    angle: wash.angle,
  };
}

const LUMA = [0.2126, 0.7152, 0.0722] as const;

/** The texture's filter as a colour matrix and a brightness applied after it.
 *  Two steps because CSS clamps between `contrast` and `brightness`, and one
 *  matrix cannot. Intercepts are in unit scale, which is what Skia takes: 255
 *  here would be a white square and no error. */
export function washFilter(theme: "light" | "dark"): { first: number[]; then: number } {
  // Light: grayscale(1) contrast(2.2) brightness(1.02).
  // Dark: grayscale(1) invert(1) contrast(2.4) brightness(0.42).
  const contrast = theme === "light" ? 2.2 : 2.4;
  const slope = theme === "light" ? contrast : -contrast;
  const intercept = theme === "light" ? 0.5 - contrast / 2 : contrast + 0.5 - contrast / 2;
  const row = [LUMA[0] * slope, LUMA[1] * slope, LUMA[2] * slope, 0, intercept];
  return {
    first: [...row, ...row, ...row, 0, 0, 0, 1, 0],
    then: theme === "light" ? 1.02 : 0.42,
  };
}

export interface WashSpec {
  seed: number;
  hue: number;
  size: number;
  theme: "light" | "dark";
  round: boolean;
  /** The screen's pixels per point: the wash is rendered at the device's own. */
  scale: number;
}

export const washKey = (spec: WashSpec): string =>
  `${spec.seed}:${spec.hue}:${spec.size}:${spec.theme}:${spec.round ? "o" : "s"}:${spec.scale}`;
