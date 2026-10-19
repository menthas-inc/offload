// @vitest-environment happy-dom
//
// 044 T11. The PDF action pills and their per-tap confirm: a label-only pill
// whose accessible name carries the true host, a confirm that names the host
// before anything opens, an anchor that opens it (keyboard operable, the right
// rel), and no pill at all for a scheme that is not http(s).

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const { PdfActions } = await import("../src/components/shell/PdfActions");

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

function render(actions: { label: string; url: string }[]) {
  act(() => root.render(<PdfActions actions={actions} />));
}

const pills = () => [...container.querySelectorAll("button")].filter((b) => b.textContent?.trim());

describe("PdfActions", () => {
  it("draws a pill per action with the true host in its accessible name", () => {
    render([
      { label: "Check in", url: "https://lufthansa.com/ci/LX3K9Q" },
      // userinfo bait: the real host is evil.ru.
      { label: "Manage booking", url: "https://lufthansa.com@evil.ru/manage" },
    ]);
    const labels = pills().map((b) => b.getAttribute("aria-label"));
    expect(labels).toContain("Check in, opens lufthansa.com");
    expect(labels).toContain("Manage booking, opens evil.ru");
  });

  it("shows no destination until a tap, then a confirm naming the host and an anchor to open it", () => {
    render([{ label: "Check in", url: "https://lufthansa.com/ci" }]);
    // The pill shows the label only, no url.
    expect(container.textContent).not.toContain("lufthansa.com/ci");
    const pill = pills()[0]!;
    act(() => pill.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("From the PDF. Open lufthansa.com?");
    const anchor = container.querySelector("a")!;
    expect(anchor.getAttribute("href")).toBe("https://lufthansa.com/ci");
    expect(anchor.getAttribute("target")).toBe("_blank");
    expect(anchor.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("does not offer an action whose scheme is not http or https", () => {
    render([
      { label: "Open", url: "javascript:alert(1)" },
      { label: "Check in", url: "https://lufthansa.com/ci" },
    ]);
    const labels = pills().map((b) => b.textContent?.trim());
    expect(labels).toEqual(["Check in"]);
  });

  it("renders nothing when there are no usable actions", () => {
    render([{ label: "Open", url: "mailto:a@b.com" }]);
    expect(container.textContent).toBe("");
  });
});
