// 2026-11-02 (the owner). The details are editable in the row's sheet without
// touching the words read out of the picture. (The on-device number detector
// that stood here became 050's gathering, `apps/agent` `found.py`.)

import { describe, expect, it } from "vitest";
import { withCaption } from "./photos.js";

describe("withCaption", () => {
  it("replaces the caption and keeps the words read out of the picture", () => {
    expect(withCaption("Why it was kept\nWhat is in it\nText: Dana R. 212 555 0142", "Call Dana")).toBe(
      "Call Dana\nText: Dana R. 212 555 0142",
    );
  });

  it("writes a body with no words as the caption alone", () => {
    expect(withCaption("Old details", "New details")).toBe("New details");
    expect(withCaption(null, "New details")).toBe("New details");
  });

  it("keeps the words when the caption is emptied, and clears a body that held only a caption", () => {
    expect(withCaption("Old\nText: abc", "  ")).toBe("Text: abc");
    expect(withCaption("Old", "")).toBeNull();
  });
});
