// @vitest-environment happy-dom
//
// The sweep of 2026-10-07. The memories map reads reduced motion from the one
// reader the web has, so turning the preference on stops its flights the way
// it stops the rest.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemoryView } from "@offload/widgets";

const reduced = vi.hoisted(() => ({ on: false }));
vi.mock("../src/lib/reduced-motion", () => ({ useReducedMotion: () => reduced.on }));

const { MemoriesMap } = await import("../src/components/memories/MemoriesMap");

const memory: MemoryView = {
  id: "a",
  kind: "people",
  text: "Their wife is Meera.",
  origin: "stated",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  changed: false,
  source: { type: "none" },
  place: { dx: 0, dy: 0 },
};

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  reduced.on = false;
  vi.unstubAllGlobals();
});

describe("the memories map's flights", () => {
  it("animate, and land at once when the preference is turned on", async () => {
    // A frame never comes, so a flight that animates leaves the map where it was.
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const draw = () => root!.render(<MemoriesMap memories={[memory]} query="" openId={null} onOpen={() => {}} onFocusKind={() => {}} />);
    await act(async () => draw());
    const zoomIn = () => host.querySelector('[aria-label="Zoom in"]') as HTMLButtonElement;

    const before = host.innerHTML;
    await act(async () => zoomIn().click());
    expect(host.innerHTML).toBe(before);

    reduced.on = true;
    await act(async () => draw());
    await act(async () => zoomIn().click());
    expect(host.innerHTML).not.toBe(before);
  });
});
