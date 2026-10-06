// @vitest-environment happy-dom
//
// 039 AC-1 and AC-2 in the panel: review codes on the Waitlist page. A code is
// made from a dialog, shown once beside a Copy button, listed without the code,
// and revoked after a confirm that names it.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/admin/waitlist", useSearchParams: () => new URLSearchParams() }));

const { ReviewCodes } = await import("../src/app/(admin)/admin/waitlist/ReviewCodes");
const { KIND_LABELS } = await import("../src/app/(admin)/admin/audit/labels");

const LIVE = { id: "c1", note: "App Store review 1.0", uses: 2, maxUses: 5, expiresAt: "2026-11-04T10:00:00.000Z", state: "live" };
const GONE = { id: "c2", note: "Play review", uses: 1, maxUses: 5, expiresAt: "2026-10-01T10:00:00.000Z", state: "revoked" };

type Call = { path: string; init?: RequestInit };
let calls: Call[] = [];

function api(rows: unknown[] = [LIVE, GONE], list = 200) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace(/^.*\/v1\/admin/, "");
      calls.push({ path, init });
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
      if (path === "/codes" && init?.method === "POST") return json({ ...LIVE, id: "c3", note: "Play review 1.0", uses: 0, code: "ABCD-EFGH-JKMN" });
      if (path.endsWith("/revoke")) return json({ status: "revoked" });
      if (path === "/codes") return json({ rows }, list);
      return json({}, 404);
    }),
  );
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function open() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => root.render(<ReviewCodes />));
  await act(async () => {});
  return host;
}

const button = (host: Element, text: string) => [...host.querySelectorAll("button")].find((one) => one.textContent === text);
const click = async (node: Element) => {
  await act(async () => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await act(async () => {});
};
function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("review codes on the Waitlist page", () => {
  it("lists each code by its note, its uses and its state, and never a code", async () => {
    api();
    const host = await open();
    expect(host.textContent).toContain("Review codes");
    expect(host.textContent).toContain("App Store review 1.0");
    expect(host.textContent).toContain("2 of 5");
    expect(host.textContent).toContain("revoked");
    // Revoke is offered on the live one only.
    expect([...host.querySelectorAll("button")].filter((b) => b.textContent === "Revoke")).toHaveLength(1);
  });

  it("says a failed read failed and is not an empty list", async () => {
    api([], 500);
    const host = await open();
    expect(host.textContent).toContain("Couldn't load the review codes.");
    expect(host.textContent).not.toContain("No codes yet.");
  });

  it("makes a code from a dialog with five uses and thirty days, and shows it once with Copy", async () => {
    api([]);
    const host = await open();
    expect(host.textContent).toContain("No codes yet.");
    await click(button(host, "New code")!);
    const dialog = host.querySelector('[role="dialog"]')!;
    const inputs = dialog.querySelectorAll("input");
    expect([...inputs].map((i) => i.value)).toEqual(["", "5", "30"]);
    const make = button(dialog, "Make code") as HTMLButtonElement;
    expect(make.disabled).toBe(true);
    await act(async () => type(inputs[0]!, "Play review 1.0"));
    expect(make.disabled).toBe(false);
    await click(make);

    const post = calls.find((call) => call.path === "/codes" && call.init?.method === "POST")!;
    expect(JSON.parse(String(post.init!.body))).toEqual({ note: "Play review 1.0", maxUses: 5, days: 30 });
    expect(host.textContent).toContain("ABCD-EFGH-JKMN");
    expect(host.textContent).toContain("Shown once.");
    expect(button(host, "Copy")).toBeTruthy();
    await click(button(host, "Done")!);
    expect(host.textContent).not.toContain("ABCD-EFGH-JKMN");
  });

  it("revokes after a confirm that names the code", async () => {
    api();
    const host = await open();
    await click(button(host, "Revoke")!);
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Revoke App Store review 1.0?");
    await click(button(dialog, "Revoke")!);
    expect(calls.some((call) => call.path === "/codes/c1/revoke" && call.init?.method === "POST")).toBe(true);
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Code revoked");
  });

  it("reads both entries in the audit log as phrases", () => {
    expect(KIND_LABELS["code.created"]).toBe("Made a review code");
    expect(KIND_LABELS["code.revoked"]).toBe("Revoked a review code");
  });
});
