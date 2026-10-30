// One icon, drawn from the design system's own path data.
//
// **`Glyph` rather than `Icon`, and the name is the honest part.** The governed
// `Icon` contract is DOM-shaped: it masks an SVG file with `currentColor` and
// takes a `basePath`, which is a URL. React Native has neither, so this cannot
// implement that contract and should not claim to. It takes a `color` instead,
// because there is no `currentColor` to inherit, and every call site passes one
// from `lib/colors.ts`, which reads the tokens. A literal here is what OFF-7
// forbids and the reason that file exists.
//
// The design system owes a React Native icon contract; until it has one this is
// a divergence with an entry rather than a component pretending to be another.
//
// The paths come from `icons.generated.ts`, which `pnpm icons` writes from the
// vendored SVGs. Nothing here is typed by hand.

import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import type { ColorValue } from "react-native";
import { useColors } from "../lib/colors";
import { ICONS, type IconName } from "./icons.generated";

export type { IconName };

interface Props {
  name: IconName | string;
  size?: number;
  color?: ColorValue;
  /** 2026-10-29. Hardened, for a tile's back glyph: a heavier stroke with
   *  square ends and mitred joins, and no rounded corners on a rect. */
  hard?: boolean;
}

export function Glyph({ name, size = 20, color, hard = false }: Props) {
  // The default is resolved here rather than in the parameter list, because a
  // default parameter is evaluated before the hook that would supply it. An
  // omitted colour means "whatever an icon on a well is in this theme", which
  // is a different value in dark.
  const COLOR = useColors();
  const stroke = color ?? COLOR.iconOnWell;
  const shapes = ICONS[name as IconName];
  // An unknown slug draws nothing rather than crashing a screen. The web has a
  // dead-icon check for the same class of mistake; this is the runtime half.
  if (!shapes) return null;

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={hard ? 3 : 2}
      strokeLinecap={hard ? "square" : "round"}
      strokeLinejoin={hard ? "miter" : "round"}
    >
      {shapes.map((shape, i) => {
        if (shape.kind === "path") return <Path key={i} d={shape.d} />;
        if (shape.kind === "circle")
          return <Circle key={i} cx={shape.cx} cy={shape.cy} r={shape.r} />;
        if (shape.kind === "rect")
          return (
            <Rect
              key={i}
              x={shape.x}
              y={shape.y}
              width={shape.width}
              height={shape.height}
              rx={hard ? 0 : shape.rx}
            />
          );
        return <Line key={i} x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} />;
      })}
    </Svg>
  );
}
