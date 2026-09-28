// @vitest-environment happy-dom
//
// A screen that reads the week start mounts useAppearance. On a dark page it
// must never write light to the document first: that was a white frame every
// time the edit modal, Timeline or Settings opened.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useAppearance } from "../src/lib/appearance";

function Reads() {
  useAppearance();
  return null;
}

afterEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = "";
});

describe("opening a screen on a dark page", () => {
  it("never paints light before it has read the stored theme", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.setItem("offload:theme", "dark");
    document.documentElement.setAttribute("data-theme", "dark");
    // Every write as it happens: an observer reads the value after the batch,
    // which is dark again by then, and would pass the flash.
    const painted: string[] = [];
    const root = document.documentElement;
    const write = root.setAttribute.bind(root);
    root.setAttribute = (name: string, value: string) => {
      if (name === "data-theme") painted.push(value);
      write(name, value);
    };

    const screen = createRoot(document.body.appendChild(document.createElement("div")));
    await act(async () => screen.render(<Reads />));
    act(() => screen.unmount());
    root.setAttribute = write;

    expect(painted).not.toContain("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
