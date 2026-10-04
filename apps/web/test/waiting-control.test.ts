// The control that answers a proposed calendar write, in the composer.
//
// The proposal is stored against the person's message, and the reply is what
// says offload is waiting. The reply looked for the control on itself, so with
// a reply there was a sentence about a go-ahead and nothing to give it with,
// live and after a reload. Read from source, as the composer's other rules are.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../src/components/shell/Composer.tsx"),
  "utf8",
);

describe("a proposed calendar write, under the reply", () => {
  it("is read from the turn the reply answers, not only from the reply", () => {
    expect(source).toContain("answered.get(turn.id)?.waiting ?? turn.waiting");
  });

  it("names what the tap does: add, change or remove", () => {
    expect(source).toMatch(/waiting\.action === "delete"\s*\?\s*"Remove it"/);
    expect(source).toMatch(/waiting\.action === "edit"\s*\?\s*"Change it"/);
    expect(source).toContain('"Add it"');
  });
});
