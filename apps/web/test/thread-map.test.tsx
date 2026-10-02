// @vitest-environment happy-dom
//
// 030 T4.2, T4.4 to T4.6. The web's map, with Google's React library stubbed
// at its module boundary: what offload draws over it, and when a map is made.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Point } from "../src/lib/threads";

const made = vi.hoisted(() => ({ maps: 0, schemes: [] as string[], onError: null as null | ((e: unknown) => void) }));
const camera = vi.hoisted(() => ({
  moveCamera: vi.fn(),
  panBy: vi.fn(),
  idle: [] as (() => void)[],
  // What the map makes of a requested zoom: as asked, or rounded to a whole
  // step as a raster map does.
  round: false,
  zoom: 14,
}));

vi.mock("@vis.gl/react-google-maps", async () => {
  const React = await import("react");
  const fakeMap = {
    moveCamera: (options: { zoom?: number }) => {
      camera.moveCamera(options);
      if (options.zoom !== undefined) camera.zoom = camera.round ? Math.round(options.zoom) : options.zoom;
    },
    panBy: camera.panBy,
    addListener: (name: string, fn: () => void) => {
      if (name === "idle") camera.idle.push(fn);
      return { remove: () => (camera.idle = camera.idle.filter((f) => f !== fn)) };
    },
    getZoom: () => camera.zoom,
    getCenter: () => ({ lat: () => 38.71, lng: () => -9.14 }),
    getDiv: () => ({ offsetWidth: 460, offsetHeight: 600 }),
  };
  return {
    APIProvider: ({ children, onError }: { children: React.ReactNode; onError?: (e: unknown) => void }) => {
      made.onError = onError ?? null;
      return React.createElement(React.Fragment, null, children);
    },
    Map: ({ children, colorScheme, onClick }: { children: React.ReactNode; colorScheme: string; onClick?: (e: unknown) => void }) => {
      React.useEffect(() => {
        made.maps += 1;
        made.schemes.push(colorScheme);
      }, []);
      return React.createElement(
        "div",
        { "data-testid": "map", "data-scheme": colorScheme, onClick: () => onClick?.({ detail: { latLng: { lat: 10, lng: 10 } } }) },
        children,
      );
    },
    AdvancedMarker: ({ children, onClick, title, clickable }: { children: React.ReactNode; onClick?: () => void; title?: string; clickable?: boolean }) =>
      React.createElement("div", { "data-marker": title ?? "", "data-clickable": String(Boolean(clickable)), onClick: (e: Event) => (e.stopPropagation(), onClick?.()) }, children),
    Circle: ({ center }: { center: { lat: number } }) => React.createElement("i", { "data-circle": String(center.lat) }),
    useMap: () => fakeMap,
    ColorScheme: { LIGHT: "LIGHT", DARK: "DARK", FOLLOW_SYSTEM: "FOLLOW_SYSTEM" },
    AdvancedMarkerAnchorPoint: { CENTER: ["50%", "50%"], BOTTOM_CENTER: ["50%", "100%"] },
  };
});

const { default: ThreadMap } = await import("../src/components/map/ThreadMap");

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
  googlePlaceId: "ChIJ_market",
  labelIds: [],
  when: null,
  url: null,
  imageUrl: null,
  authorId: "a1",
  calendarName: null,
  ...over,
});

const POINTS: Point[] = [
  point({ key: "c:1", title: "Time Out Market", labelIds: ["food"] }),
  point({ key: "c:2", title: "Fado", type: "event", labelIds: ["sat", "food"], lat: 38.7123, lng: -9.1446 }),
  point({ key: "c:3", title: "Casa Alfama", type: "link", approximate: true, labelIds: ["stay"], lat: 38.7113, lng: -9.1301, googlePlaceId: null }),
  point({ key: "e:9", source: "calendar", contentId: null, title: "Standup", type: "event", lat: 38.75, lng: -9.15, calendarName: "Work" }),
];
const LABELS = [
  { id: "food", colour: 5 },
  { id: "stay", colour: 1 },
  { id: "sat", colour: 4 },
];

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  made.maps = 0;
  made.schemes = [];
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

type Props = React.ComponentProps<typeof ThreadMap>;
const base = (over: Partial<Props> = {}): Props => ({
  points: POINTS,
  labels: LABELS,
  pick: { labels: [], none: false },
  pickedNames: [],
  theme: "light",
  selected: null,
  hovered: null,
  onSelect: () => undefined,
  onOpen: () => undefined,
  failed: false,
  onRetry: () => undefined,
  ...over,
});

const render = async (props: Props) => act(async () => root.render(<ThreadMap {...props} />));

describe("what offload draws over the map (AC-15)", () => {
  it("draws a point per spot, a circle per area, and its fill from the thread's label order", async () => {
    await render(base());
    const markers = [...host.querySelectorAll("[data-marker]")].map((m) => m.getAttribute("data-marker"));
    expect(markers).toEqual(expect.arrayContaining(["Time Out Market, place", "Fado, event", "Standup, event"]));
    expect(host.querySelectorAll("[data-circle]")).toHaveLength(1);
    const fado = host.querySelector('[data-marker="Fado, event"] [data-point]') as HTMLElement;
    expect(fado.style.getPropertyValue("--a")).toBe("var(--label-5)");
    expect(fado.style.getPropertyValue("--b")).toBe("var(--label-4)");
    expect(fado.getAttribute("data-shape")).toBe("square");
    const plain = host.querySelector('[data-marker="Standup, event"] [data-point]') as HTMLElement;
    expect(plain.style.getPropertyValue("--a")).toBe("var(--text-primary)");
  });

  it("hides a calendar's event and unpicked rows under a pick, and says so when nothing is left", async () => {
    await render(base({ pick: { labels: ["food"], none: false }, pickedNames: ["Food"] }));
    const markers = [...host.querySelectorAll("[data-marker]")].map((m) => m.getAttribute("data-marker"));
    expect(markers).not.toContain("Standup, event");
    expect(host.querySelectorAll("[data-circle]")).toHaveLength(0);
    await render(base({ pick: { labels: ["none-here"], none: false }, pickedNames: ["Shopping"] }));
    expect(host.textContent).toContain("Nothing under Shopping on the map.");
    await render(base({ pick: { labels: ["x", "y"], none: false }, pickedNames: ["Stay", "Food"] }));
    expect(host.textContent).toContain("Nothing under Stay and Food on the map.");
    await render(base({ points: [POINTS[1]!], pick: { labels: [], none: true }, pickedNames: [] }));
    expect(host.textContent).toContain("Nothing without a label on the map.");
  });

  it("gives an approximate place a named target of its own, so a keyboard reaches it", async () => {
    const onSelect = vi.fn();
    await render(base({ onSelect }));
    const area = host.querySelector('[data-marker="Casa Alfama, link"]') as HTMLElement;
    expect(area).not.toBeNull();
    await act(async () => area.click());
    expect(onSelect).toHaveBeenCalledWith("c:3");
  });
});

describe("one map, made once (AC-21, AC-30)", () => {
  it("is not made again for a pick, a hover or a pick of a point", async () => {
    await render(base());
    await render(base({ pick: { labels: ["food"], none: false } }));
    await render(base({ hovered: "c:1", selected: "c:1" }));
    expect(made.maps).toBe(1);
  });

  it("follows the system when the setting does, and is made once more when the setting changes", async () => {
    await render(base({ theme: "system" }));
    expect(made.schemes).toEqual(["FOLLOW_SYSTEM"]);
    await render(base({ theme: "dark" }));
    expect(made.schemes).toEqual(["FOLLOW_SYSTEM", "DARK"]);
  });
});

describe("the opening fit (AC-19)", () => {
  it("steps out to the whole zoom below when the map rounds a fractional one in", async () => {
    camera.moveCamera.mockClear();
    camera.round = true;
    try {
      await render(base());
      const zooms = camera.moveCamera.mock.calls.map((c) => c[0].zoom).filter((z) => z !== undefined);
      expect(zooms).toHaveLength(2);
      expect(zooms[1]).toBe(Math.floor(zooms[0]));
    } finally {
      camera.round = false;
    }
  });

  it("fits again once the map is first idle, since a map still loading its style rounds the zoom", async () => {
    camera.moveCamera.mockClear();
    camera.idle = [];
    await render(base());
    expect(camera.moveCamera).toHaveBeenCalledTimes(1);
    const first = camera.moveCamera.mock.calls[0]![0];
    await act(async () => camera.idle.forEach((f) => f()));
    expect(camera.moveCamera).toHaveBeenCalledTimes(2);
    expect(camera.moveCamera.mock.calls[1]![0]).toEqual(first);
    await act(async () => camera.idle.forEach((f) => f()));
    expect(camera.moveCamera).toHaveBeenCalledTimes(2);
  });
});

describe("the callout (AC-17, AC-24)", () => {
  it("opens on a point, with Directions to Google Maps and Open", async () => {
    const onSelect = vi.fn();
    await render(base({ onSelect }));
    await act(async () => (host.querySelector('[data-marker="Time Out Market, place"]') as HTMLElement).click());
    expect(onSelect).toHaveBeenCalledWith("c:1");

    const onOpen = vi.fn();
    await render(base({ selected: "c:1", onOpen }));
    const dialog = host.querySelector('[data-callout]') as HTMLElement;
    expect(dialog.getAttribute("role")).not.toBe("dialog");
    expect(dialog.getAttribute("aria-label")).toBe("Time Out Market");
    const directions = dialog.querySelector("a") as HTMLAnchorElement;
    expect(directions.href).toBe("https://www.google.com/maps/dir/?api=1&destination=38.7069%2C-9.1459&destination_place_id=ChIJ_market");
    expect(directions.target).toBe("_blank");
    expect(directions.rel).toBe("noreferrer noopener");
    const open = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Open") as HTMLButtonElement;
    expect(open.getAttribute("aria-label")).toBe("Open Time Out Market");
    await act(async () => open.click());
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ key: "c:1" }));
  });

  it("keeps a press on the callout from reaching the map, which would close it first", async () => {
    await render(base({ selected: "c:1" }));
    const marker = (host.querySelector("[data-callout]") as HTMLElement).closest("[data-marker]") as HTMLElement;
    expect(marker.getAttribute("data-clickable")).toBe("true");
  });

  it("closes on Escape", async () => {
    const onSelect = vi.fn();
    await render(base({ selected: "c:1", onSelect }));
    const callout = host.querySelector("[data-callout]") as HTMLElement;
    await act(async () => callout.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("moves the map just enough for a picked point's callout to stay inside it", async () => {
    camera.panBy.mockClear();
    const west = point({ key: "c:w", title: "Belém", lat: 38.71, lng: -9.2 });
    await render(base({ points: [...POINTS, west], selected: "c:w" }));
    expect(camera.panBy).toHaveBeenCalledTimes(1);
    expect(camera.panBy.mock.calls[0]![0]).toBeLessThan(0);
    camera.panBy.mockClear();
    const middle = point({ key: "c:m", title: "Rossio", lat: 38.71, lng: -9.14 });
    await render(base({ points: [...POINTS, middle], selected: "c:m" }));
    expect(camera.panBy).not.toHaveBeenCalled();
  });

  it("closes when the map is tapped where nothing is", async () => {
    const onSelect = vi.fn();
    await render(base({ selected: "c:1", onSelect }));
    await act(async () => (host.querySelector('[data-testid="map"]') as HTMLElement).click());
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});

describe("a map that cannot load (AC-29)", () => {
  it("says so with Try again, when Google fails or the points read did", async () => {
    const onRetry = vi.fn();
    await render(base({ failed: true, onRetry }));
    expect(host.textContent).toContain("Couldn't load the map");
    const again = [...host.querySelectorAll("button")].find((b) => b.textContent === "Try again") as HTMLButtonElement;
    await act(async () => again.click());
    expect(onRetry).toHaveBeenCalled();

    await render(base());
    await act(async () => made.onError?.(new Error("auth")));
    expect(host.textContent).toContain("Couldn't load the map");
  });
});
