// @vitest-environment happy-dom
//
// F-P2 on the web: an account memory is stored about the person and read back
// to them, so the map's sentence and its name both say you.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { MemoryView } from "@offload/widgets";

const { MemoriesMap } = await import("../src/components/memories/MemoriesMap");

const memory = (id: string, text: string): MemoryView => ({
  id,
  kind: "about",
  text,
  origin: "stated",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  changed: false,
  source: { type: "none" },
  place: { dx: 0, dy: 0 },
});

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("the map speaks to the person", () => {
  it("draws They are X as You are X", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <MemoriesMap memories={[memory("a", "They are allergic to penicillin.")]} query="" openId={null} onOpen={() => {}} onFocusKind={() => {}} />,
      );
    });
    const pill = host.querySelector("[data-memory]")!;
    expect(pill.textContent).toBe("You are allergic to penicillin.");
    expect(pill.getAttribute("aria-label")).toBe("You are allergic to penicillin., About");
  });
});
