// A share whose file offload cannot read. Any app can send a share naming a
// file it never granted, and expo-share-intent read it unchecked on the main
// thread: a null or empty cursor killed the app (sweep 2026-10-17, D1, seen on
// a Pixel 9), and on a cold start the same throw surfaced as a rejection
// nothing caught (D2). The patch in patches/ skips such a file instead.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = dirname(require.resolve("expo-share-intent/package.json"));
const kotlin = readFileSync(
  join(root, "android/src/main/java/expo/modules/shareintent/ExpoShareIntentModule.kt"),
  "utf8",
);

describe("a share offload cannot read", () => {
  it("reads every shared file through a guard that returns nothing on failure", () => {
    expect(kotlin).toMatch(
      /fun readableFileInfo\(uri: Uri\): Map<String, String\?>\? =\s*try \{ getFileInfo\(uri\) \} catch \(e: Exception\) \{ null \}/,
    );
    // The guard's own call and the definition: nothing else reads a file unguarded.
    expect(kotlin.match(/getFileInfo\(/g)).toHaveLength(2);
  });

  it("drops an unreadable file from a share of several", () => {
    expect(kotlin).toContain("uris?.mapNotNull { readableFileInfo(it) }");
  });
});
