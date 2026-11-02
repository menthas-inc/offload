// @vitest-environment happy-dom
//
// 2026-11-02 (the owner). A number in a photo's details is one Call pill in
// the viewer: an anchor to the number, the number on the pill, and nothing
// when the details hold none.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const { CallPill } = await import("../src/components/shell/CallPill");

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("CallPill", () => {
  it("links the number found in the caption, and shows it", () => {
    act(() => root.render(<CallPill text={"Her number is +12125550142.\nText: 212 555 0199"} />));
    const anchor = container.querySelector("a")!;
    expect(anchor.getAttribute("href")).toBe("tel:+12125550142");
    expect(anchor.textContent).toBe("Call +1 212 555 0142");
  });

  it("draws nothing when the number is only in the words read out of the picture", () => {
    act(() => root.render(<CallPill text={"A booking\nText: 212 555 0199"} />));
    expect(container.innerHTML).toBe("");
  });

  it("is in the viewer's caption", () => {
    const viewer = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/components/shell/PhotoViewer.tsx"), "utf8");
    expect(viewer).toMatch(/<CallPill text=\{photo\.body\} \/>/);
  });
});
