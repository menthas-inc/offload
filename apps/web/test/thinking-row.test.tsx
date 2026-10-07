// @vitest-environment happy-dom
//
// The thinking row (design 2026-10-07): while a turn runs, the conversation
// shows the Splash mark from the first frame, the model's phrase beside it as
// soon as one exists, and a Stop pill from ten seconds. No bubble, no dots, and
// no line offload made up.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Thinking } from "../src/components/shell/Thinking";

let host: HTMLElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  document.body.innerHTML = "";
});

const draw = (step: string | null, since: number, onStop = () => {}) =>
  act(() => root.render(<Thinking step={step} since={since} onStop={onStop} />));

const phrase = () =>
  [...host.querySelectorAll("[data-phrase]:not([aria-hidden=true])")].map((n) => n.textContent);

describe("the thinking row", () => {
  it("is the mark alone with no phrase, and no bubble or dots", () => {
    draw(null, Date.now());
    expect(host.querySelector("svg[aria-hidden=true]")).not.toBeNull();
    expect(host.querySelectorAll("span:empty:not([aria-live])")).toHaveLength(0);
    expect(phrase()).toEqual([]);
    expect(host.textContent).toBe("");
    // The live region is there before its first phrase, so that phrase is read.
    expect(host.querySelector("[aria-live=polite]")).not.toBeNull();
  });

  it("shows the phrase as soon as it exists, with no wait", () => {
    const since = Date.now();
    draw(null, since);
    draw("Checking your calendar", since);
    act(() => vi.advanceTimersByTime(0));
    expect(phrase()).toEqual(["Checking your calendar"]);
    expect(host.querySelector("[aria-live=polite]")?.textContent).toBe("Checking your calendar");
  });

  it("holds a phrase that lands right after another until the first has been up 400ms", () => {
    const since = Date.now();
    draw("Checking your calendar", since);
    act(() => vi.advanceTimersByTime(100));
    draw("Reading Lisbon trip", since);
    act(() => vi.advanceTimersByTime(200));
    expect(phrase()).toEqual(["Checking your calendar"]);
    act(() => vi.advanceTimersByTime(150));
    expect(phrase()).toEqual(["Reading Lisbon trip"]);
  });

  it("offers Stop from ten seconds and not before", () => {
    const stop = vi.fn();
    const since = Date.now();
    draw(null, since, stop);
    act(() => vi.advanceTimersByTime(9_000));
    expect(host.querySelector("button")).toBeNull();
    act(() => vi.advanceTimersByTime(1_500));
    const button = host.querySelector("button");
    expect(button?.textContent).toBe("Stop");
    act(() => button!.click());
    expect(stop).toHaveBeenCalledOnce();
  });

  it("takes Stop away when the turn it belonged to has no start any more", () => {
    const since = Date.now();
    act(() => root.render(<Thinking step={null} since={since} onStop={() => {}} />));
    act(() => vi.advanceTimersByTime(10_500));
    expect(host.querySelector("button")).not.toBeNull();
    act(() => root.render(<Thinking step={null} since={null} onStop={() => {}} />));
    expect(host.querySelector("button")).toBeNull();
  });

  it("lets a phrase go and leaves the mark alone when the turn has nothing more to say", () => {
    const since = Date.now();
    draw("Checking your calendar", since);
    act(() => vi.advanceTimersByTime(500));
    draw(null, since);
    act(() => vi.advanceTimersByTime(0));
    expect(phrase()).toEqual([]);
    act(() => vi.advanceTimersByTime(400));
    expect(host.querySelectorAll("[data-phrase]")).toHaveLength(0);
  });
});
