// A token that does not exist fails by doing nothing: `var(--space-16)` drops
// the whole declaration and the element draws with no padding, past lint,
// typecheck and build. The Timeline layout shipped that way. So every
// reference to a token family must name a token that is defined, in the
// token set or in the web's own CSS.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..", "..");
const tokens = readFileSync(join(root, "packages/tokens/dist/tokens.css"), "utf8");

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : /\.(css|tsx)$/.test(entry.name) ? [path] : [];
  });

const web = files(join(root, "apps/web/src")).map((path) => ({ path, text: readFileSync(path, "utf8") }));
const defined = new Set([tokens, ...web.map((file) => file.text)].flatMap((text) => [...text.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1])));
// The first word of a token's name: space, text, radius, surface and the rest.
const family = (name: string) => name.split("-")[2];
const families = new Set([...tokens.matchAll(/(--[\w-]+)\s*:/g)].map((m) => family(m[1]!)));

describe("the web's tokens", () => {
  it("are all defined", () => {
    const missing = web.flatMap(({ path, text }) =>
      // A name built in a template literal (`--label-${n}`), or a pattern in a
      // comment (`--text-*-role`), is only its prefix.
      [...text.matchAll(/var\((--[\w-]+)(\$?)/g)]
        .filter((m) => !m[2] && !m[1]!.endsWith("-"))
        .map((m) => m[1]!)
        .filter((name) => families.has(family(name)) && !defined.has(name))
        .map((name) => `${path.slice(root.length + 1)} ${name}`),
    );
    expect(missing).toEqual([]);
  });
});
