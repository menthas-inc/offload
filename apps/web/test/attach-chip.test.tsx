// @vitest-environment happy-dom
//
// The chip a photo or a PDF makes in the composer (2026-10-16, owner): ink
// blue with white words so it stands out against the field, and a photo shows
// a little of itself where the image glyph was. A refused file keeps the
// quiet chip and its danger border, so its line stays readable. The phones'
// chip is the same (apps/mobile/test/attach-chip.test.ts).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttachChip } from "../src/components/shell/AttachChip";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

async function render(node: React.ReactNode) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => root.render(node));
  return { host, root };
}

const photo = new File([new Uint8Array(10)], "Screenshot.png", { type: "image/png" });

/** One rule's body from the composer's stylesheet. */
function rule(selector: string): string {
  const css = readFileSync(join(import.meta.dirname, "../src/app/(shell)/composer.module.css"), "utf8");
  const at = css.indexOf(`\n${selector} {`);
  expect(at).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
}

describe("the attachment chip", () => {
  it("shows the photo itself, and lets its preview go with the chip", async () => {
    const made = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    const revoked = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const { host, root } = await render(<AttachChip name="Screenshot.png" file={photo} error={null} onRemove={() => {}} />);
    expect(made).toHaveBeenCalledWith(photo);
    expect(host.querySelector("img")?.getAttribute("src")).toBe("blob:preview");
    expect(host.innerHTML).not.toContain("image.svg");
    await act(async () => root.unmount());
    expect(revoked).toHaveBeenCalledWith("blob:preview");
  });

  it("draws the glyph for a PDF and for a refused file, not a preview", async () => {
    const made = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    const pdf = await render(<AttachChip name="a.pdf" kind="pdf" file={photo} error={null} onRemove={() => {}} />);
    expect(pdf.host.querySelector("img")).toBeNull();
    const refused = await render(<AttachChip name="a.docx" file={photo} error="not_a_photo" onRemove={() => {}} />);
    expect(refused.host.querySelector("img")).toBeNull();
    expect(made).not.toHaveBeenCalled();
  });

  it("is ink blue with white words, and quiet when refused", () => {
    expect(rule(".chip")).toContain("background: var(--surface-attention)");
    expect(rule(".chipName")).toContain("color: var(--text-on-solid)");
    expect(rule(".chip[data-error]")).toContain("background: var(--surface-raised)");
    expect(rule(".chip[data-error] .chipName")).toContain("color: var(--text-secondary)");
  });
});
