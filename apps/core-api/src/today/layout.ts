// 027 Customize Today: the layout, one small document per account.
//
// The only place its shape is defined. Only a value this schema parsed is
// ever stored; a stored value is resolved against the defaults on every read,
// so a kind added later lands at its default place with no migration. What a
// kind holds is the server's rule and is never part of the document.

import { z } from "zod";

export const NEEDS_PARTS = ["account", "people", "questions", "tips"] as const;
export type NeedsPart = (typeof NEEDS_PARTS)[number];

const part = z.object({ kind: z.enum(NEEDS_PARTS), on: z.boolean() }).strict();
const needsYou = z.object({ kind: z.literal("needs_you"), parts: z.array(part).length(NEEDS_PARTS.length) }).strict();
const day = z.object({ kind: z.literal("day"), on: z.boolean() }).strict();
/** Open in your threads (design 2026-10-07): undated to-dos, a thread a page. */
const openThreads = z.object({ kind: z.literal("open_threads"), on: z.boolean() }).strict();
const section = z.discriminatedUnion("kind", [needsYou, day, openThreads]);

/** The document's shape, for a response; `todayLayout` adds the refusals. */
export const layoutShape = z.object({ version: z.literal(1), sections: z.array(section).min(1).max(3) }).strict();

export type TodayLayout = z.infer<typeof layoutShape>;
type Section = TodayLayout["sections"][number];

export const todayLayout = layoutShape
  .refine((value) => new Set(value.sections.map((one) => one.kind)).size === value.sections.length, "a kind twice")
  .refine(
    (value) =>
      value.sections.every((one) => one.kind !== "needs_you" || new Set(one.parts.map((p) => p.kind)).size === NEEDS_PARTS.length),
    "a part twice",
  )
  .refine((value) => switchesOf(resolveParsed(value)).some(Boolean), "everything off");

/** Default place and switch for every kind, in default order. */
const DEFAULT_SECTIONS: Section[] = [
  { kind: "needs_you", parts: NEEDS_PARTS.map((kind) => ({ kind, on: true })) },
  { kind: "day", on: true },
  { kind: "open_threads", on: true },
];

export const DEFAULT_LAYOUT: TodayLayout = { version: 1, sections: DEFAULT_SECTIONS };

/** A kind the document does not name goes straight after the kind before it
 *  in the default order, wherever that one was moved to. */
function resolveParsed(value: TodayLayout): TodayLayout {
  const sections = [...value.sections];
  DEFAULT_SECTIONS.forEach((fallback, index) => {
    if (sections.some((one) => one.kind === fallback.kind)) return;
    const before = index === 0 ? -1 : sections.findIndex((one) => one.kind === DEFAULT_SECTIONS[index - 1]!.kind);
    sections.splice(before + 1, 0, fallback);
  });
  return { version: 1, sections };
}

function switchesOf(value: TodayLayout): boolean[] {
  return value.sections.flatMap((one) => (one.kind === "needs_you" ? one.parts.map((p) => p.on) : [one.on]));
}

/** What a stored value means now. Never throws: only parsed values are
 *  stored, and anything else reads as the defaults. */
export function resolveLayout(stored: unknown): TodayLayout {
  const parsed = todayLayout.safeParse(stored);
  return parsed.success ? resolveParsed(parsed.data) : DEFAULT_LAYOUT;
}

/** Which Needs you kinds the layout has on. */
export function partsOn(layout: TodayLayout): Set<NeedsPart> {
  const needs = layout.sections.find((one) => one.kind === "needs_you");
  return new Set(needs && needs.kind === "needs_you" ? needs.parts.filter((p) => p.on).map((p) => p.kind) : []);
}

/** What builds before open_threads read as `todayLayout`: they draw every
 *  section that is not Needs you as the day, so it is never sent to them. */
export function legacyLayout(layout: TodayLayout): TodayLayout {
  return { version: 1, sections: layout.sections.filter((one) => one.kind !== "open_threads") };
}

/** Whether open in your threads is switched on. */
export function openThreadsOn(layout: TodayLayout): boolean {
  const found = layout.sections.find((one) => one.kind === "open_threads");
  return found?.kind === "open_threads" ? found.on : true;
}

/** Whether the day is switched on. */
export function dayOn(layout: TodayLayout): boolean {
  const found = layout.sections.find((one) => one.kind === "day");
  return found?.kind === "day" ? found.on : true;
}
