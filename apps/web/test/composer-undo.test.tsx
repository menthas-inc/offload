// @vitest-environment happy-dom
//
// Undo of a turn the server refused. The bubble left the screen on the press
// and stayed gone while the rows it filed stayed filed, so the turn came back
// on the next load. Now it comes back at once, with the failure and Retry.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer } from "../src/components/shell/Composer";
import { ToastProvider } from "../src/components/shell/Toast";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const sent = {
  id: "m1",
  role: "person",
  text: "dentist on friday",
  state: "seen",
  turnId: "t1",
  found: [],
  waiting: null,
  threads: [],
  sources: [],
  labels: [],
};

let undoAnswer: () => Promise<Response> = async () => new Response("{}", { status: 500 });
vi.stubGlobal("fetch", async (url: string) => {
  if (String(url).endsWith("/undo")) return undoAnswer();
  if (String(url).endsWith("/v1/dumps"))
    return new Response(JSON.stringify({ messageId: "m2", conversationId: "v1", state: "seen", turnId: "t2" }), { status: 200 });
  return new Response(JSON.stringify({ conversationId: "v1", messages: [sent] }), { status: 200 });
});

/** A stream the test answers by hand. */
const streams: FakeSource[] = [];
class FakeSource {
  static CLOSED = 2;
  readyState = 1;
  listeners = new Map<string, (event: { data: string }) => void>();
  constructor() {
    streams.push(this);
  }
  addEventListener(name: string, listener: (event: { data: string }) => void) {
    this.listeners.set(name, listener);
  }
  close() {
    this.readyState = 2;
  }
}
vi.stubGlobal("EventSource", FakeSource);

afterEach(() => {
  document.body.innerHTML = "";
  streams.length = 0;
});

async function answeredThenUndone(): Promise<HTMLElement> {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    createRoot(host).render(
      <ToastProvider>
        <Composer onFiled={() => {}} />
      </ToastProvider>,
    ),
  );
  const answer = {
    state: "answered",
    reply: "Filed it in Health.",
    threads: [{ id: "th1", name: "Health" }],
    sources: [],
    found: [],
  };
  await act(async () => streams[0]!.listeners.get("done")!({ data: JSON.stringify(answer) }));
  expect(host.textContent).toContain("dentist on friday");
  const undo = [...document.querySelectorAll("button")].find((button) => button.textContent === "Undo")!;
  await act(async () => {
    undo.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return host;
}

describe("Undo of a turn the server refused", () => {
  it("puts the turn back and offers Retry", async () => {
    undoAnswer = async () => new Response(JSON.stringify({ undone: false }), { status: 200 });
    const host = await answeredThenUndone();
    expect(host.textContent).toContain("dentist on friday");
    expect(document.body.textContent).toContain("Couldn't put that back");
    expect([...document.querySelectorAll("button")].some((button) => button.textContent === "Retry")).toBe(true);
  });

  it("puts the turn back when the request never left", async () => {
    undoAnswer = () => Promise.reject(new TypeError("offline"));
    const host = await answeredThenUndone();
    expect(host.textContent).toContain("dentist on friday");
    expect(document.body.textContent).toContain("Couldn't put that back");
  });

  it("keeps a dump sent while the refused undo was travelling", async () => {
    let refuse: (value: Response) => void = () => {};
    undoAnswer = () => new Promise<Response>((resolve) => (refuse = resolve));
    const host = await answeredThenUndone();
    expect(host.textContent).not.toContain("dentist on friday");

    const field = host.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "milk and eggs");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host.textContent).toContain("milk and eggs");

    await act(async () => {
      refuse(new Response(JSON.stringify({ undone: false }), { status: 200 }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host.textContent).toContain("dentist on friday");
    expect(host.textContent).toContain("milk and eggs");
    expect(host.textContent!.indexOf("dentist on friday")).toBeLessThan(host.textContent!.indexOf("milk and eggs"));
  });
});

describe("Undo of a turn that forgot something", () => {
  it("names what stayed forgotten when there was no room to put it back", async () => {
    undoAnswer = async () => new Response(JSON.stringify({ undone: true, stayed: ["Their wife is Meera."] }), { status: 200 });
    const host = await answeredThenUndone();
    expect(host.textContent).not.toContain("dentist on friday");
    expect(document.body.textContent).toContain("Still forgotten: Your wife is Meera.");
  });
});
