// Somebody else's logo.
//
// **Nothing in here is drawn by us.** A third party's corner radius, its
// colours and its letterforms are their specification, and an approximation
// that is ninety percent right is the one kind of wrong people spot instantly
// on a logo they see every day. The design system says the same thing in
// `assets/brands/README.md` and both first-run kits draw a dashed stand-in
// rather than a traced mark.
//
// **This is Google's own file**, served by their asset CDN and committed
// unmodified. Not a redraw from a logo site: those are usually an older version
// of the mark, which is the failure the rule above is about.
//
// **A PNG here and an SVG on web**, and that is a platform fact rather than a
// preference: this app renders icons from generated path data and carries no
// SVG transformer, so Metro cannot turn an `.svg` into something `<Image>` can
// draw. 512px against an 88px box covers every screen density there is.
//
// Google's terms govern how their marks appear in a connect flow: no
// recolouring, no modification, and a minimum clear space. The 88px rounded
// container both kits draw may have to grow to satisfy the clear-space rule,
// which is a question for their current spec rather than one this file can
// answer.
export const googleCalendarMark: number | null = require("../assets/brands/google-calendar.png") as number;
