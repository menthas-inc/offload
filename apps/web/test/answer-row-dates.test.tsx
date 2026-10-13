// @vitest-environment happy-dom
//
// 2026-10-13 (the owner). An answer's rows can share a title, eight glass
// blowing classes, and the date is what tells them apart: a dated row in an
// answer draws its date under the title, as the kit's meta line.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { AnswerResults } = await import("../src/components/shell/AnswerResult");
type Found = import("../src/lib/dump").FoundResult;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T10:00:00Z"));
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.useRealTimers();
});

const row = (contentId: string, title: string, extra: Record<string, unknown>) => ({
  contentId,
  threadId: "t1",
  threadName: "Home",
  threadIcon: "home",
  threadHue: 1,
  type: "event",
  title,
  body: null,
  done: false,
  photo: null,
  dueAt: null,
  occursAt: null,
  occursEndAt: null,
  allDay: true,
  rrule: null,
  ...extra,
});
const found: Found = {
  threadId: "t1",
  threadName: "Home",
  threadIcon: "home",
  threadHue: 1,
  truncated: false,
  rows: [
    row("c1", "Glass blowing class", { occursAt: "2026-11-30T12:00:00.000Z" }),
    row("c2", "Glass blowing class", { occursAt: "2026-12-07T12:00:00.000Z" }),
    row("c3", "Chiara staying", { occursAt: "2026-11-30T12:00:00.000Z", occursEndAt: "2026-12-01T12:00:00.000Z" }),
    row("c4", "Pay the deposit", { type: "task", dueAt: "2026-10-15T12:00:00.000Z" }),
    row("c5", "Studio website", { type: "link" }),
  ],
} as Found;

describe("an answer's dated rows", () => {
  it("draw their date under the title, in the chip's words, and an undated row draws none", async () => {
    await act(async () => root.render(<AnswerResults found={[found]} />));
    // In the chip's words, which follow the device's locale, so the expected
    // text is formed the same way rather than pinned to one order.
    const dayMonth = (iso: string) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso));
    const metas = [...host.querySelectorAll("[data-meta]")].map((one) => one.textContent);
    const weekday = (iso: string) => new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(new Date(iso));
    expect(metas).toEqual([
      dayMonth("2026-11-30T12:00:00Z"),
      dayMonth("2026-12-07T12:00:00Z"),
      `${dayMonth("2026-11-30T12:00:00Z")} to ${dayMonth("2026-12-01T12:00:00Z")}`,
      // Within a fortnight the chip says Due and the weekday.
      `Due ${weekday("2026-10-15T12:00:00Z")} 15`,
    ]);
    const link = [...host.querySelectorAll("[data-row]")].find((one) => one.textContent?.includes("Studio website"))!;
    expect(link.querySelector("[data-meta]")).toBeNull();
  });
});
