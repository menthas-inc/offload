// @vitest-environment happy-dom
//
// Finish it on a turn that stopped partway, when the resume is refused. It
// did nothing and said nothing: over the day's cap, offline, or already
// finished from another device. Now the day's line, or a failure with Retry,
// or the turn asked about again.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer } from "../src/components/shell/Composer";
import { DAY_USED } from "../src/components/shell/DayUsed";
import { ToastProvider } from "../src/components/shell/Toast";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const partial = {
  id: "m1",
  role: "person",
  text: "dentist friday and milk",
  state: "partial",
  turnId: "t1",
  found: [],
  waiting: null,
  threads: [],
  sources: [],
  labels: [],
};

let resumeAnswer: () => Promise<Response> = async () => new Response("{}", { status: 500 });
const asked: string[] = [];
vi.stubGlobal("fetch", async (url: string) => {
  asked.push(String(url));
  if (String(url).endsWith("/resume")) return resumeAnswer();
  if (String(url).endsWith("/v1/messages/m1"))
    return new Response(JSON.stringify({ state: "answered", reply: "Filed both." }), { status: 200 });
  return new Response(JSON.stringify({ conversationId: "v1", messages: [partial] }), { status: 200 });
});

const streams: { url: string }[] = [];
class FakeSource {
  static CLOSED = 2;
  readyState = 1;
  constructor(public url: string) {
    streams.push(this);
  }
  addEventListener() {}
  close() {
    this.readyState = 2;
  }
}
vi.stubGlobal("EventSource", FakeSource);

afterEach(() => {
  document.body.innerHTML = "";
  streams.length = 0;
  asked.length = 0;
});

const button = (label: string) => [...document.querySelectorAll("button")].find((one) => one.textContent === label);

async function pressFinish(): Promise<HTMLElement> {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    createRoot(host).render(
      <ToastProvider>
        <Composer onFiled={() => {}} />
      </ToastProvider>,
    ),
  );
  expect(host.textContent).toContain("Didn't finish that one.");
  await act(async () => {
    button("Finish it")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return host;
}

describe("Finish it, refused", () => {
  it("says so and offers Retry when the request fails", async () => {
    resumeAnswer = async () => new Response("{}", { status: 500 });
    await pressFinish();
    expect(document.body.textContent).toContain("Couldn't finish that");
    expect(button("Retry")).toBeDefined();
  });

  it("says so when the request never left", async () => {
    resumeAnswer = () => Promise.reject(new TypeError("offline"));
    await pressFinish();
    expect(document.body.textContent).toContain("Couldn't finish that");
    expect(button("Retry")).toBeDefined();
  });

  it("shows the day's line over the cap", async () => {
    resumeAnswer = async () => new Response(JSON.stringify({ error: "daily_limit", scope: "turns" }), { status: 429 });
    await pressFinish();
    expect(document.body.textContent).toContain(DAY_USED);
  });

  it("asks about the turn again when it is no longer finishable", async () => {
    resumeAnswer = async () => new Response(JSON.stringify({ error: "not_finishable" }), { status: 409 });
    await pressFinish();
    expect(streams.map((one) => one.url).some((url) => url.endsWith("/v1/messages/m1/stream"))).toBe(true);
    expect(document.body.textContent).not.toContain("Couldn't finish that");
  });

  it("asks about the turn again, not Retry, when the message is gone", async () => {
    resumeAnswer = async () => new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    await pressFinish();
    expect(streams.map((one) => one.url).some((url) => url.endsWith("/v1/messages/m1/stream"))).toBe(true);
    expect(document.body.textContent).not.toContain("Couldn't finish that");
  });
});
