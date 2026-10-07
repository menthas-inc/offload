// @vitest-environment happy-dom
//
// 040 part D on the web: the map (AC-26 to AC-30). Only kinds with memories
// are drawn, with their labels and counts; under ten memories it opens on
// sentences, and with more on dots; every dot and pill is a button named by
// its sentence and kind, in list order; search fades what does not match;
// a sentence opens the editor and a label flies to its kind.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemoryView } from "@offload/widgets";

const { MemoriesMap } = await import("../src/components/memories/MemoriesMap");

const memory = (id: string, kind: string, text: string, dy = 0, daysAgo = 1): MemoryView => ({
  id,
  kind: kind as MemoryView["kind"],
  text,
  origin: "stated",
  createdAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  updatedAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  changed: false,
  source: { type: "none" },
  place: { dx: 0, dy },
});

let root: Root | null = null;
let host: HTMLDivElement;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

async function mount(memories: MemoryView[], props: Partial<{ query: string; onOpen: (id: string) => void }> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<MemoriesMap memories={memories} query={props.query ?? ""} openId={null} onOpen={props.onOpen ?? (() => {})} onFocusKind={() => {}} />);
  });
}

const named = () => [...host.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"));

describe("the map", () => {
  it("draws only kinds that have memories, each with its label and count", async () => {
    await mount([memory("a", "people", "Their wife is Meera."), memory("b", "about", "They work at Shopify.")]);
    expect(host.querySelectorAll("[data-cloud]")).toHaveLength(2);
    expect(named()).toContain("Go to People, 1");
    expect(named()).toContain("Go to About, 1");
    expect(named().some((n) => n?.startsWith("Go to Things"))).toBe(false);
  });

  it("opens on sentences under ten, each a button named by its sentence and kind, in list order", async () => {
    const onOpen = vi.fn();
    await mount(
      [memory("b", "about", "They work at Shopify.", 0, 1), memory("a", "people", "Their wife is Meera.", 0, 2), memory("c", "people", "Their son is Leo.", 58, 1)],
      { onOpen },
    );
    const pills = [...host.querySelectorAll("[data-memory]")];
    expect(pills.every((p) => p.getAttribute("data-shape") === "sentence")).toBe(true);
    expect(pills.map((p) => p.getAttribute("aria-label"))).toEqual(["Their son is Leo., People", "Their wife is Meera., People", "They work at Shopify., About"]);
    await act(async () => (pills[1] as HTMLElement).click());
    expect(onOpen).toHaveBeenCalledWith("a");
  });

  it("opens on dots when there are many", async () => {
    const many = Array.from({ length: 40 }, (_, i) => memory(`m${i}`, "about", `Fact ${i}.`, i * 58));
    await mount(many);
    const marks = [...host.querySelectorAll("[data-memory]")];
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.every((p) => p.getAttribute("data-shape") === "dot")).toBe(true);
    expect(marks[0]!.getAttribute("aria-label")).toMatch(/^Fact \d+\., About$/);
  });

  it("fades what search does not match, and says so when nothing does", async () => {
    await mount([memory("a", "people", "Their wife is Meera."), memory("b", "about", "They work at Shopify.")], { query: "meera" });
    const dim = [...host.querySelectorAll("[data-memory]")].map((p) => [p.getAttribute("data-memory"), p.hasAttribute("data-dim")]);
    expect(dim).toEqual([
      ["a", false],
      ["b", true],
    ]);
    await act(async () => {
      root!.render(<MemoriesMap memories={[memory("a", "people", "Their wife is Meera.")]} query="zebra" openId={null} onOpen={() => {}} onFocusKind={() => {}} />);
    });
    expect(host.textContent).toContain("Nothing kept says “zebra”.");
  });

  it("zooms with its controls", async () => {
    await mount([memory("a", "people", "Their wife is Meera.")]);
    expect(named()).toContain("Zoom in");
    expect(named()).toContain("Zoom out");
  });
});

describe("040 client review", () => {
  it("draws no mark far off screen, so tabbing never lands on one nobody can see", async () => {
    // Nine memories open at a sentence zoom; a long About column runs off it.
    const near = Array.from({ length: 4 }, (_, i) => memory(`p${i}`, "people", `Near ${i}.`, i * 58));
    const column = Array.from({ length: 5 }, (_, i) => memory(`a${i}`, "about", `Far ${i}.`, (i - 2) * 900));
    await mount([...near, ...column]);
    const drawn = [...host.querySelectorAll("[data-memory]")].map((m) => m.getAttribute("data-memory"));
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.length).toBeLessThan(9);
  });

  it("keeps a drag that leaves the map by capturing the pointer, and only once it is a drag", async () => {
    await mount([memory("a", "people", "Their wife is Meera.")]);
    const map = host.querySelector('[aria-label="Map of memories"]') as HTMLElement;
    const captured: number[] = [];
    map.setPointerCapture = (id: number) => void captured.push(id);
    await act(async () => {
      map.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 7, clientX: 10, clientY: 10, bubbles: true }));
    });
    // A press alone is a tap: capturing it would send the click to the map,
    // not to the label, dot or sentence under it.
    expect(captured).toEqual([]);
    await act(async () => {
      map.dispatchEvent(new PointerEvent("pointermove", { pointerId: 7, clientX: 40, clientY: 40, bubbles: true }));
    });
    expect(captured).toEqual([7]);
  });
});
