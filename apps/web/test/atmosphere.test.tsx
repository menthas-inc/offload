// @vitest-environment happy-dom
//
// Sweep 2026-10-07, S8. The gate's atmosphere follows reduced motion live: the
// pointer parallax stops when it is turned on, and the flares go back to rest
// rather than staying parked where the pointer last pushed them.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const motion = vi.hoisted(() => {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const list = {
    matches: false,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: (_: string, fn: (event: { matches: boolean }) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (event: { matches: boolean }) => void) => listeners.delete(fn),
  };
  globalThis.window.matchMedia = ((query: string) =>
    query === list.media ? list : { matches: false, media: query, addEventListener() {}, removeEventListener() {} }) as unknown as typeof window.matchMedia;
  return {
    set(matches: boolean) {
      list.matches = matches;
      for (const fn of [...listeners]) fn({ matches });
    },
  };
});

const { Atmosphere } = await import("../src/components/Atmosphere");

// Frames run when the test says so, not on the browser's clock.
let frames = new Map<number, FrameRequestCallback>();
let next = 1;
const flush = (times: number) => {
  for (let i = 0; i < times; i++) {
    const due = frames;
    frames = new Map();
    for (const fn of due.values()) fn(performance.now());
  }
};

let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  motion.set(false);
  frames = new Map();
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
    const id = next++;
    frames.set(id, fn);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  root = createRoot(document.body.appendChild(document.createElement("div")));
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("the drifting atmosphere", () => {
  it("puts the flares back at rest when reduced motion is turned on with it open", async () => {
    await act(async () => root.render(<Atmosphere mode="drift" />));
    const flare = document.querySelector<HTMLElement>("[data-flare]")!;

    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 0, clientY: 0 }));
    flush(20);
    expect(flare.style.getPropertyValue("--fx")).not.toBe("");

    await act(async () => motion.set(true));
    expect(flare.style.getPropertyValue("--fx")).toBe("");
    expect(flare.style.getPropertyValue("--fy")).toBe("");
  });
});
