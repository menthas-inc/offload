// 032. A row typed into a section is saved as typed. No model reads it, so
// nothing draws it as being sorted, and a line that is one web address is a
// link from the moment it is drawn.

import { describe, expect, it } from "vitest";
import * as threads from "../src/lib/threads";
import { TYPED_ROW_PLACEHOLDER, provisionalRow, typedAddress } from "../src/lib/threads";

const author = { accountId: "a1", displayName: "Ana" };

describe("a typed row", () => {
  it("is drawn as written, never as being sorted", () => {
    const row = provisionalRow("fix the tap", "task", author);
    expect(row.filingAt).toBeNull();
    expect(row.title).toBe("fix the tap");
    expect(row.url).toBeNull();
  });

  it("is a link at once when the line is one web address", () => {
    const address = "https://www.ikea.com/pt/en/p/lack-wall-shelf-white-30305718/";
    const row = provisionalRow(`  ${address} `, "task", author);
    expect(row.url).toBe(address);
    expect(row.title).toBe(address);
  });

  it("knows an address from words around one", () => {
    expect(typedAddress("http://example.test/a")).toBe("http://example.test/a");
    expect(typedAddress("shelf https://example.test/a")).toBeNull();
    expect(typedAddress("ftp://example.test/a")).toBeNull();
    expect(typedAddress("www.example.test")).toBeNull();
    expect(typedAddress("Https://example.test/a")).toBeNull();
  });

  it("has no spinner left to draw", () => {
    expect("isFiling" in threads).toBe(false);
    expect("FILING_PATIENCE_MS" in threads).toBe(false);
  });

  it("promises nothing about tidying", () => {
    expect(TYPED_ROW_PLACEHOLDER).toBe("Add to this");
  });
});
