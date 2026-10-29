// 048 on the phones: the shell's half. `changed` beside `filed`, the bell's
// dot, and a dump sent from another device appearing in this phone's
// conversation (M3). The rules a test can reach are pure and live in
// `lib/live.ts`; the wiring is read from the source, since these tests render
// nothing.

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ AppState: { currentState: "active", addEventListener: () => ({ remove: () => undefined }) } }));
vi.mock("expo/fetch", () => ({ fetch: async () => ({ ok: false, status: 503, body: null }) }));
vi.mock("../lib/api", () => ({ API_URL: "https://api.test", authHeaders: async () => ({}) }));

const { elsewhereOf, outElsewhere, questionsFrom } = await import("../lib/live");

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const code = (path: string): string => read(path).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

const turn = (id: string, turnId: string | undefined, from: "you" | "offload" = "you") => ({ id, turnId, from });

describe("M3 the turns a tail read adds", () => {
  it("adds the tail's turns this screen does not hold, matched on the turn id so its own replies are not drawn twice", () => {
    // The phone builds its live reply as `<messageId>-reply`; the tail has the
    // reply's real id. Both carry the turn's id.
    const shown = [turn("m1", "t1"), turn("m1-reply", "t1", "offload")];
    const tail = [turn("m1", "t1"), turn("r1", "t1", "offload"), turn("m2", "t2"), turn("r2", "t2", "offload")];
    expect(elsewhereOf(shown, tail)).toEqual([turn("m2", "t2"), turn("r2", "t2", "offload")]);
  });

  it("leaves the screen alone when the tail is another conversation", () => {
    expect(elsewhereOf([turn("m1", "t1")], [turn("m9", "t9")])).toBeNull();
  });

  it("leaves a screen holding only a send that never landed alone", () => {
    expect(elsewhereOf([turn("unsent:1", undefined)], [turn("m9", "t9")])).toBeNull();
  });

  it("takes the whole tail onto an empty screen, as a reload would", () => {
    expect(elsewhereOf([], [turn("m9", "t9")])).toEqual([turn("m9", "t9")]);
  });

  it("adds nothing when the screen holds everything", () => {
    expect(elsewhereOf([turn("m1", "t1")], [turn("m1", "t1")])).toEqual([]);
  });
});

describe("M3 a question answered on another device", () => {
  it("takes each held turn's question from the tail, so one answered elsewhere goes", () => {
    const asked = { id: "q1" } as never;
    const shown = [{ ...turn("m1", "t1"), question: asked }, { ...turn("m2", "t2"), question: null }];
    const tail = [{ ...turn("m1", "t1"), question: null }, { ...turn("m2", "t2"), question: asked }];
    expect(questionsFrom(shown, tail).map((one) => one.question)).toEqual([null, asked]);
  });

  it("leaves a turn the tail does not hold as it is", () => {
    const asked = { id: "q1" } as never;
    const shown = [{ ...turn("m1-reply", "t1", "offload"), question: asked }];
    expect(questionsFrom(shown, [])).toEqual(shown);
  });

  it("is in the tail read, for the conversation on screen", () => {
    expect(code("components/shell/conversation-context.tsx")).toMatch(/questionsFrom\(/);
  });
});

describe("M3 a turn from another device that is still out", () => {
  it("is a sent elsewhere turn that has not settled", () => {
    expect(outElsewhere({ from: "you", elsewhere: true, state: "seen" })).toBe(true);
    expect(outElsewhere({ from: "you", elsewhere: true, state: "queued" })).toBe(true);
    expect(outElsewhere({ from: "you", elsewhere: true, state: "answered" })).toBe(false);
    expect(outElsewhere({ from: "you", state: "seen" })).toBe(false);
    expect(outElsewhere({ from: "offload", elsewhere: true, state: "seen" })).toBe(false);
  });
});

describe("P4 the shell holds changed and turnOut beside filed", () => {
  const context = code("components/shell/conversation-context.tsx");

  it("opens the live connection once, and again when the phone is claimed", () => {
    expect(context).toMatch(/let close = openLive\(hear\);/);
    expect(context).toMatch(/onClaimed\(\(\) => \{\s*close\(\);\s*close = openLive\(hear\);\s*\}\)/);
  });

  it("stamps each change for the screens", () => {
    expect(context).toMatch(/setChanged\(\{ \.\.\.changes, at: Date\.now\(\) \}\)/);
    expect(context).toMatch(/changed,\n/);
    expect(context).toMatch(/turnOut,\n/);
  });

  it("re-reads the bell's dot on activity under the floor, through the read that announces to every useMe and redirects nobody", () => {
    expect(context).toMatch(/reloadFloor\(\(\) => void refreshMe\(\)\)/);
    expect(context).toMatch(/if \(touches\(changes, \["activity"\]\)\) bell\.ask\(\);/);
    // The gate is launch's `getMe`; no listener of `refreshMe` redirects.
    for (const file of ["lib/me.ts", "lib/clock.ts", "components/shell/BellDot.tsx"]) expect(code(file)).not.toMatch(/router\.(replace|push)\("\/welcome"/);
  });

  it("reads the conversation's tail on conversation, under the floor", () => {
    expect(context).toMatch(/if \(touches\(changes, \["conversation"\]\)\) tailFloor\.ask\(\);/);
  });

  it("counts a turn of this account out, from this phone or another", () => {
    expect(context).toMatch(/const turnOut = working !== null \|\| writing \|\| turns\.some\(outElsewhere\);/);
  });
});

describe("M3 the conversation on another device", () => {
  const context = code("components/shell/conversation-context.tsx");

  it("waits for this phone's own sends, which the tail could hold before their answer has named them", () => {
    expect(context).toMatch(/await sending\(\s*sendDump\(/);
    expect(context).toMatch(/await sending\(answerQuestion\(/);
    expect(context).toMatch(/if \(outgoing\.current > 0 \|\| stopping\.current\) \{\s*tailMissed\.current = true;/);
  });

  it("appends what the screen lacks as elsewhere, and watches the unsettled ones with the same poll", () => {
    expect(context).toMatch(/elsewhereOf\(shownTurns\.current, tailTurns\)/);
    expect(context).toMatch(/elsewhere: true/);
    expect(context).toMatch(/watch\(one\.id, one\.turnId, Date\.now\(\), true\)/);
  });

  it("never sets writing or working, never offers Undo, never raises the sheet or touches the draft for an elsewhere turn", () => {
    const watch = context.slice(context.indexOf("const watch = useCallback("), context.indexOf("const stop = useCallback("));
    expect(watch).toMatch(/if \(!elsewhere\) \{\s*setWriting\(false\);/);
    expect(watch).toMatch(/if \(!elsewhere && answer\.state === "answered"/);
    expect(watch).toMatch(/if \(!elsewhere\) setWorking\(\{ messageId, turnId, since, step: null \}\);/);
    const tail = context.slice(context.indexOf("latestTail.current = async"), context.indexOf("const sending = useCallback("));
    expect(tail).not.toMatch(/setOpen|springTo|setDraft|setWriting|setWorking|offerUndo|setFocusRequest/);
  });

  it("feeds filed when it settles, flagged, so the open thread marks and the prism stays still", () => {
    expect(context).toMatch(/setFiled\(\{ threadIds: answer\.changed, at: Date\.now\(\), \.\.\.\(elsewhere \? \{ elsewhere: true \} : \{\}\) \}\)/);
    expect(context).toMatch(/if \(filed && !filed\.elsewhere\) pulse\.current = filed\.at;/);
    expect(code("components/shell/Plate.tsx")).toMatch(/const filedAt = raised \? 0 : conversation\.pulseAt;/);
    expect(code("components/shell/Conversation.tsx")).toMatch(/pulse=\{raised \? conversation\.pulseAt : 0\}/);
  });

  it("draws its steps and writing indicator with no Stop", () => {
    const conversation = code("components/shell/Conversation.tsx");
    expect(conversation).toMatch(/<Thinking \/>/);
    expect(conversation).toMatch(/<Thinking elsewhere=\{\{ step: away\.step \?\? null \}\} \/>/);
    const thinking = code("components/shell/Thinking.tsx");
    expect(thinking).toMatch(/const since = elsewhere \? null : \(working\?\.since \?\? null\);/);
  });

  // Owner, 2026-10-29: a failed or partial turn offers its way forward on
  // every device that draws it, and the one that presses it owns the rest.
  it("draws Try again and Finish on its bubble, and a Finish pressed here makes the turn this phone's", () => {
    const conversation = code("components/shell/Conversation.tsx");
    expect(conversation).not.toMatch(/turn\.elsewhere/);
    expect(conversation).not.toMatch(/\{controls \? \(/);
    const finish = code("components/shell/conversation-context.tsx").split("const finish = useCallback(")[1]!.split("const close = end;")[0]!;
    expect(finish).toMatch(/elsewhere: false/);
  });
});
