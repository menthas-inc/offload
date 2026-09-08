// How far the list behind the plate has scrolled, so the field can slide
// against it.
//
// **The one thing about the field that is not offload's doing.** Everything
// else it does is an arrival: offload filed something and the field says so.
// This moves only when the person moves, and it costs nothing, because the
// value is written and read on the UI thread and never crosses to JS.
//
// **Why a shared value rather than a prop.** The design system's web component
// listens for scroll itself in the capture phase, so no screen has to know the
// field exists. React Native has no equivalent: a `ScrollView` hands its offset
// to whoever asked and nothing else. The plate also lives above the router in
// `Shell`, so the list and the field are in different trees and cannot pass a
// prop between them at all. One shared value, written by whatever is scrolling
// and read by the field, is the smallest thing that spans that gap.
//
// Module scope rather than a context, deliberately: there is exactly one plate
// and one field in the app at a time, so a provider would be ceremony around a
// singleton. If a second plate ever exists, this becomes a context that day.

import { makeMutable } from "react-native-reanimated";

/** Points of horizontal slide, already damped. Clamped to the texture's own
 *  16% overhang by the field, which is the only thing that knows how wide it
 *  is. Horizontal only: the field's profile closes at both vertical edges, and
 *  sliding it up or down would shorten the fade at whichever edge it left. */
export const prismShift = makeMutable(0);

/** The damping the web component uses, kept identical so the two feel the same:
 *  a list travels a long way and the field must not. */
export const PRISM_SCROLL_FACTOR = -0.055;
