// @vitest-environment happy-dom
//
// Sweep 2026-10-07, S8. Reduced motion is read live on the web: turning it on
// with a tab open stops what moves without a reload.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Point } from "../src/lib/threads";

// A preference the test can flip, installed before anything reads it.
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
    listening: () => listeners.size,
  };
});

const camera = vi.hoisted(() => ({ moveCamera: vi.fn(), panBy: vi.fn() }));

vi.mock("@vis.gl/react-google-maps", async () => {
  const React = await import("react");
  const fakeMap = {
    moveCamera: camera.moveCamera,
    panBy: camera.panBy,
    addListener: () => ({ remove: () => undefined }),
    getZoom: () => 14,
    getCenter: () => ({ lat: () => 38.71, lng: () => -9.14 }),
    getDiv: () => ({ offsetWidth: 460, offsetHeight: 600 }),
  };
  const Pass = ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children);
  return {
    APIProvider: Pass,
    Map: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
    AdvancedMarker: Pass,
    Circle: () => null,
    useMap: () => fakeMap,
    ColorScheme: { LIGHT: "LIGHT", DARK: "DARK", FOLLOW_SYSTEM: "FOLLOW_SYSTEM" },
    AdvancedMarkerAnchorPoint: { CENTER: ["50%", "50%"], BOTTOM_CENTER: ["50%", "100%"] },
  };
});

const { default: ThreadMap } = await import("../src/components/map/ThreadMap");
const { useReducedMotion } = await import("../src/lib/reduced-motion");

const point = (over: Partial<Point>): Point => ({
  key: "c:1",
  source: "row",
  contentId: "1",
  type: "location",
  title: "Time Out Market",
  address: null,
  approximate: false,
  lat: 38.7069,
  lng: -9.1459,
  googlePlaceId: null,
  labelIds: [],
  when: null,
  url: null,
  imageUrl: null,
  authorId: "a1",
  calendarName: null,
  ...over,
});

let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  motion.set(false);
  camera.moveCamera.mockClear();
  camera.panBy.mockClear();
  root = createRoot(document.body.appendChild(document.createElement("div")));
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

describe("the thread map", () => {
  const west = point({ key: "c:w", title: "Belém", lat: 38.71, lng: -9.2 });
  const props = (selected: string | null): React.ComponentProps<typeof ThreadMap> => ({
    points: [point({}), west],
    labels: [],
    pick: { labels: [], none: false },
    pickedNames: [],
    theme: "light",
    selected,
    hovered: null,
    onSelect: () => undefined,
    onOpen: () => undefined,
    failed: false,
    onRetry: () => undefined,
  });

  it("jumps instead of gliding once reduced motion is turned on with it open", async () => {
    await act(async () => root.render(<ThreadMap {...props(null)} />));
    await act(async () => motion.set(true));
    camera.moveCamera.mockClear();
    await act(async () => root.render(<ThreadMap {...props("c:w")} />));
    expect(camera.panBy).not.toHaveBeenCalled();
    expect(camera.moveCamera).toHaveBeenCalledWith({ center: expect.objectContaining({ lat: expect.any(Number) }) });
  });
});

describe("useReducedMotion", () => {
  function Shows() {
    return <p>{useReducedMotion() ? "still" : "moving"}</p>;
  }

  it("follows the preference while mounted and stops listening after", async () => {
    await act(async () => root.render(<Shows />));
    expect(document.body.textContent).toBe("moving");
    await act(async () => motion.set(true));
    expect(document.body.textContent).toBe("still");
    await act(async () => motion.set(false));
    expect(document.body.textContent).toBe("moving");
    act(() => root.unmount());
    expect(motion.listening()).toBe(0);
    root = createRoot(document.body.appendChild(document.createElement("div")));
  });
});
