// @vitest-environment happy-dom
//
// 2026-10-04. A note's words are its author's to change, as they are its
// author's to delete, and the server refuses anybody else. So the open note
// offers somebody else's as words to read: no field to type in, no count, no
// Save that would be refused, and Mute still theirs.

import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/threads/t0",
}));

const { NoteEditor } = await import("../src/components/panes/Notes");

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const draw = (readOnly: boolean, onSave = vi.fn()) => {
  act(() =>
    root.render(
      <NoteEditor
        draft="Ana handles the electrician"
        onDraft={() => {}}
        onSave={onSave}
        onCancel={() => {}}
        way={readOnly ? "mute" : "delete"}
        onDelete={() => {}}
        onMute={() => {}}
        readOnly={readOnly}
      />,
    ),
  );
  return onSave;
};
const buttons = () => [...host.querySelectorAll("button")].map((button) => button.textContent);

describe("somebody else's note, opened", () => {
  it("is read, not typed in: no Save, no count, Mute and Close", () => {
    const onSave = draw(true);
    const field = host.querySelector("textarea")!;
    expect(field.readOnly).toBe(true);
    expect(buttons()).toEqual(["Mute", "Close"]);
    expect(host.textContent).not.toContain("/200");
    act(() => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("is unchanged for your own", () => {
    draw(false);
    expect(host.querySelector("textarea")!.readOnly).toBe(false);
    expect(buttons()).toEqual(["Delete", "Cancel", "Save"]);
    expect(host.textContent).toContain("/200");
  });
});

describe("the thread's notes", () => {
  it("opens a note as read only for anybody who could not delete it", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(join(process.cwd(), "src/components/panes/Notes.tsx"), "utf8");
    expect(source).toContain("const mine = actions.canDelete(note);");
    expect(source).toContain("readOnly={!mine}");
  });
});
