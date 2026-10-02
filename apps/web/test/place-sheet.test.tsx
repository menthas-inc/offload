// @vitest-environment happy-dom
//
// 030 T4.5. The place sheet: read-only, offload's own words, the rows that
// exist, and its footer by what the row is.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Point } from "../src/lib/threads";

const { PlaceSheet } = await import("../src/components/map/PlaceSheet");

const point = (over: Partial<Point>): Point => ({
  key: "c:1",
  source: "row",
  contentId: "1",
  type: "event",
  title: "Dinner",
  address: "Time Out Market",
  approximate: false,
  lat: 38.7069,
  lng: -9.1459,
  googlePlaceId: "ChIJ_market",
  labelIds: ["food"],
  when: { at: "2026-10-09T19:00:00Z", endAt: null, allDay: false },
  url: null,
  imageUrl: null,
  authorId: "a1",
  calendarName: null,
  ...over,
});

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

const members = [
  { accountId: "a1", displayName: "Ana", isYou: false },
  { accountId: "me", displayName: "Jo", isYou: true },
];
const labels = [{ id: "food", name: "Food", colour: 5 }];

async function render(p: Point, handlers: Partial<React.ComponentProps<typeof PlaceSheet>> = {}) {
  await act(async () =>
    root.render(
      <PlaceSheet point={p} threadName="Lisbon trip" labels={labels} members={members} onClose={() => undefined} onEdit={() => undefined} onOpenLink={() => undefined} {...handlers} />,
    ),
  );
}

const rowKeys = () => [...host.querySelectorAll("[data-row]")].map((r) => r.getAttribute("data-row"));

describe("the place sheet (AC-25)", () => {
  it("draws only the rows the point has, as plain text, with Directions and Edit for an event", async () => {
    const onEdit = vi.fn();
    await render(point({}), { onEdit });
    expect(host.querySelector("h3")?.textContent).toBe("Dinner");
    expect(host.textContent).toContain("Event · Lisbon trip");
    expect(rowKeys()).toEqual(["when", "address", "labels", "added"]);
    expect(host.textContent).toContain("Time Out Market");
    expect(host.textContent).toContain("Ana");
    const buttons = [...host.querySelectorAll("a, button")].map((b) => b.textContent);
    expect(buttons).toEqual(expect.arrayContaining(["Directions", "Edit"]));
    await act(async () => ([...host.querySelectorAll("button")].find((b) => b.textContent === "Edit") as HTMLButtonElement).click());
    expect(onEdit).toHaveBeenCalled();
  });

  it("gives a link its domain and Open link, and no address of its own", async () => {
    await render(point({ type: "link", title: "Casa Alfama", address: null, url: "https://www.airbnb.com/rooms/1", when: null }));
    expect(rowKeys()).toEqual(["link", "labels", "added"]);
    expect(host.textContent).toContain("airbnb.com");
    expect([...host.querySelectorAll("a, button")].map((b) => b.textContent)).toContain("Open link");
  });

  it("says an approximate place is approximate", async () => {
    await render(point({ approximate: true, address: "Alfama" }));
    expect(host.textContent).toContain("Approximate, Alfama");
    await render(point({ type: "location", title: "Alfama", approximate: true, address: null, when: null }));
    expect(host.textContent).toContain("Approximate");
  });

  it("gives a calendar's event Directions alone and no Added by, named by its calendar", async () => {
    await render(point({ key: "e:9", source: "calendar", contentId: null, authorId: null, labelIds: [], calendarName: "Work" }));
    expect(rowKeys()).not.toContain("added");
    expect(host.textContent).toContain("Work · Lisbon trip");
    expect([...host.querySelectorAll("a, button")].map((b) => b.textContent).filter((t) => t !== "")).toEqual(["Directions"]);
  });

  it("never draws what somebody wrote as markup", async () => {
    await render(point({ source: "calendar", contentId: null, authorId: null, address: '<a href="https://evil.example">x</a>' }));
    expect(host.querySelector('a[href="https://evil.example"]')).toBeNull();
    expect(host.textContent).toContain('<a href="https://evil.example">x</a>');
  });

  it("hands Directions to Google Maps in a new tab, with no referrer", async () => {
    await render(point({}));
    const directions = [...host.querySelectorAll("a")].find((a) => a.textContent === "Directions") as HTMLAnchorElement;
    expect(directions.href).toContain("https://www.google.com/maps/dir/?api=1&destination=38.7069%2C-9.1459");
    expect(directions.rel).toBe("noreferrer noopener");
  });
});
