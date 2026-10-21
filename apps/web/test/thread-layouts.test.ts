// Thread layouts (045), the web client's wiring that a logic test cannot reach
// and that the review found wrong: the two no-body POSTs must not claim a JSON
// content type (Fastify 400s an empty JSON body), and a layout tick that takes
// a row out of the list must carry its Undo.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

describe("045 the web client", () => {
  it("posts the dismiss and seen routes with no body and no content type", () => {
    const lib = read("lib/threads.ts");
    for (const fn of ["dismissLayoutSuggestion", "markLayoutSeen"]) {
      const body = lib.slice(lib.indexOf(`function ${fn}`), lib.indexOf(`function ${fn}`) + 400);
      // `...send` carries credentials only; `...json` adds content-type, which
      // 400s an empty body. The one must be used and the other must not.
      expect(body, fn).toMatch(/\.\.\.send, method: "POST"/);
      expect(body, fn).not.toMatch(/\.\.\.json/);
    }
  });

  it("gives the Todo list tick an Undo, and leaves the other layouts the plain toggle", () => {
    const thread = read("components/panes/Thread.tsx");
    const tick = thread.slice(thread.indexOf("function layoutTick("), thread.indexOf("function layoutTick(") + 700);
    expect(tick).toMatch(/threadLayout !== "todo"/);
    expect(tick).not.toMatch(/gallery/);
    expect(tick).toMatch(/unwrite: \(\) => completeContent\(row\.id, false\)/);
    expect(tick).toMatch(/did: "Ticked off"/);
    expect(tick).toMatch(/form: "slot"/);
  });

  it("draws the checkbox lead only for the big and check forms", () => {
    const sections = read("components/panes/LayoutSections.tsx");
    expect(sections).toMatch(/const box = section\.form === "big" \|\| section\.form === "check"/);
  });

  it("surfaces the labels-full refusal with no instruction clause", () => {
    const thread = read("components/panes/Thread.tsx");
    expect(thread).toMatch(/isLabelsFull\(result\)/);
    expect(thread).not.toMatch(/Remove some first/);
  });
});
