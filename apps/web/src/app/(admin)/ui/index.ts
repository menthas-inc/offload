// The admin panel's vocabulary (034). Every page is built from these and from
// nothing of its own: no colour in a page file, no second table shape, no
// second way to load. From ui_kits/admin_web/A.jsx.

export { Table, Row, RowLink, Lines, type Col } from "./table";
export { PaneHead, Back, Stats, Stat, Section, Notes, StatusPill, toneOf, Loading, Failed, Empty, useSay, type Tone } from "./chrome";
export { Field, Diff, Confirm, RangePicker, RANGES, useRange, type Range } from "./forms";
export { Plot, ShareBar, type Point } from "./plot";
export { useAdminRead, adminWrite, API, type AdminRead } from "./read";
export { dollars, count, day, moment, clock, outOfBounds } from "./format";
export { PAGES, navFor, landingFor, ownerOnly, type Page, type Role } from "./nav";
