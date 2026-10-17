// 2026-10-17 (the owner). A photo that became an event or a to-do rides on
// that row rather than a picture row beside it. That row stays a row: a row
// lifted into a widget leaves the list, and in Files an event would be an
// untitled square with no date, folded away at first. Its photo is drawn on
// the row instead.

import { describe, expect, it } from "vitest";
import { widgetsFor } from "../src/index.js";

const row = (over: Record<string, unknown>) => ({ id: "r", type: "event", priority: 0, doneAt: null, occursAt: null, placeId: null, photo: null, ...over });

describe("Files", () => {
  it("holds the pictures of their own, and never the event or the to-do carrying one", () => {
    const ticket = row({ id: "e", type: "event", photo: { kind: "image" } });
    const bill = row({ id: "t", type: "task", photo: { kind: "image" } });
    const picture = row({ id: "p", type: "image", photo: { kind: "image" } });
    const widgets = widgetsFor([ticket, bill, picture]);
    expect(widgets.find((one) => one.kind === "files")?.rows.map((one) => one.id)).toEqual(["p"]);
    expect(widgets.find((one) => one.kind === "todo")?.rows.map((one) => one.id)).toEqual(["t"]);
  });
});
