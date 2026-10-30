// 037. A thread icon's wash, rendered once and kept.
//
// The web lays the prism texture over the hue with `mix-blend-mode:
// luminosity`. React Native has no blend modes between views, so Skia draws
// the same picture off screen, once per (thread, hue, size, theme, shape,
// density), and the icon shows the result as an ordinary image. A list of
// fifty threads is fifty images, not fifty canvases.
//
// Everything here may fail or be late, and the icon draws its plain ground
// until a wash arrives: a thread's colour never waits on a texture.

import { Image } from "react-native";
import { BlendMode, ClipOp, Skia, type SkImage } from "@shopify/react-native-skia";
import { washAlpha, washFilter, washKey, washRect, type WashSpec } from "./threadWashMath";
import { onSignedOut } from "./session-end";

export interface WashInput extends WashSpec {
  wash: { x: number; y: number; angle: number };
  ground: string;
}

/** Enough for a long list and Edit thread on top of it, and bounded. */
const KEPT = 400;
const done = new Map<string, string>();
// Keyed by thread id: they go with the session.
onSignedOut(() => done.clear());
let texture: Promise<SkImage | null> | null = null;

function loadTexture(): Promise<SkImage | null> {
  texture ??= (async () => {
    try {
      const { uri } = Image.resolveAssetSource(require("../assets/prism/oil-ground.png"));
      const data = await Skia.Data.fromURI(uri);
      return Skia.Image.MakeImageFromEncoded(data);
    } catch {
      return null;
    }
  })();
  return texture;
}

/** A wash already rendered, or undefined. Synchronous, so a row that has been
 *  on screen before draws washed on its first frame. */
export const washed = (spec: WashSpec): string | undefined => done.get(washKey(spec));

/** Render a wash and keep it. Resolves to a data URI, or null when Skia or
 *  the texture is not there. */
export async function renderWash(input: WashInput): Promise<string | null> {
  const key = washKey(input);
  const kept = done.get(key);
  if (kept) return kept;
  const image = await loadTexture();
  if (!image) return null;
  try {
    const pixels = Math.round(input.size * input.scale);
    const surface = Skia.Surface.Make(pixels, pixels);
    if (!surface) return null;
    const canvas = surface.getCanvas();
    canvas.scale(input.scale, input.scale);

    const size = input.size;
    const radius = input.corner ?? (input.round ? size / 2 : size * 0.3);
    const shape = Skia.RRectXY(Skia.XYWHRect(0, 0, size, size), radius, radius);
    canvas.clipRRect(shape, ClipOp.Intersect, true);

    const ground = Skia.Paint();
    ground.setColor(Skia.Color(input.ground));
    canvas.drawRect(Skia.XYWHRect(0, 0, size, size), ground);

    // The texture, filtered to light and shade and blended as luminosity so
    // it never brings a colour of its own.
    const filter = washFilter(input.theme);
    const lit = Skia.Paint();
    lit.setAntiAlias(true);
    lit.setBlendMode(BlendMode.Luminosity);
    lit.setAlphaf(washAlpha(input.theme));
    lit.setColorFilter(
      Skia.ColorFilter.MakeCompose(
        Skia.ColorFilter.MakeMatrix([filter.then, 0, 0, 0, 0, 0, filter.then, 0, 0, 0, 0, 0, filter.then, 0, 0, 0, 0, 0, 1, 0]),
        Skia.ColorFilter.MakeMatrix(filter.first),
      ),
    );
    const at = washRect(size, input.wash);
    canvas.save();
    canvas.rotate(at.angle, size / 2, size / 2);
    canvas.drawImageRect(image, Skia.XYWHRect(0, 0, image.width(), image.height()), Skia.XYWHRect(at.left, at.top, at.side, at.side), lit);
    canvas.restore();

    surface.flush();
    const uri = `data:image/png;base64,${surface.makeImageSnapshot().encodeToBase64()}`;
    // Kept in the order they were made; past the cap the oldest goes.
    if (done.size >= KEPT) done.delete(done.keys().next().value!);
    done.set(key, uri);
    return uri;
  } catch {
    return null;
  }
}
