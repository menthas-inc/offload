// The plugin's runtime imports are installed.
//
// `@better-auth/expo` declares `expo-network` as an optional peer and then
// imports it on the sign-out path. Metro turns an import of a package that is
// not installed into a throw at the call, not a rejected promise, so the
// plugin's own catch never runs and `signOut()` rejects with "Cannot find
// module 'expo-network'". Every sign-out on both phones failed that way from
// the 1.7.5 upgrade (security review 2026-09-22, M9) until the Pixel showed
// it on 2026-09-23. A peer the plugin reaches for at runtime is a dependency
// of ours, and this is the line that says so.

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const resolve = createRequire(import.meta.url).resolve;

describe("the auth plugin's runtime peers", () => {
  it("can reach expo-network", () => {
    expect(() => resolve("expo-network/package.json")).not.toThrow();
  });
});
