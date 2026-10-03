// @vitest-environment happy-dom
//
// 037. A thread's icon on the web: the glyph, the hue and where the wash sits
// all come from the thread, and the mixes are the shared module's.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { THREAD_ICON_MIX, threadSeed, threadWash } from "@offload/widgets";

const { ThreadIcon } = await import("../src/components/ThreadIcon");

const ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function draw(props: Parameters<typeof ThreadIcon>[0]): HTMLElement {
  act(() => root.render(<ThreadIcon {...props} />));
  return host.firstElementChild as HTMLElement;
}

describe("ThreadIcon", () => {
  it("draws the thread's glyph at half its size on its hue", () => {
    const el = draw({ icon: "plane", hue: 6, seed: ID, size: 40 });
    expect(el.style.getPropertyValue("--hue")).toBe("var(--label-6)");
    expect(el.style.getPropertyValue("--k")).toBe(`${40}px`);
    const glyph = el.firstElementChild as HTMLElement;
    expect(glyph.style.maskImage).toContain("/icons/plane.svg");
    expect(glyph.style.width).toBe(`${20}px`);
  });

  it("places the wash by the thread's id", () => {
    const el = draw({ icon: "plane", hue: 6, seed: ID, size: 40 });
    const wash = threadWash(threadSeed(ID));
    expect(el.style.getPropertyValue("--px")).toBe(`${wash.x}%`);
    expect(el.style.getPropertyValue("--py")).toBe(`${wash.y}%`);
    expect(el.style.getPropertyValue("--r")).toBe(`${wash.angle}deg`);
  });

  it("draws lasso for a name it does not know, and never the name itself", () => {
    for (const icon of ["globe-2", 'x") url("//elsewhere', ""]) {
      const glyph = draw({ icon, hue: 1, seed: ID, size: 32 }).firstElementChild as HTMLElement;
      expect(glyph.style.maskImage).toBe('url("/icons/lasso.svg")');
    }
  });

  it("keeps a hue that is not one of the ten on the first", () => {
    expect(draw({ icon: "plane", hue: 42, seed: ID, size: 32 }).style.getPropertyValue("--hue")).toBe("var(--label-1)");
  });

  it("is a circle when asked, and says nothing to a screen reader", () => {
    const el = draw({ icon: "plane", hue: 6, seed: ID, size: 18, round: true });
    expect(el.hasAttribute("data-round")).toBe(true);
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("the stylesheet", () => {
  const css = readFileSync(join(process.cwd(), "src/components/ThreadIcon.module.css"), "utf8");
  const pct = (share: number) => `${Math.round(share * 100)}%`;

  it("mixes what the shared module mixes, so the phones and the web agree", () => {
    for (const share of [THREAD_ICON_MIX.light.ground, THREAD_ICON_MIX.light.glyph, THREAD_ICON_MIX.dark.ground, THREAD_ICON_MIX.dark.glyph, THREAD_ICON_MIX.ring]) {
      expect(css).toContain(pct(share));
    }
    expect(css).toContain("mix-blend-mode: luminosity");
    expect(css).toContain("in oklch");
  });
});
