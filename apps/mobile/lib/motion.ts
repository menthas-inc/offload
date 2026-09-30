// The design system's motion, for the phones. The values are the tokens in
// `.claude/skills/offload-design/tokens/motion.css`; Reanimated takes numbers
// and curves, not CSS variables.
//
// **Every sheet is dragged, and a dragged sheet moves on a spring** (30
// September 2026): `DragSheet` and the conversation use the pair below, from
// the finger's own speed on release. The timed pair after them is for what is
// not dragged: the plate sliding off the bottom as a screen sheet arrives.
//
// Factories rather than shared builders, because a builder is configured by
// mutation. Reduced motion is a cut, per the readme: ReduceMotion.System.

import { Easing, ReduceMotion, type WithSpringConfig, type WithTimingConfig } from "react-native-reanimated";
import { SHEET_SPRING } from "./sheet";

/** A dragged sheet's spring, open and closed. A close never overshoots the
 *  edge. */
export const openSpring: WithSpringConfig = { ...SHEET_SPRING, reduceMotion: ReduceMotion.System };
export const closeSpring: WithSpringConfig = { ...SHEET_SPRING, overshootClamping: true, reduceMotion: ReduceMotion.System };

/** --duration-sheet */
const SHEET_MS = 340;
/** --duration-slow, for the way out. */
const LEAVE_MS = 280;
/** --ease-entrance */
const ENTRANCE = Easing.bezier(0.16, 1, 0.3, 1);

/** The composer and tabs, sliding off the bottom as a sheet arrives and back
 *  as it goes. A timing rather than a layout animation: the plate stays
 *  mounted, so its field never hands focus to anything on the way out. */
export const plateAway: WithTimingConfig = { duration: SHEET_MS, easing: ENTRANCE, reduceMotion: ReduceMotion.System };
export const plateBack: WithTimingConfig = { duration: LEAVE_MS, easing: ENTRANCE, reduceMotion: ReduceMotion.System };
