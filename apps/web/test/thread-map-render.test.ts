// The sweep of 2026-10-07. The thread map keeps reduced motion in a ref so the
// preference changing does not move the map, and writes that ref in an effect:
// a ref written while rendering is a render with a side effect, which React's
// concurrent rendering may run and throw away.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(`${process.cwd()}/src/components/map/ThreadMap.tsx`, "utf8");

describe("the thread map", () => {
  it("reads reduced motion with the hook and writes its ref in an effect", () => {
    expect(source).not.toMatch(/\.current = use[A-Z]\w*\(/);
    expect(source).toMatch(/const prefersReduced = useReducedMotion\(\);/);
    expect(source).toMatch(/useEffect\(\(\) => \{\s*reduced\.current = prefersReduced;\s*\}, \[prefersReduced\]\);/);
  });
});
