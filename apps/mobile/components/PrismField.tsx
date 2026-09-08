// The prism field: colour on the phones, and the only decoration in the system.
//
// A baked texture held **frozen**. When offload files something the field warps
// for `--prism-run`, eases its clock to a stop over the last `--prism-settle`,
// and freezes again wherever it landed, so no two arrivals leave it the same.
// **Nothing runs at rest**: no timer, no loop, no frame scheduled. That is the
// whole point of the design rather than an optimisation.
//
// It is the change mark in a second place. A row takes a moss ground settling
// over `--duration-mark`; the field takes two seconds of flow. Both say offload
// just did something, and they fire together.
//
// **Where it is allowed.** Two surfaces: inside the bottom plate, and behind
// the gate's lockup. Nowhere else, and never under a scrolling list:
// `--text-tertiary` is exactly 4.5:1 on paper with nothing spare, and every
// row's trailing time uses it.
//
// The design system's own implementation is a canvas (`PrismField.jsx`); this
// is the same field as a `react-native-skia` runtime shader. The flow field,
// the alpha rescale and the veil stops are ports of that file rather than
// re-derivations, so the two stay comparable.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import {
  Canvas,
  Fill,
  ImageShader,
  LinearGradient,
  Rect,
  Shader,
  Skia,
  useImage,
  vec,
  AlphaType,
  ColorType,
  type SkImage,
} from "@shopify/react-native-skia";
import { useColorScheme } from "nativewind";
import { resolved } from "@offload/tokens";

/** The reference buffer the flow field's constants were tuned against.
 *
 *  The canvas implementation draws the texture into a small buffer and warps
 *  that, then scales it up; the softness means the interpolation reads as part
 *  of the effect. Here the shader works in normalised space and multiplies by
 *  this, so the frequencies match whatever the texture's own resolution is. */
const REFERENCE = { band: [256, 140], bloom: [200, 200] } as const;

/** Reads a token as a number, so a value moved in the design system moves here
 *  without a second edit. Never a literal: that is what OFF-7 forbids.
 *
 *  Keyed against the generated map rather than a string, so a token that is
 *  renamed or removed upstream fails to compile instead of silently falling
 *  back to the number written here. */
type TokenName = keyof typeof resolved.light;

function token(name: TokenName, dark: boolean, fallback: number): number {
  const raw = (dark ? resolved.dark : resolved.light)[name] ?? "";
  const value = Number.parseFloat(String(raw));
  return Number.isFinite(value) ? value : fallback;
}

const SKSL = `
uniform shader image;
uniform float2 box;     // the field's own size, in points
uniform float2 ref;     // the reference buffer the constants were tuned in
uniform float2 tex;     // the texture's pixel size
uniform float  t;       // the clock, left wherever the last arrival landed
uniform float  amp;     // --prism-warp, in reference pixels

half4 main(float2 xy) {
  float2 p = xy / box;          // 0..1 across the field
  float2 r = p * ref;           // the space the constants below belong to
  float x = r.x, y = r.y;

  float dx = amp * (sin(y * 0.085 + t * 0.55)
           + 0.62 * sin((x * 0.5 + y * 0.7) * 0.055 - t * 0.42));
  float dy = amp * 0.55 * (cos(x * 0.062 - t * 0.48)
           + 0.5 * cos((x - y) * 0.045 + t * 0.36));

  float2 q = (r + float2(dx, dy)) / ref;
  // Wraps horizontally and clamps vertically, exactly as the canvas does: the
  // texture tiles across but its two ends are the field's own closed edges.
  q.x = fract(q.x);
  q.y = clamp(q.y, 0.0, 1.0);

  return image.eval(q * tex);
}
`;

const effect = Skia.RuntimeEffect.Make(SKSL);

/** Rescale the texture's per-row alpha to a symmetric hump inside the **visible
 *  window**, and flip the band while we are here.
 *
 *  **Not over the whole box**, and that distinction is the one thing this
 *  function exists to get right. What the eye sees is the field multiplied by
 *  what the veil passes, and the veil's lower stop is pinned above the tab
 *  labels at `--prism-veil-reach`. Shaped over the whole box the field's
 *  opening ramp coincides with the veil's and the two multiply into a curve
 *  that opens abruptly, while at the bottom they stagger and the decay smears
 *  about twice as far. On the same window both layers are symmetric about the
 *  same centre, and so is the composite.
 *
 *  The row's existing mean is divided out, which is what makes this independent
 *  of whatever one-directional ramp the bake happened to carry.
 *
 *  **Once, on decode, never per frame.** */
const EDGE = 0.3;

function reprofile(
  image: SkImage,
  limit: number,
  flip: boolean,
): SkImage | null {
  const width = image.width();
  const height = image.height();
  const info = {
    width,
    height,
    // Unpremultiplied on the way in and out: scaling alpha on premultiplied
    // pixels darkens the colour with it, which would read as the texture
    // getting muddier toward both edges rather than fading.
    //
    // **The enums, not the numbers.** These were written as literals with the
    // names in comments and one of them was wrong: `AlphaType.Unpremul` is 3
    // and 2 is `Premul`, so the code asked for exactly the thing the comment
    // above says must not happen. A named import cannot drift from its value.
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  };

  const pixels = image.readPixels(0, 0, info as never) as Uint8Array | null;
  if (!pixels || pixels.length < width * height * 4) return null;

  const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

  const mean = new Float32Array(height);
  let peak = 0;
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < width; x++) sum += pixels[(y * width + x) * 4 + 3]!;
    mean[y] = sum / width;
    if (mean[y]! > peak) peak = mean[y]!;
  }
  if (!peak) return null;

  const lim = limit > 0.2 && limit <= 1 ? limit : 1;
  const out = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    // The band's dense edge has to meet the plate's rounded top, where the veil
    // is lightest, and the bake runs the other way. Flipped here rather than at
    // sample time so it costs nothing per frame.
    const src = flip ? height - 1 - y : y;
    const f = (y + 0.5) / height;
    const g = f / lim;
    // Past the window the field contributes nothing at all, so the tab labels
    // are protected by an absence of colour rather than only by the fill.
    const target =
      g > 1 ? 0 : peak * Math.min(smooth(g / EDGE), smooth((1 - g) / EDGE));
    // Guarded: a row that is nearly empty must not be multiplied up into noise.
    const k = mean[src]! > 2 ? target / mean[src]! : 0;

    for (let x = 0; x < width; x++) {
      const from = (src * width + x) * 4;
      const to = (y * width + x) * 4;
      out[to] = pixels[from]!;
      out[to + 1] = pixels[from + 1]!;
      out[to + 2] = pixels[from + 2]!;
      const a = pixels[from + 3]! * k;
      out[to + 3] = a > 255 ? 255 : a;
    }
  }

  return Skia.Image.MakeImage(
    info as never,
    Skia.Data.fromBytes(out),
    width * 4,
  );
}

export interface PrismFieldProps {
  /** `band` is the plate's and is flipped so its dense edge meets the rounded
   *  top. `bloom` is the gate's and is radial, so it is not flipped. */
  variant?: "band" | "bloom";
  /** Multiplies `--prism-alpha`. 1 means the design's own `--prism-density`. */
  density?: number;
  /** `graded` for a field inside a plate, `none` for the gate where no text
   *  crosses it. There is deliberately no flat option: a flat veil leaves the
   *  field at a sixth of its strength and no density buys that back. */
  veil?: "graded" | "none";
  /** Any change is an arrival. A count of what offload has filed is the
   *  natural one. The first render is not an arrival. */
  pulse?: number | string;
  /** Warps as it mounts, which is what the gate wants: the screen appearing is
   *  the only arrival it has. */
  arriveOnMount?: boolean;
  /** The parallax, which on React Native the scrolling view has to hand over.
   *  The web component listens for scroll itself; here nothing else knows the
   *  field exists, so the value comes in. Horizontal only. */
  shift?: SharedValue<number>;
}

export function PrismField({
  variant = "band",
  density = 1,
  veil = "graded",
  pulse,
  arriveOnMount = false,
  shift,
}: PrismFieldProps) {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === "dark";
  const source = useImage(
    variant === "band"
      ? require("../assets/prism/p2-band-1.webp")
      : require("../assets/prism/p2-bloom-1.webp"),
  );

  const [box, setBox] = useState({ width: 0, height: 0 });
  const [shaped, setShaped] = useState<SkImage | null>(null);
  const [reduce, setReduce] = useState(false);

  // The clock. Held in state rather than a shared value because the shader's
  // uniforms are read on the JS side, and because at rest it never changes.
  const [clock, setClock] = useState(1.2);
  const run = useRef({
    until: 0,
    last: 0,
    frame: 0 as number | ReturnType<typeof requestAnimationFrame>,
    phase: 1.2,
  });

  const warp = token("prism-warp", dark, 11);
  const runMs = token("prism-run", dark, 2000);
  const settleMs = token("prism-settle", dark, 700);
  const alpha =
    token("prism-alpha", dark, 0.36) *
    token("prism-density", dark, 1.4) *
    density;
  const reach = token("prism-veil-reach", dark, 64) / 100;

  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(
      (on) => live && setReduce(on),
    );
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduce,
    );
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  // Once, when the texture is decoded. A failure here falls back to the raw
  // image rather than to nothing: a field with the bake's own ramp is wrong at
  // the edges and still better than a blank plate.
  useEffect(() => {
    if (!source) return;
    setShaped(
      variant === "band" ? (reprofile(source, reach, true) ?? source) : source,
    );
  }, [source, variant, reach]);

  const stop = useCallback(() => {
    if (run.current.frame) {
      cancelAnimationFrame(run.current.frame as number);
      run.current.frame = 0;
    }
  }, []);

  const arrive = useCallback(() => {
    if (reduce) return;
    run.current.until = Date.now() + runMs;
    run.current.last = 0;
    if (run.current.frame) return;

    const step = () => {
      const now = Date.now();
      const left = run.current.until - now;
      if (left <= 0) {
        run.current.frame = 0;
        return;
      }
      // The clock advances by real elapsed time scaled through the settle, so
      // the flow slows to a halt instead of cutting out mid-motion. The phase
      // is left where it lands and never reset, which is why no two arrivals
      // leave the field the same.
      const u = left < settleMs ? left / settleMs : 1;
      const rate = u * u * (3 - 2 * u);
      const dt = Math.min(64, now - (run.current.last || now));
      run.current.last = now;
      run.current.phase += (dt / 1000) * rate;
      setClock(run.current.phase);
      run.current.frame = requestAnimationFrame(step);
    };
    run.current.frame = requestAnimationFrame(step);
  }, [reduce, runMs, settleMs]);

  // Cancel on background: a loop nobody can see is the one thing this design
  // says must not exist.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") stop();
    });
    return () => {
      sub.remove();
      stop();
    };
  }, [stop]);

  const seen = useRef(pulse);
  useEffect(() => {
    if (seen.current === pulse) return;
    seen.current = pulse;
    arrive();
  }, [pulse, arrive]);

  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current || !arriveOnMount || !shaped) return;
    mounted.current = true;
    arrive();
  }, [arriveOnMount, shaped, arrive]);

  const uniforms = useMemo(
    () => ({
      box: [box.width, box.height],
      ref: [...REFERENCE[variant]],
      tex: [shaped?.width() ?? 1, shaped?.height() ?? 1],
      t: clock,
      amp: warp,
    }),
    [box.width, box.height, variant, shaped, clock, warp],
  );

  // The texture is 16% wider than its box either side and the shift is clamped
  // inside that overhang. **Horizontal only**: the profile closes at both
  // edges, so vertical travel would slide a closed end inward and shorten the
  // fade at whichever edge it moved away from.
  const parallax = useAnimatedStyle(() => ({
    transform: [
      { translateX: shift ? Math.max(-26, Math.min(26, shift.value)) : 0 },
    ],
  }));

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height },
    );
  }, []);

  // No fallback: `surface-plate` is a generated token and the map is typed, so
  // its absence is a compile error rather than something to guard at runtime.
  // A literal here is what OFF-7 forbids, and the adherence lint caught it.
  const plate = (dark ? resolved.dark : resolved.light)["surface-plate"];
  const veilTop = token("prism-veil-top", dark, 0.38);
  const veilFull = token("prism-veil-full", dark, 0.86);
  const veilEdge = token("prism-veil-edge", dark, 16) / 100;
  const veilHold = token("prism-veil-hold", dark, 48) / 100;

  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      onLayout={onLayout}
    >
      <Animated.View
        style={[
          // Wider than its box so the parallax has somewhere to go, and no
          // vertical overhang: the profile's closed ends are the field's edges.
          {
            position: "absolute",
            left: "-16%",
            right: "-16%",
            top: 0,
            bottom: 0,
            overflow: "hidden",
          },
          parallax,
        ]}
      >
        {shaped && box.width > 0 && box.height > 0 && effect ? (
          <Canvas style={{ flex: 1, opacity: alpha }}>
            <Fill>
              <Shader source={effect} uniforms={uniforms}>
                <ImageShader
                  image={shaped}
                  fit="fill"
                  rect={{
                    x: 0,
                    y: 0,
                    width: shaped.width(),
                    height: shaped.height(),
                  }}
                  tx="repeat"
                  ty="clamp"
                />
              </Shader>
            </Fill>
          </Canvas>
        ) : null}
      </Animated.View>

      {/* The fill between the field and any text. **Graded, not flat**, and the
          two are one decision: a flat fill leaves the field invisible and a
          thin one takes the tab labels under 4.5:1. Full at both edges and thin
          only across the middle, where the composer pill is opaque anyway. */}
      {veil === "graded" && box.height > 0 ? (
        <Canvas
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        >
          <Rect x={0} y={0} width={box.width} height={box.height}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(0, box.height)}
              positions={[0, veilEdge, veilHold, reach, 1]}
              colors={[
                withAlpha(plate, veilFull),
                withAlpha(plate, veilTop),
                withAlpha(plate, veilTop),
                withAlpha(plate, veilFull),
                withAlpha(plate, veilFull),
              ]}
            />
          </Rect>
        </Canvas>
      ) : null}
    </View>
  );
}

/** `#RRGGBB` plus an alpha, as `#RRGGBBAA`.
 *
 *  The fill is `--surface-plate` in both themes, which is the same token the
 *  plate itself is painted with. If the surface and the veil ever hold
 *  different values the difference shows as a band exactly where the field
 *  should be vanishing: on dark it read as a grey composer against a black tab
 *  strip. One token, so the two cannot disagree. */
function withAlpha(hex: string, alpha: number): string {
  const clean = hex.trim().replace("#", "").slice(0, 6).padStart(6, "0");
  const byte = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${clean}${byte}`;
}
