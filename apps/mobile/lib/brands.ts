// Somebody else's logo.
//
// **Nothing in here is drawn by us.** A third party's corner radius, its
// colours and its letterforms are their specification, and an approximation
// that is ninety percent right is the one kind of wrong people spot instantly
// on a logo they see every day. The design system says the same thing in
// `assets/brands/README.md` and both first-run kits draw a dashed stand-in
// rather than a traced mark.
//
// **To turn it on:** put Google's own Calendar product icon at
// `assets/brands/google-calendar.svg`, from their brand resources, and change
// the null below to `require("../assets/brands/google-calendar.svg")`.
//
// Null rather than a require of a file that is not there, because Metro
// resolves requires at bundle time and a missing one is a build failure rather
// than a fallback. Until then the screen draws its stand-in, so a missing asset
// is visible rather than silent.
//
// Google's terms govern how their marks appear in a connect flow, including
// minimum clear space and no recolouring. The 88px rounded container the kits
// draw may have to grow to satisfy the clear-space rule; check before ship.
export const googleCalendarMark: number | null = null;
