// 052 on the phones: a turn's reply drawn in place. The rules a test can reach
// are pure and live in `lib/reply.ts` and `lib/dump.ts`; what the screens draw
// is read from the source, since these tests render nothing.

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: { path: string; init: RequestInit }[] = [];
let answer: { status: number; data: unknown } = { status: 200, data: null };
let held: ((value: { status: number; data: unknown }) => void)[] = [];
let holding = false;

vi.mock("../lib/api", () => ({
  send: (path: string, init: RequestInit = {}) => {
    calls.push({ path, init });
    if (holding) return new Promise((resolve) => held.push(resolve));
    return Promise.resolve(answer);
  },
  request: () => Promise.resolve(null),
  upload: () => Promise.resolve({ status: 200, data: null }),
}));
vi.mock("expo-file-system", () => ({ File: class {} }));

const reply = await import("../lib/reply");
const dump = await import("../lib/dump");

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const code = (path: string): string => read(path).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

beforeEach(() => {
  calls.length = 0;
  held = [];
  holding = false;
  answer = { status: 200, data: null };
});
afterEach(() => {
  holding = false;
});

const row = (id: string, threadId = "th1", threadName: string | null = "Groceries") => ({
  contentId: id,
  threadId,
  threadName,
  threadIcon: null,
  threadHue: null,
  type: "task",
  title: id,
  body: null,
  done: false,
  dueAt: null,
  occursAt: null,
  occursEndAt: null,
  allDay: false,
  rrule: null,
  photo: null,
});
const thread = { id: "th1", name: "Groceries", icon: null, hue: null };
const list = (rows = [row("r1")], marked: string[] = []) => ({
  kind: "list" as const,
  thread,
  openCount: 6,
  rows,
  marked,
  notes: [],
  previous: {},
  truncated: false,
});
const parts = (over: Partial<import("../lib/dump").Reply> = {}): import("../lib/dump").Reply => ({
  slices: [list()],
  also: [],
  pills: [],
  summary: { kind: "new", count: 4 },
  resultAt: "2026-11-17T10:00:00.000Z",
  ...over,
});
const you = (id: string, over: Record<string, unknown> = {}) => ({ id, from: "you" as const, turnId: `t-${id}`, text: "", state: "answered" as const, ...over });

describe("T5.1 the turn footer is retired (AC-1)", () => {
  const conversation = code("components/shell/Conversation.tsx");

  it("draws no Done mark, no thread pill and no source pill", () => {
    expect(conversation).not.toMatch(/function TurnFooter/);
    expect(conversation).not.toMatch(/<TurnFooter/);
    expect(conversation).not.toMatch(/>\s*Done\s*</);
    expect(conversation).not.toMatch(/<ThreadPill/);
  });

  it("draws an answer's rows from the reply's parts, not from `found`", () => {
    expect(conversation).not.toMatch(/<AnswerResults/);
    expect(conversation).toMatch(/<ReplyParts turn=\{sent\}/);
    expect(conversation).toMatch(/<ReplyParts turn=\{turn\}/);
  });
});

describe("T5.0 the list slice is AnswerResult (AC-2, AC-11)", () => {
  const card = code("components/shell/AnswerResult.tsx");

  it("heads the slice with the open count, and draws none at zero", () => {
    expect(reply.headCount(0)).toBeNull();
    expect(reply.headCount(6)).toBe(6);
    expect(card).toMatch(/headCount\(count\)/);
    expect(card).not.toMatch(/\{result\.rows\.length\}/);
  });

  it("marks the turn's rows and draws its notes under Notes", () => {
    expect(card).toMatch(/marked\??: /);
    expect(card).toMatch(/<Mark /);
    expect(card).toMatch(/>\s*Notes\s*</);
  });

  it("reads Not in a thread for a slice with no name", () => {
    const result = reply.asResult({ ...list(), thread: { id: "d", name: null, icon: null, hue: null } });
    expect(result.threadName).toBeNull();
    expect(card).toMatch(/foundHead\(result\.threadName\)/);
  });
});

describe("T5.2 a reply's parts (AC-2, AC-7, AC-8, AC-10, AC-12, AC-22)", () => {
  const parts_ = code("components/shell/ReplyParts.tsx");

  it("draws slices, the Also line, pills, the source line and the undo line, in that order", () => {
    const at = (needle: string) => {
      const index = parts_.indexOf(needle);
      expect(index, needle).toBeGreaterThan(-1);
      return index;
    };
    const order = ["{slices.map(", "<AlsoLine", "<Pills", "<SourceLine", "<TurnLine"].map(at);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("draws three slices at most, and only on a turn that answered or half did", () => {
    const four = parts({ slices: [list(), list(), list(), list()] });
    expect(reply.slicesOf(you("m1", { parts: four }))).toHaveLength(3);
    expect(reply.slicesOf(you("m1", { parts: four, state: "partial" }))).toHaveLength(3);
    expect(reply.slicesOf(you("m1", { parts: four, state: "cancelled" }))).toEqual([]);
    expect(reply.slicesOf(you("m1", { parts: four, state: "failed" }))).toEqual([]);
    expect(reply.slicesOf(you("m1"))).toEqual([]);
  });

  it("words a new thread, a memory group and a slice emptied since from code", () => {
    expect(parts_).toContain("New thread");
    expect(reply.memoriesHead("people")).toBe("Memories, People");
    expect(parts_).toMatch(/memoriesHead\(slice\.memoryKind\)/);
    expect(parts_).toContain("Since removed");
  });

  it("draws Also from alsoLine, each thread a link", () => {
    expect(parts_).toMatch(/alsoLine\(/);
    expect(parts_).toMatch(/accessibilityRole="link"/);
  });

  it("draws pills only on a turn that did not ask, two at most, each a 44 target worded by pillLabel", () => {
    const three = parts({ pills: [{ kind: "date", rowId: "r1" }, { kind: "remind", rowId: "r1" }, { kind: "directions", rowId: "r1" }] });
    expect(reply.pillsOf(you("m1", { parts: three }))).toHaveLength(2);
    expect(reply.pillsOf(you("m1", { parts: three, question: { id: "q" } }))).toEqual([]);
    expect(reply.pillsOf(you("m1", { parts: three, state: "partial" }))).toEqual([]);
    expect(parts_).toMatch(/pillLabel\(pill\)/);
    expect(parts_).toMatch(/minHeight: 44/);
  });

  it("draws sources as one quiet line: the link glyph, tertiary, no border, three then a count", () => {
    const source = parts_.slice(parts_.indexOf("function SourceLine"));
    expect(source).toMatch(/sourceLine\(/);
    expect(source).toMatch(/name="link"/);
    expect(source).toContain("text-text-tertiary");
    expect(source).not.toMatch(/border/);
    expect(source).toMatch(/openLink\(/);
  });

  it("keeps the turn's labels as marks", () => {
    expect(parts_).toMatch(/<LabelMark/);
  });
});

describe("T5.3 the calendar slice (AC-3 to AC-6, AC-26)", () => {
  const grid = code("components/shell/MonthGrid.tsx");
  const slice = code("components/shell/CalendarSlice.tsx");

  it("still: no arrows, no Today and no pan, so the sheet's drag is never fought", () => {
    expect(grid).toMatch(/still\?: boolean/);
    expect(grid).toMatch(/onStep\?: /);
    expect(grid).toMatch(/onToday\?: /);
    // The pan, the arrows and Today are each behind `!still`.
    expect(grid).toMatch(/still \? \(/);
    expect(grid.match(/GestureDetector gesture=\{swipe\}/g)).toHaveLength(1);
    expect(slice).toMatch(/<MonthGrid[\s\S]*?still/);
    expect(slice).not.toMatch(/onStep=/);
  });

  it("draws two weeks inside this week and next, and only the period's weeks", () => {
    const two = reply.gridFor({ from: "2026-11-16", to: "2026-11-29" }, [], "2026-11-17");
    expect(two.weeks.map((w) => w.key)).toEqual(["2026-11-16", "2026-11-23"]);
    const week = reply.gridFor({ from: "2026-11-16", to: "2026-11-22" }, [], "2026-11-17");
    expect(week.weeks.map((w) => w.key)).toEqual(["2026-11-16"]);
    const month = reply.gridFor({ from: "2027-05-01", to: "2027-05-31" }, [], "2026-11-17");
    expect(month.weeks[0]!.days.some((d) => d.iso === "2027-05-01")).toBe(true);
    expect(month.weeks.at(-1)!.days.some((d) => d.iso === "2027-05-31")).toBe(true);
  });

  it("names the weeks away beside the month, from periodLabel", () => {
    expect(slice).toMatch(/periodLabel\(/);
  });

  it("expands an entry in place and says so to assistive technology", () => {
    expect(slice).toMatch(/accessibilityState=\{\{ expanded/);
    expect(slice).not.toMatch(/numberOfLines/);
  });

  it("details: span, place with Directions, thread, and the calendar or not on a calendar", () => {
    const event = {
      id: "e1",
      source: "offload" as const,
      title: "Dentist",
      startsAt: "2026-11-20T15:00:00.000Z",
      endsAt: "2026-11-20T16:00:00.000Z",
      allDay: false,
      mine: true,
      calendarName: null,
      link: null,
      threadId: "th9",
      threadName: "Health",
      threadIcon: null,
      threadHue: null,
      authorName: null,
      location: "Smile clinic",
      place: { lat: 51.5, lng: -0.1, approximate: false },
      calendar: null,
    };
    const details = reply.entryDetails({ kind: "event", id: "e1", item: event }, "2026-11-20", "UTC");
    expect(details.span).toBe("Friday 20 November, 15:00 to 16:00");
    expect(details.place).toEqual({ words: "Smile clinic", url: expect.stringContaining("51.5") });
    expect(details.thread).toEqual({ id: "th9", name: "Health", icon: null, hue: null });
    expect(details.calendar).toBeNull();
    expect(slice).toContain("not on a calendar");
    expect(slice).toMatch(/Directions/);
  });

  it("an event from somebody's calendar shows its title and time and nothing else", () => {
    const theirs = {
      id: "g1", source: "calendar" as const, title: "Standup", startsAt: "2026-11-20T09:00:00.000Z", endsAt: null, allDay: false,
      mine: false, calendarName: "Work", link: null, threadId: null, threadName: null, threadIcon: null, threadHue: null, authorName: "Ana",
    };
    const details = reply.entryDetails({ kind: "event", id: "g1", item: theirs }, "2026-11-20", "UTC");
    expect(details).toMatchObject({ place: null, thread: null, calendar: null, theirs: true });
  });

  it("reads each month and day once a session, three at a time, and only once on screen", async () => {
    holding = true;
    const a = reply.dayOnce("2026-11-20", false);
    expect(reply.dayOnce("2026-11-20", false)).toBe(a);
    void reply.dayOnce("2026-11-21", false);
    void reply.dayOnce("2026-11-22", false);
    void reply.monthOnce("2026-11-16", "2026-11-29");
    await Promise.resolve();
    expect(calls).toHaveLength(3);
    expect(calls[0]!.path).toBe("/v1/today/day?date=2026-11-20");
    held[0]!({ status: 200, data: { date: "2026-11-20" } });
    await a;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toHaveLength(4);
    expect(calls.some((call) => call.path.startsWith("/v1/today/month") && call.path.endsWith("&past=1"))).toBe(true);
    for (const go of held) go({ status: 200, data: null });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(slice).toMatch(/onScreen\(/);
  });

  it("asks for a day gone by with past=1", async () => {
    void reply.dayOnce("2025-01-02", true);
    await Promise.resolve();
    expect(calls.at(-1)!.path).toBe("/v1/today/day?date=2025-01-02&past=1");
  });
});

describe("T5.4 the undo line (AC-17, AC-19, AC-20, AC-21)", () => {
  const start = Date.parse("2026-11-17T10:00:00.000Z");

  it("carries the clock for eight seconds after the result, then stays without it", () => {
    const turn = you("m1", { parts: parts() });
    expect(reply.linePhase(turn, [turn], start + 7_999)).toBe("early");
    expect(reply.linePhase(turn, [turn], start + 8_000)).toBe("late");
  });

  it("starts the clock when the result arrived on this phone, when it did", () => {
    const turn = you("m1", { parts: parts(), arrivedAt: start + 3_000 });
    expect(reply.linePhase(turn, [turn], start + 10_000)).toBe("early");
  });

  it("is retired by the next dump, the moment it is sent", () => {
    const turn = you("m1", { parts: parts() });
    const next = { id: "unsent:9", from: "you" as const, text: "", state: "queued" as const };
    expect(reply.linePhase(turn, [turn, next], start + 1_000)).toBe("retired");
  });

  it("is not drawn for a turn that wrote nothing", () => {
    const turn = you("m1", { parts: parts({ summary: null }) });
    expect(reply.linePhase(turn, [turn], start)).toBeNull();
  });

  it("words the summary with summaryWords, Undo in a 44 target, and Retry on a failure", () => {
    const line = code("components/shell/UndoLine.tsx");
    const turnLine = line.slice(line.indexOf("export function TurnLine"));
    expect(turnLine).toMatch(/summaryWords\(/);
    expect(turnLine).toMatch(/minWidth: 44, minHeight: 44/);
    expect(turnLine).toMatch(/"Retry"/);
    expect(turnLine).toMatch(/<Clock /);
  });

  it("a late Undo keeps the turn and folds its slices to the changed line; a refusal puts the turn back with Retry", () => {
    const context = code("components/shell/conversation-context.tsx");
    const undo = context.slice(context.indexOf("const undoReply = useCallback("));
    expect(undo).toMatch(/undoShown\(/);
    expect(undo).toMatch(/changedLine\(/);
    expect(undo).toMatch(/undoFailed: true/);
    expect(undo).toMatch(/undoAsk: /);
  });

  it("sends a late Undo's yes as confirmed=1", async () => {
    answer = { status: 200, data: { undone: false, confirm: "Ana will see it go" } };
    expect(await dump.undoReply("t1", false)).toEqual({ undone: false, confirm: "Ana will see it go" });
    expect(calls.at(-1)!.path).toBe("/v1/turns/t1/undo");
    answer = { status: 200, data: { undone: true, changed: ["Pay rent"] } };
    expect(await dump.undoReply("t1", true)).toEqual({ undone: true, changed: ["Pay rent"] });
    expect(calls.at(-1)!.path).toBe("/v1/turns/t1/undo?confirmed=1");
  });

  it("draws no plate line or toast for a dump whose reply is in the raised conversation", () => {
    const shell = code("components/shell/Shell.tsx");
    expect(shell).toMatch(/if \(conversation\.raised && turn\?\.parts\?\.summary\) return;/);
    // A dump filed while the conversation was put away keeps 043's plate line.
    expect(shell).toMatch(/form: "plate"/);
  });
});

describe("T5.5 pill taps (AC-12 to AC-15)", () => {
  it("sends the turn and the kind and nothing else", async () => {
    answer = { status: 200, data: { ok: true } };
    expect(await dump.tapPill("t1", "remind")).toBe("ok");
    expect(calls.at(-1)!.path).toBe("/v1/turns/t1/pills");
    expect(JSON.parse(String(calls.at(-1)!.init.body))).toEqual({ kind: "remind" });
    await dump.tapPill("t1", "calendar", true);
    expect(JSON.parse(String(calls.at(-1)!.init.body))).toEqual({ kind: "calendar", undo: true });
  });

  it("hands a calendar that asks first to the pending-write confirm", async () => {
    answer = { status: 200, data: { confirm: "Ana will get an invite", pendingId: "p1" } };
    expect(await dump.tapPill("t1", "calendar")).toEqual({ confirm: "Ana will get an invite", pendingId: "p1" });
    answer = { status: 409, data: null };
    expect(await dump.tapPill("t1", "calendar")).toBe("refused");
  });

  it("opens the row's sheet at its date, the share sheet with the person, and the directions link", () => {
    const parts_ = code("components/shell/ReplyParts.tsx");
    expect(parts_).toMatch(/\[EDIT_PARAM\]: edit/);
    expect(parts_).toMatch(/threadName: where\.name \}, "when"\)/);
    expect(parts_).toMatch(/\[SHARE_PARAM\]: pill\.person/);
    expect(parts_).toMatch(/directionsUrl\(/);
    expect(parts_).toMatch(/form: "under"/);
    const thread = code("components/screens/Thread.tsx");
    expect(thread).toMatch(/params\[EDIT_PARAM\]/);
    expect(thread).toMatch(/preselect=/);
    expect(code("components/shell/RowEditSheet.tsx")).toMatch(/useState<"when" \| "repeats" \| "labels" \| null>\(at \?\? null\)/);
    expect(code("components/people/ShareSheet.tsx")).toMatch(/preselect \? \[preselect\] : \[\]/);
  });

  it("finds the thread a pill's row is in, from the slices", () => {
    const p = parts({ slices: [list([row("r1", "th7", "Admin")])] });
    expect(reply.threadOfRow(p, "r1")).toEqual({ id: "th7", name: "Admin" });
    expect(reply.threadOfRow(p, "nope")).toBeNull();
  });
});

describe("T5.6 states and the change mark (AC-25)", () => {
  it("marks only a result that arrived live on this phone, once", () => {
    expect(reply.markLeft(you("m1"), 1_000)).toBe(0);
    expect(reply.markLeft(you("m1", { arrivedAt: 1_000 }), 1_400)).toBe(1_000);
    expect(reply.markLeft(you("m1", { arrivedAt: 1_000 }), 3_000)).toBe(0);
    const context = code("components/shell/conversation-context.tsx");
    expect(context).toMatch(/arrivedAt: Date\.now\(\)/);
    const tail = context.slice(context.indexOf("function turnsOfTail"), context.indexOf("const UNDO_MS"));
    expect(tail).not.toMatch(/arrivedAt/);
    expect(tail).toMatch(/parts: message\.parts \?\? null/);
  });

  it("ticks a row in a slice where it is drawn", () => {
    const next = reply.withRowDone(parts(), "r1", true);
    const slice = next.slices[0]!;
    expect(slice.kind === "list" && slice.rows[0]!.done).toBe(true);
  });

  it("draws nothing for a calendar whose reads failed, so offline the summary stands alone", () => {
    expect(code("components/shell/CalendarSlice.tsx")).toMatch(/if \(failed\) return null;/);
  });

  it("carries the parts on the poll's answer", async () => {
    answer = { status: 200, data: { state: "answered", reply: null, parts: parts() } };
    expect((await dump.fetchAnswer("m1"))?.parts).toEqual(parts());
  });
});

describe("a moved entry on the calendar slice (AC-9)", () => {
  it("says when it was, from the slice's previous dates", async () => {
    const { wasLine } = await import("../lib/reply");
    expect(wasLine({ occursAt: "2026-11-20T15:00:00Z" }, "Europe/London")).toBe("was Friday 20 November, 15:00");
    expect(wasLine(undefined, "Europe/London")).toBeNull();
  });
});
