// 048 on the phones: each screen reading itself again on a `changed` that
// touches what it shows (P5), the thread page's mark rule and a thread that
// goes away (M2), and a catch-up during a write (P6). The screens render
// nothing in these tests, so their wiring is read from the source; the rules
// under it (`touches`, `reloadFloor`) are `@offload/widgets`', tested there,
// and `useWrites` is run here with React's two hooks stood in.

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { interleave, reloadFloor } from "@offload/widgets";

vi.mock("react", () => ({
  useRef: <T,>(value: T) => ({ current: value }),
  useCallback: <T,>(fn: T) => fn,
}));

const { useWrites } = await import("../lib/optimistic");

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const code = (path: string): string => read(path).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

describe("P5 the shell's hook every screen reads changes through", () => {
  const context = code("components/shell/conversation-context.tsx");
  const hook = context.slice(context.indexOf("export function useChanged("));

  it("reads again under the two-second floor, only for what touches the screen", () => {
    expect(hook).toMatch(/reloadFloor\(\(\) => latest\.current\(\)\)/);
    expect(hook).toMatch(/if \(focused && touches\(changed, kinds, threadId\)\) floor\.ask\(\);/);
    expect(hook).toMatch(/useEffect\(\(\) => floor\.cancel, \[floor\]\);/);
  });

  it("does not read again on mount for a change the screen's own first read already has", () => {
    expect(hook).toMatch(/const seen = useRef\(changed\?\.at \?\? 0\);/);
  });

  it("reads only while the screen is in front: a tab stays mounted behind another, and reads itself on focus", () => {
    expect(hook).toMatch(/const focused = useIsFocused\(\);/);
    expect(hook).toMatch(/seen\.current = changed\.at;\s*if \(focused && touches\(changed, kinds, threadId\)\) floor\.ask\(\);/);
    // Every screen that takes changes reads itself again when it is focused.
    for (const file of [
      "components/screens/MyThreads.tsx",
      "components/screens/Loose.tsx",
      "components/screens/Memories.tsx",
      "components/screens/Activity.tsx",
      "components/screens/Thread.tsx",
      "components/people/PeoplePage.tsx",
      "components/today/TodayScreen.tsx",
    ])
      expect(code(file), file).toMatch(/useFocusEffect\(/);
  });
});

describe("P5 each screen takes the kinds it shows", () => {
  const cases: [string, RegExp][] = [
    // 2026-10-29. My threads also reads again when the order changed on another device.
    ["components/screens/MyThreads.tsx", /useChanged\(\["thread", "removed", "invitation", "order"\], \(\) => void load\(\)\);/],
    ["components/screens/Loose.tsx", /useChanged\(\["thread"\], \(\) => void load\(\)\);/],
    ["components/screens/Memories.tsx", /useChanged\(\["memories"\], \(\) => void load\(\)\);/],
    ["components/people/PeoplePage.tsx", /useChanged\(\["people", "invitation"\], \(\) => void load\(\)\);/],
    ["components/screens/Activity.tsx", /useChanged\(\["activity"\], \(\) => void load\(\)\);/],
    ["components/today/TodayScreen.tsx", /useChanged\(\["thread", "today"\], \(\) => \{\s*reloadDay\(\);\s*loadNeeds\(\);\s*\}\);/],
  ];
  for (const [file, wiring] of cases) {
    it(`${file.split("/").pop()} reads again through its own load`, () => {
      expect(code(file)).toMatch(wiring);
    });
  }

  it("never empties a screen whose live read failed", () => {
    // My threads drew an empty list for a failed read; Today's Needs you lost
    // its cards. Memories and People already keep what they show.
    expect(code("components/screens/MyThreads.tsx")).toMatch(/if \(!page\) \{\s*setGroups\(\(shown\) => shown \?\? \[\]\);\s*return;\s*\}/);
    expect(code("components/today/TodayScreen.tsx")).toMatch(/setNeeds\(\(shown\) => cards \?\? shown \?\? \[\]\)/);
    expect(code("components/screens/Memories.tsx")).toMatch(/setRead\(\(shown\) => nextRead\(shown, fetched\)\)/);
    expect(code("components/people/PeoplePage.tsx")).toMatch(/if \(next\) \{\s*setPage\(next\);/);
    expect(code("components/screens/Activity.tsx")).toMatch(/\} else \{\s*setRows\(\(shown\) => shown \?\? \[\]\);/);
  });

  it("keeps Not in a thread's drawn-ahead rows and answered suggestions across a read taken while a write is out", () => {
    const rows = code("components/loose/useLooseRows.tsx");
    expect(rows).toMatch(/useEffect\(\(\) => \{\s*if \(!writes\.idle\(\)\) return;\s*setDropped\(new Map\(\)\);\s*setUnsuggested\(new Set\(\)\);\s*setDrawn\(new Map\(\)\);\s*\}, \[source\]\);/);
  });
});

describe("M2 the thread page", () => {
  const thread = code("components/screens/Thread.tsx");

  it("reads again on its own thread, today or all, through the marking path while a turn is out", () => {
    expect(thread).toMatch(/useChanged\(\["thread", "today"\], \(\) => void \(turnOut \? catchUp\(\) : load\(true\)\), id\);/);
  });

  it("keeps what it shows when a live read fails, rather than drawing the spinner", () => {
    expect(thread).toMatch(/if \(live && \(!bundle \|\| !page\)\) return;/);
    const catchUp = thread.slice(thread.indexOf("const catchUp = useCallback("), thread.indexOf("const lastFiled"));
    expect(catchUp).toMatch(/if \(!bundle \|\| !page\) return;/);
  });

  it("on its own removal does nothing when no longer shown, and otherwise waits for every sheet and the pinned composer, then leaves with no Undo", () => {
    expect(thread).toMatch(/const removedSeen = useRef\(changed\?\.at \?\? 0\);/);
    expect(thread).toMatch(/if \(!changed \|\| changed\.at === removedSeen\.current \|\| !id \|\| !focused\) return;\s*if \(!changed\.kinds\.includes\("removed"\) \|\| !changed\.removed\?\.includes\(id\)\) return;\s*removedSeen\.current = changed\.at;\s*setGone\(true\);/);
    expect(thread).toMatch(/if \(gone && !sheetOpen && pin === null\) router\.dismissTo\("\/threads"\);/);
    const going = thread.slice(thread.indexOf("if (gone && !sheetOpen"), thread.indexOf("if (gone && !sheetOpen") + 120);
    expect(going).not.toMatch(/notify|Undo/);
  });
});

describe("P6 a catch-up during a write", () => {
  /** A screen's load as the phones write it: read, then drop the read if a
   *  write went out meanwhile, since it would undo what is drawn. */
  function screen() {
    let server = "before";
    const drawn: string[] = [];
    let writes!: ReturnType<typeof useWrites>;
    const load = async (): Promise<void> => {
      const got = server;
      await Promise.resolve();
      if (!writes.idle()) return;
      drawn.push(got);
    };
    writes = useWrites(load);
    return {
      drawn,
      writes,
      load,
      set: (value: string) => {
        server = value;
      },
    };
  }

  it("drops a live read that lands while a write is out, and the reload when the write settles applies it", async () => {
    const page = screen();
    let land!: (ok: boolean) => void;
    const written = page.writes.track(new Promise<boolean>((resolve) => (land = resolve)));
    // Another device changed the thread: the live read runs, and is dropped.
    const floor = reloadFloor(() => void page.load());
    page.set("changed elsewhere");
    floor.ask();
    await Promise.resolve();
    await Promise.resolve();
    expect(page.drawn).toEqual([]);
    // The write settles, and the reload it runs carries the change.
    land(true);
    await written;
    await Promise.resolve();
    await Promise.resolve();
    expect(page.drawn).toEqual(["changed elsewhere"]);
    floor.cancel();
  });

  it("keeps an Undo line in its slot when the catch-up's read no longer has the thing", () => {
    // The line lives in the undo store, outside the screen; a read that
    // drops the row keeps the slot where it was.
    const before = interleave([], ["a", "b", "c"], (id) => id, new Set(["b"]));
    const after = interleave(before.ids, ["a", "c"], (id) => id, new Set(["b"]));
    expect(after.order).toEqual([{ row: "a" }, { slot: "b" }, { row: "c" }]);
  });
});
