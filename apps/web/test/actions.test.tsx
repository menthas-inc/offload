// @vitest-environment happy-dom
//
// 044 T11. The PDF action pills and their per-tap confirm: a label-only pill
// whose accessible name carries the true host, a confirm that names the host
// before anything opens, an anchor that opens it (keyboard operable, the right
// rel), and no pill at all for a scheme that is not http(s).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const { Actions } = await import("../src/components/shell/Actions");

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
  act(() => root.render(<Actions actions={actions} />));
}

const pills = () => [...container.querySelectorAll("button")].filter((b) => b.textContent?.trim());

describe("044 Open actions, now drawn by Actions", () => {
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
    render([{ label: "Open", url: "tel:*21*12125550142#" }, { label: "Open", url: "mailto:a@b.co?bcc=x@y.zz" }]);
    expect(container.textContent).toBe("");
  });

  const open = () => act(() => pills()[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  const named = (text: string) =>
    [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

  it("does not offer Remove to a non-author", () => {
    render([{ label: "Check in", url: "https://lufthansa.com/ci" }]);
    open();
    expect(named("Remove")).toBeUndefined();
    expect(named("Cancel")).toBeTruthy();
  });

  it("offers the author Remove in the confirm, and clicking it calls onRemove with the url", () => {
    const removed: string[] = [];
    act(() =>
      root.render(
        <Actions
          actions={[{ label: "Check in", url: "https://lufthansa.com/ci" }]}
          canRemove
          onRemove={(url) => removed.push(url)}
        />
      )
    );
    open();
    // Open still works: the anchor is there with the right rel.
    expect(container.querySelector("a")?.getAttribute("rel")).toBe("noopener noreferrer");
    const remove = named("Remove");
    expect(remove).toBeTruthy();
    act(() => remove!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(removed).toEqual(["https://lufthansa.com/ci"]);
  });

  it("offers no Remove without an onRemove handler, even with canRemove", () => {
    act(() => root.render(<Actions actions={[{ label: "Check in", url: "https://lufthansa.com/ci" }]} canRemove />));
    open();
    expect(named("Remove")).toBeUndefined();
  });
});

// ------------------------------------------------------------------- 050

type Entry = { label: string; url: string; kind?: string; source?: string; sender?: string | null };
function draw(actions: Entry[], extra: Record<string, unknown> = {}) {
  act(() => root.render(<Actions actions={actions as never} {...extra} />));
}
const anchors = () => [...container.querySelectorAll("a")];
const byText = (text: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

describe("050 Call and Email show their destination and open on the tap", () => {
  it("draws a call as a tel link with the label, the formatted number and the phone glyph", () => {
    draw([{ label: "Call Dana", url: "tel:+12125550142", kind: "call", source: "picture" }]);
    const call = anchors()[0]!;
    expect(call.getAttribute("href")).toBe("tel:+12125550142");
    expect(call.textContent).toContain("Call Dana");
    expect(call.textContent).toContain("+1 212 555 0142");
    expect(call.getAttribute("aria-label")).toBe("Call Dana, +1 212 555 0142");
    expect(call.innerHTML).toContain("/icons/phone.svg");
    expect(container.textContent).not.toContain("From the");
  });

  it("draws an email as a mailto link with the address and the mail glyph", () => {
    draw([{ label: "Email the landlord", url: "mailto:ana@flat.co", kind: "email", source: "typed" }]);
    const mail = anchors()[0]!;
    expect(mail.getAttribute("href")).toBe("mailto:ana@flat.co");
    expect(mail.textContent).toContain("ana@flat.co");
    expect(mail.innerHTML).toContain("/icons/mail.svg");
  });

  it("offers Remove beside a call only where the row is edited, and only to the author", () => {
    const removed: string[] = [];
    const call = { label: "Call Dana", url: "tel:+12125550142", kind: "call", source: "typed" };
    draw([call], { canRemove: true, onRemove: (u: string) => removed.push(u) });
    expect(byText("Remove")).toBeUndefined();
    draw([call], { removeHere: true, onRemove: (u: string) => removed.push(u) });
    expect(byText("Remove")).toBeUndefined();
    draw([call], { removeHere: true, canRemove: true, onRemove: (u: string) => removed.push(u) });
    act(() => byText("Remove")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(removed).toEqual(["tel:+12125550142"]);
  });
});

describe("050 Open's confirm names where it came from", () => {
  const confirmFor = (source: string, sender: string | null = null) => {
    act(() => root.render(<></>));
    draw([{ label: "Track parcel", url: "https://dhl.com/t/9", kind: "open", source, sender }]);
    act(() => pills()[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    return container.textContent;
  };

  it("for each source", () => {
    expect(confirmFor("picture")).toContain("From the picture. Open dhl.com?");
    expect(confirmFor("voice")).toContain("From your voice note. Open dhl.com?");
    expect(confirmFor("typed")).toContain("From what you typed. Open dhl.com?");
    expect(confirmFor("mail", "dhl.com")).toContain("From a mail from dhl.com. Open dhl.com?");
    expect(confirmFor("pdf")).toContain("From the PDF. Open dhl.com?");
  });
});

describe("050 Directions from the row's place", () => {
  it("draws Directions only when the place has coordinates", () => {
    act(() => root.render(<Actions actions={null} place={{ lat: 38.7, lng: -9.1 }} />));
    const go = anchors()[0]!;
    expect(go.textContent).toContain("Directions");
    expect(go.getAttribute("href")).toBe("https://www.google.com/maps/dir/?api=1&destination=38.7%2C-9.1");
    expect(go.getAttribute("rel")).toBe("noopener noreferrer");
    expect(go.innerHTML).toContain("/icons/map-pin.svg");
    act(() => root.render(<Actions actions={null} place={{ lat: null, lng: null }} />));
    expect(container.textContent).toBe("");
  });
});

describe("050 the homes", () => {
  const src = (path: string) =>
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src", path), "utf8");

  it("the row draws Actions with its place, the viewer and the conversation draw them too", () => {
    expect(src("components/panes/ContentRowView.tsx")).toMatch(/<Actions[\s\S]*?actions=\{row\.actions\}[\s\S]*?place=\{row\.place\}/);
    expect(src("components/shell/PhotoViewer.tsx")).toMatch(/<Actions actions=\{row\?\.actions\}/);
    const composer = src("components/shell/Composer.tsx");
    expect(composer).toMatch(/photo\.actions\?\.length \? \(\s*<Actions actions=\{photo\.actions\}/);
    expect(composer).not.toMatch(/photo\.kind === "pdf" && photo\.actions/);
  });

  it("the edit modal draws them with Remove where the row is edited", () => {
    expect(src("components/panes/EditModal.tsx")).toMatch(/<Actions[\s\S]*?removeHere[\s\S]*?\/>/);
    expect(src("components/panes/Thread.tsx")).toMatch(/<EditModal[\s\S]*?onRemoveAction=\{removeAction\}/);
  });

  it("Today and Loose give the author Remove on the row and in the modal, and the modal draws Directions", () => {
    for (const path of ["components/today/useTodayRows.tsx", "components/loose/useLooseRows.tsx"]) {
      const source = src(path);
      expect(source, path).toMatch(/onRemoveAction: removeAction/);
      expect(source, path).toMatch(/<EditModal[\s\S]*?onRemoveAction=\{removeAction\}/);
    }
    expect(src("components/panes/EditModal.tsx")).toMatch(/place=\{row\.place\}/);
  });

  it("drops an entry whose kind is not its url's", () => {
    act(() => root.render(<Actions actions={[{ label: "Call Dana", url: "https://evil.example/x", kind: "call" } as never]} />));
    expect(container.textContent).toBe("");
  });

  it("no pill on a gallery tile or a search row, and nothing is left of the interim pill", () => {
    for (const path of ["components/panes/LayoutSections.tsx", "components/shell/SearchWindow.tsx"]) {
      expect(src(path)).not.toContain("<Actions");
    }
    for (const path of ["components/panes/ContentRowView.tsx", "components/shell/PhotoViewer.tsx", "components/shell/Composer.tsx"]) {
      expect(src(path)).not.toMatch(/PdfActions|CallPill/);
    }
  });
});

describe("050 egress (T15)", () => {
  it("the pill logs, tracks and fetches nothing, so no destination reaches a report", () => {
    const pill = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/components/shell/Actions.tsx"), "utf8");
    expect(pill).not.toMatch(/console\.|fetch\(|track\(|analytics|report/i);
  });
});
