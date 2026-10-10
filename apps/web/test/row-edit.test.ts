// 042. The row's edit, drawn first: what the three optimistic mergers (the
// thread pane, Today and Not in a thread) draw from a patch and put back on
// a failure, and the Undo they send. `reminders` rides with the rest, a stop
// takes the asked flag with it as the server does, and the Undo sends the
// snapshot's `reminders` as given: a null there is "leave it alone", which
// the route accepts, and draws nothing.

import { describe, expect, it } from "vitest";
import { drawnEdit, undoOf } from "../src/lib/row-edit";
import type { ContentRow, ContentSnapshot } from "../src/lib/threads";

const row = {
  id: "r1",
  title: "Renew the visa",
  body: null,
  dueAt: "2026-11-02T12:00:00.000Z",
  occursAt: null,
  occursEndAt: null,
  rrule: null,
  allDay: true,
  isReminder: true,
  reminders: "on",
  labels: ["l1"],
} as unknown as ContentRow;

describe("drawnEdit", () => {
  it("draws reminders from the patch, and a stop turns the asked flag off with it", () => {
    const { drawn, before } = drawnEdit(row, { reminders: "off" }, "Europe/Lisbon");
    expect(drawn).toEqual({ reminders: "off", isReminder: false });
    expect(before).toMatchObject({ reminders: "on", isReminder: true });
  });

  it("puts back every field it may draw", () => {
    const { before } = drawnEdit(row, { title: "Renew it" }, "Europe/Lisbon");
    expect(before).toEqual({
      title: "Renew the visa",
      body: null,
      isReminder: true,
      reminders: "on",
      dueAt: "2026-11-02T12:00:00.000Z",
      occursAt: null,
      occursEndAt: null,
      rrule: null,
      allDay: true,
      labels: ["l1"],
    });
  });

  it("draws nothing for a null reminders, which leaves it alone", () => {
    const { drawn } = drawnEdit(row, { reminders: null, isReminder: true }, "Europe/Lisbon");
    expect(drawn).toEqual({ isReminder: true });
  });

  it("draws title, labels and isReminder as before", () => {
    const { drawn } = drawnEdit(row, { title: "Renew it", labels: [], isReminder: false }, "Europe/Lisbon");
    expect(drawn).toEqual({ title: "Renew it", labels: [], isReminder: false });
  });
});

describe("undoOf", () => {
  const snapshot: ContentSnapshot = {
    title: "Renew the visa",
    body: null,
    dueAt: null,
    occursAt: null,
    occursEndAt: null,
    allDay: false,
    rrule: null,
    isReminder: true,
    labels: [],
    reminders: "on",
  };

  it("sends the snapshot back, reminders and isReminder included", () => {
    expect(undoOf(snapshot)).toEqual(snapshot);
  });

  it("sends a null reminders as given, which the route reads as leave it alone", () => {
    const back = undoOf({ ...snapshot, reminders: null });
    expect(back).toEqual({ ...snapshot, reminders: null });
  });
});
