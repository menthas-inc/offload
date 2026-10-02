// @vitest-environment happy-dom
//
// 030 T4.3, T4.4. The thread pane's map frame on the web: the column at 1000px
// and wider, the switch below it, nothing on a pane behind, one map element for
// the life of the pane, and the composer told when the column is there.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_KEY", "web-key");
vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAP_ID", "map-id");

const me = vi.hoisted(() => ({ maps: true }));
vi.mock("../src/lib/use-me", () => ({
  currentMe: () => me,
  onMe: (listener: (m: typeof me) => void) => {
    listener(me);
    return () => undefined;
  },
}));

const reads = vi.hoisted(() => ({
  count: 0,
  answer: { points: [] as unknown[], pending: 0 } as { points: unknown[]; pending: number } | null,
  wait: null as Promise<{ points: unknown[]; pending: number }> | null,
  throws: false,
}));
vi.mock("../src/lib/threads", () => ({
  fetchPoints: async () => {
    reads.count += 1;
    if (reads.throws) throw new TypeError("Failed to fetch");
    return reads.wait ? await reads.wait : reads.answer;
  },
}));

// The pane's width, as the frame's ResizeObserver reports it.
const observers = vi.hoisted(() => [] as ((width: number) => void)[]);
class FakeObserver {
  constructor(private cb: ResizeObserverCallback) {}
  observe() {
    observers.push((width) => this.cb([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver));
  }
  disconnect() {}
  unobserve() {}
}
(globalThis as { ResizeObserver: unknown }).ResizeObserver = FakeObserver;

const { MapFrame, MapSwitch, useThreadMap } = await import("../src/components/map/MapFrame");
const { MapColumnContext } = await import("../src/components/shell/map-column");
const { PaneTop } = await import("../src/components/shell/Panes");

let root: Root;
let host: HTMLElement;
let mounts = 0;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  observers.length = 0;
  mounts = 0;
  reads.count = 0;
  reads.answer = { points: [], pending: 0 };
  reads.wait = null;
  reads.throws = false;
  me.maps = true;
  window.localStorage.clear();
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

function StubMap() {
  // Counted once per mount: a remount is a new map, and Google bills a map.
  React.useEffect(() => {
    mounts += 1;
  }, []);
  return <div data-testid="map" />;
}

function Pane({ hasPoint = true, onSwitch }: { hasPoint?: boolean; onSwitch?: (shown: boolean) => void }) {
  const map = useThreadMap({ threadId: "t1", hasPoint, version: 0 });
  onSwitch?.(map.showSwitch);
  return (
    <>
      {map.showSwitch ? <MapSwitch view={map.view} onChange={map.setView} /> : null}
      <MapFrame state={map} map={() => <StubMap />} chips={<span data-testid="chips" />}>
        <div data-testid="list" />
      </MapFrame>
    </>
  );
}

const frame = () => host.querySelector("[data-map-frame]") as HTMLElement;
const column = () => host.querySelector("[data-map-column]") as HTMLElement | null;
const width = async (w: number) => act(async () => observers.forEach((o) => o(w)));
const press = async (name: string) =>
  act(async () => (host.querySelector(`[aria-label="${name}"]`) as HTMLButtonElement).click());

async function render(node: React.ReactNode) {
  await act(async () => root.render(node));
}

describe("the column and the switch (AC-14)", () => {
  it("draws the column with no switch on a wide pane, and the switch on a narrow one", async () => {
    let shown = false;
    await render(<Pane onSwitch={(s) => (shown = s)} />);
    await width(1200);
    expect(frame().dataset["layout"]).toBe("split");
    expect(column()).not.toBeNull();
    expect(shown).toBe(false);
    await width(900);
    expect(frame().dataset["layout"]).toBe("list");
    expect(shown).toBe(true);
  });

  it("does not flip between 984 and 1016", async () => {
    await render(<Pane />);
    await width(1000);
    expect(frame().dataset["layout"]).toBe("list");
    await width(1016);
    expect(frame().dataset["layout"]).toBe("split");
    await width(990);
    expect(frame().dataset["layout"]).toBe("split");
  });

  it("draws neither on a pane behind, nor on a thread with no point, nor with the server's switch off", async () => {
    let shown = true;
    await render(
      <PaneTop.Provider value={false}>
        <Pane onSwitch={(s) => (shown = s)} />
      </PaneTop.Provider>,
    );
    await width(1200);
    expect(column()).toBeNull();
    expect(shown).toBe(false);

    await render(<Pane hasPoint={false} onSwitch={(s) => (shown = s)} />);
    await width(1200);
    expect(column()).toBeNull();
    expect(shown).toBe(false);

    me.maps = false;
    await render(<Pane key="off" onSwitch={(s) => (shown = s)} />);
    await width(900);
    expect(shown).toBe(false);
  });
});

describe("one map for the life of the pane (AC-21)", () => {
  it("makes no map for a thread opened on List, and keeps the same one across Map, List and the column", async () => {
    await render(<Pane />);
    await width(900);
    expect(host.querySelector('[data-testid="map"]')).toBeNull();
    expect(reads.count).toBe(0);

    await press("Map");
    const made = host.querySelector('[data-testid="map"]');
    expect(made).not.toBeNull();
    expect(frame().dataset["layout"]).toBe("map");

    await press("List");
    expect(column()?.hasAttribute("inert")).toBe(true);
    expect(column()?.dataset["hidden"]).toBe("true");
    expect(host.querySelector('[data-testid="map"]')).toBe(made);

    await width(1200);
    expect(column()?.hasAttribute("inert")).toBe(false);
    expect(host.querySelector('[data-testid="map"]')).toBe(made);
    expect(mounts).toBe(1);
  });

  it("keeps the map it made when the pane goes behind or the last point goes, and comes back", async () => {
    function Host({ top, hasPoint }: { top: boolean; hasPoint: boolean }) {
      return (
        <PaneTop.Provider value={top}>
          <Pane hasPoint={hasPoint} />
        </PaneTop.Provider>
      );
    }
    await render(<Host top hasPoint />);
    await width(1200);
    const made = host.querySelector('[data-testid="map"]');
    expect(made).not.toBeNull();
    await render(<Host top={false} hasPoint />);
    expect(column()?.hasAttribute("inert")).toBe(true);
    await render(<Host top hasPoint={false} />);
    await render(<Host top hasPoint />);
    await width(1200);
    expect(host.querySelector('[data-testid="map"]')).toBe(made);
    expect(mounts).toBe(1);
  });

  it("floats the chips over the map on Map only", async () => {
    await render(<Pane />);
    await width(900);
    await press("Map");
    expect(column()?.querySelector('[data-testid="chips"]')).not.toBeNull();
    await width(1200);
    expect(column()?.querySelector('[data-testid="chips"]')).toBeNull();
  });
});

describe("the choice is the device's (AC-13)", () => {
  it("opens on Map when the thread was left on Map", async () => {
    await render(<Pane />);
    await width(900);
    await press("Map");
    act(() => root.unmount());
    root = createRoot(host);
    await render(<Pane />);
    await width(900);
    expect(frame().dataset["layout"]).toBe("map");
  });
});

describe("the points read", () => {
  it("shows the one spinner in the map's place until the points arrive", async () => {
    let answer: (v: { points: unknown[]; pending: number }) => void = () => undefined;
    reads.wait = new Promise((resolve) => (answer = resolve));
    await render(<Pane />);
    await width(900);
    await press("Map");
    expect(host.querySelector('[data-map-loading]')).not.toBeNull();
    await act(async () => answer({ points: [], pending: 0 }));
    expect(host.querySelector('[data-map-loading]')).toBeNull();
    expect(host.querySelector('[data-testid="map"]')).not.toBeNull();
  });

  it("reads again once while places are still being fetched", async () => {
    vi.useFakeTimers();
    try {
      reads.answer = { points: [], pending: 2 };
      await render(<Pane />);
      await width(1200);
      expect(reads.count).toBe(1);
      await act(async () => vi.advanceTimersByTime(3000));
      expect(reads.count).toBe(2);
      await act(async () => vi.advanceTimersByTime(3000));
      expect(reads.count).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats a request that never reached the server as a failed read", async () => {
    reads.throws = true;
    let failed = false;
    function Probe() {
      const map = useThreadMap({ threadId: "t1", hasPoint: true, version: 0 });
      failed = map.failed;
      return <MapFrame state={map} map={() => <StubMap />}><div /></MapFrame>;
    }
    await render(<Probe />);
    await width(1200);
    expect(failed).toBe(true);
    expect(host.querySelector("[data-map-loading]")).toBeNull();
  });

  it("hands a failed read to the map, which says so", async () => {
    reads.answer = null;
    let failed = false;
    function Probe() {
      const map = useThreadMap({ threadId: "t1", hasPoint: true, version: 0 });
      failed = map.failed;
      return <MapFrame state={map} map={() => <StubMap />}><div /></MapFrame>;
    }
    await render(<Probe />);
    await width(1200);
    expect(failed).toBe(true);
    expect(column()).not.toBeNull();
  });
});

describe("the composer kept to the list (AC-14)", () => {
  it("is told while the column is there, and when it goes", async () => {
    const told: boolean[] = [];
    await render(
      <MapColumnContext.Provider value={(on) => told.push(on)}>
        <Pane />
      </MapColumnContext.Provider>,
    );
    await width(1200);
    expect(told.at(-1)).toBe(true);
    await width(900);
    expect(told.at(-1)).toBe(false);
    await width(1200);
    act(() => root.unmount());
    root = createRoot(host);
    expect(told.at(-1)).toBe(false);
  });

  it("ends the composer at the column's edge", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(`${process.cwd()}/src/app/(shell)/composer.module.css`, "utf8");
    expect(css).toMatch(/\.composer\[data-map-column\]\s*\{[^}]*right:\s*var\(--map-column\)/);
    const map = readFileSync(`${process.cwd()}/src/components/map/map.module.css`, "utf8");
    expect(map).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+var\(--map-column\)/);
  });
});
