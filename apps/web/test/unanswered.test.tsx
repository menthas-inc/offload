// @vitest-environment happy-dom
//
// 027 T4.2, AC-29. The web's launch when nothing answers: two states, from
// `navigator.onLine`. Offline waits for the `online` event; a network with no
// answer retries on the shared schedule, pauses while the tab is hidden and
// waits at least as long as a Retry-After. Never the danger colour.

import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Unanswered } from "../src/components/Unanswered";

let root: Root;
let host: HTMLElement;
let online = true;
let hidden = false;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  // A factor of exactly one: the schedule's own 2, 4, 8 and 15 seconds.
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  online = true;
  hidden = false;
  Object.defineProperty(navigator, "onLine", { get: () => online, configurable: true });
  Object.defineProperty(document, "hidden", { get: () => hidden, configurable: true });
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const draw = (props: { retry: () => void; attempt?: number; retryAfter?: number | null }) =>
  act(() => root.render(<Unanswered {...props} />));

const tryAgain = () => [...host.querySelectorAll("button")].find((one) => one.textContent === "Try again")!;

describe("027 AC-29 the web's launch when nothing answers", () => {
  it("says it is offline, and asks again when the connection returns", async () => {
    online = false;
    const retry = vi.fn();
    draw({ retry });
    expect(host.textContent).toContain("You're offline");
    expect(host.textContent).toContain("offload picks up when you're back.");
    act(() => void vi.advanceTimersByTime(60_000));
    expect(retry).not.toHaveBeenCalled();
    online = true;
    act(() => void window.dispatchEvent(new Event("online")));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("says offload is not answering, and tries again on the schedule", async () => {
    const retry = vi.fn();
    draw({ retry, attempt: 0 });
    expect(host.textContent).toContain("offload isn't answering");
    expect(host.textContent).toContain("Trying again.");
    expect(host.textContent).not.toContain("our side");
    act(() => void vi.advanceTimersByTime(1_900));
    expect(retry).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(200));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("waits longer on later attempts", async () => {
    const retry = vi.fn();
    draw({ retry, attempt: 3 });
    act(() => void vi.advanceTimersByTime(14_000));
    expect(retry).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1_100));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("waits at least as long as the server's Retry-After", async () => {
    const retry = vi.fn();
    draw({ retry, attempt: 0, retryAfter: 30 });
    act(() => void vi.advanceTimersByTime(29_000));
    expect(retry).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1_100));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("pauses while the tab is hidden and picks up when it is shown", async () => {
    const retry = vi.fn();
    hidden = true;
    draw({ retry, attempt: 0 });
    act(() => void vi.advanceTimersByTime(60_000));
    expect(retry).not.toHaveBeenCalled();
    hidden = false;
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    act(() => void vi.advanceTimersByTime(2_100));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("offers Try again in both states", async () => {
    const retry = vi.fn();
    draw({ retry });
    act(() => tryAgain().click());
    expect(retry).toHaveBeenCalledTimes(1);
    online = false;
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(host.textContent).toContain("You're offline");
    act(() => tryAgain().click());
    expect(retry).toHaveBeenCalledTimes(2);
  });

  it("never draws in the danger colour", () => {
    const css = readFileSync(`${process.cwd()}/src/components/unanswered.module.css`, "utf8");
    expect(css).not.toContain("--text-danger");
  });
});
