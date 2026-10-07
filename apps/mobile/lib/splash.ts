// Splash: the mark, animated, while a turn runs. Design 2026-10-07,
// `handoff/APPLY-2026-10-07-thinking.md`.
//
// One clock, 0 to 1 over 3.2 seconds, and every part reads its own keyframes
// off it, so the five stay in step however long the turn runs. The numbers are
// the web's CSS keyframes, in the mark's 24 unit grid. Each frame may carry the
// easing for the segment that starts at it, as CSS does; without one the
// segment eases with CSS's default, `ease`.

/** How long a phrase stays up before the next may replace it, so two that land
 *  together do not flicker. */
export const PHRASE_FLOOR_MS = 400;

/** How long a newly arrived phrase waits before it is shown. */
export function phraseWait(shownAt: number | null, now: number): number {
  return shownAt === null ? 0 : Math.max(0, shownAt + PHRASE_FLOOR_MS - now);
}

export const SPLASH_MS = 3200;

type Bezier = readonly [number, number, number, number];
type Frame = readonly [at: number, value: number, ease?: Bezier];

const EASE: Bezier = [0.25, 0.1, 0.25, 1];
const IN_OUT: Bezier = [0.42, 0, 0.58, 1];
const FALL: Bezier = [0.5, 0, 0.9, 0.4];
const JUMP: Bezier = [0.2, 0.7, 0.4, 1];

/** CSS's cubic-bezier, solved for x by Newton's method then bisection. */
function bezier(e: Bezier, x: number): number {
  "worklet";
  const [x1, y1, x2, y2] = e;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const xAt = (t: number) => ((ax * t + bx) * t + cx) * t;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const dx = (3 * ax * t + 2 * bx) * t + cx;
    const err = xAt(t) - x;
    if (Math.abs(err) < 1e-6) break;
    if (Math.abs(dx) < 1e-6) break;
    t -= err / dx;
  }
  if (Math.abs(xAt(t) - x) > 1e-4) {
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      if (xAt(t) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
  }
  return ((ay * t + by) * t + cy) * t;
}

function track(frames: readonly Frame[], p: number): number {
  "worklet";
  if (p <= frames[0]![0]) return frames[0]![1];
  for (let i = 0; i < frames.length - 1; i++) {
    const [a, from, ease] = frames[i]!;
    const [b, to] = frames[i + 1]!;
    if (p <= b) {
      const t = b === a ? 1 : (p - a) / (b - a);
      return from + (to - from) * bezier(ease ?? EASE, t);
    }
  }
  return frames[frames.length - 1]![1];
}

const DOT_Y: Frame[] = [[0, -5], [0.16, 0, IN_OUT], [0.46, 0, FALL], [0.61, 9], [0.63, 9.6], [1, -5]];
const DOT_SX: Frame[] = [[0, 1], [0.16, 1, IN_OUT], [0.46, 1, FALL], [0.61, 1], [0.63, 1.2], [1, 1]];
const DOT_SY: Frame[] = [[0, 1], [0.16, 1, IN_OUT], [0.46, 1, FALL], [0.61, 1.1], [0.63, 0.5], [1, 1]];
const DOT_O: Frame[] = [[0, 0], [0.16, 1, IN_OUT], [0.61, 1], [0.63, 0], [1, 0]];

const VESSEL_SX: Frame[] = [[0, 1], [0.6, 1], [0.66, 1.06], [0.76, 0.98], [0.84, 1], [1, 1]];
const VESSEL_SY: Frame[] = [[0, 1], [0.6, 1], [0.66, 0.82], [0.76, 1.04], [0.84, 1], [1, 1]];

/** A droplet: hidden until `start`, shown at `on`, out to `peak`, gone at
 *  `end`, then back to rest unseen, as CSS's implicit 100% has it. */
function droplet(start: number, on: number, peak: [number, number, number, number], end: [number, number, number, number]) {
  const [pt, px, py, ps] = peak;
  const [et, ex, ey, es] = end;
  return {
    x: [[0, 0], [start, 0], [on, 0, JUMP], [pt, px], [et, ex], [1, 0]] as Frame[],
    y: [[0, 0], [start, 0], [on, 0, JUMP], [pt, py], [et, ey], [1, 0]] as Frame[],
    s: [[0, 1], [start, 1], [on, 1, JUMP], [pt, ps], [et, es], [1, 1]] as Frame[],
    o: [[0, 0], [start, 0], [on, 1, JUMP], [pt, 1], [et, 0], [1, 0]] as Frame[],
  };
}

const LEFT = droplet(0.61, 0.62, [0.72, -5.5, -8, 1], [0.84, -8, -3, 0.6]);
const RIGHT = droplet(0.61, 0.62, [0.72, 5.5, -7, 1], [0.84, 8, -2, 0.6]);
const CENTRE = droplet(0.62, 0.63, [0.71, 0.5, -10, 0.8], [0.82, 0.5, -5, 0.5]);

export type Drop = { x: number; y: number; s: number; opacity: number };
export type Pose = {
  dot: { y: number; sx: number; sy: number; opacity: number };
  vessel: { sx: number; sy: number };
  left: Drop;
  right: Drop;
  centre: Drop;
};

function drop(d: typeof LEFT, p: number): Drop {
  "worklet";
  return { x: track(d.x, p), y: track(d.y, p), s: track(d.s, p), opacity: track(d.o, p) };
}

/** Every part at a point on the clock, 0 to 1. */
export function pose(p: number): Pose {
  "worklet";
  return {
    dot: { y: track(DOT_Y, p), sx: track(DOT_SX, p), sy: track(DOT_SY, p), opacity: track(DOT_O, p) },
    vessel: { sx: track(VESSEL_SX, p), sy: track(VESSEL_SY, p) },
    left: drop(LEFT, p),
    right: drop(RIGHT, p),
    centre: drop(CENTRE, p),
  };
}

const HIDDEN: Drop = { x: 0, y: 0, s: 1, opacity: 0 };

/** Reduced motion: the mark whole and still. */
export const REST: Pose = {
  dot: { y: 0, sx: 1, sy: 1, opacity: 1 },
  vessel: { sx: 1, sy: 1 },
  left: HIDDEN,
  right: HIDDEN,
  centre: HIDDEN,
};
