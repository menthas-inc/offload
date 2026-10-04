// 2026-10-04. A note's words are its author's to change, and the server
// refuses anybody else. What the sheet draws for somebody else's note, read
// from its source, since these tests render nothing.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../components/shell/Notes.tsx", import.meta.url), "utf8");

describe("somebody else's note, opened on a phone", () => {
  it("is read, not typed in", () => {
    expect(source).toContain("const readOnly = note !== null && !canDelete;");
    expect(source).toContain("editable={!readOnly}");
  });

  it("offers no Save and no count, and Close where Cancel was", () => {
    expect(source).toContain('<Action label={readOnly ? "Close" : "Cancel"} onPress={onClose} />');
    expect(source).toMatch(/\{readOnly \? null : \(\s*<Pressable\s+onPress=\{\(\) => onSave\(draft\)\}/);
    expect(source).toContain('{readOnly ? "" : `${draft.length}/${NOTE_CHARS}`}');
  });

  it("does not raise the keyboard for words that cannot be typed", () => {
    expect(source).toContain("onOpen={() => (readOnly ? undefined : field.current?.focus())}");
  });
});
