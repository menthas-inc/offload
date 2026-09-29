// The design system's motion, for the phones: sheets rise from the bottom
// edge over --duration-sheet on --ease-entrance, and nothing bounces. The
// values are the tokens in `.claude/skills/offload-design/tokens/motion.css`;
// Reanimated takes numbers and curves, not CSS variables.
//
// A sheet and the composer it replaces move as one: the sheet rises from the
// bottom edge while the composer slides off it on the same beat, and the
// reverse on the way out. They used to fade on two clocks, so the sheet drew
// over a composer that was still leaving.
//
// Factories rather than shared builders, because a builder is configured by
// mutation. Reduced motion is a cut, per the readme: ReduceMotion.System.

import { Easing, FadeIn, FadeOut, ReduceMotion, SlideInDown, SlideOutDown, type WithTimingConfig } from "react-native-reanimated";

/** --duration-sheet */
const SHEET_MS = 340;
/** --duration-slow, for the way out. */
const LEAVE_MS = 280;
/** --ease-entrance */
const ENTRANCE = Easing.bezier(0.16, 1, 0.3, 1);
/** --ease-out */
const OUT = Easing.bezier(0.22, 0.85, 0.24, 1);

export const sheetIn = () => SlideInDown.duration(SHEET_MS).easing(ENTRANCE).reduceMotion(ReduceMotion.System);
export const sheetOut = () => SlideOutDown.duration(LEAVE_MS).easing(OUT).reduceMotion(ReduceMotion.System);

export const scrimIn = () => FadeIn.duration(SHEET_MS).easing(ENTRANCE).reduceMotion(ReduceMotion.System);
export const scrimOut = () => FadeOut.duration(LEAVE_MS).easing(OUT).reduceMotion(ReduceMotion.System);

/** The composer and tabs, sliding off the bottom as a sheet arrives and back
 *  as it goes. A timing rather than a layout animation: the plate stays
 *  mounted, so its field never hands focus to anything on the way out. */
export const plateAway: WithTimingConfig = { duration: SHEET_MS, easing: ENTRANCE, reduceMotion: ReduceMotion.System };
export const plateBack: WithTimingConfig = { duration: LEAVE_MS, easing: ENTRANCE, reduceMotion: ReduceMotion.System };
