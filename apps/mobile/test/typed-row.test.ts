// 032. A row typed into a section is saved as typed. The optimistic row's
// shape is held by the web's test of the same function and by the typecheck;
// lib/threads.ts loads React Native, which this runner cannot.

import { describe, expect, it } from "vitest";
import { TYPED_ROW_PLACEHOLDER, typedAddress } from "../lib/typed-row";

describe("a typed row", () => {
  it("knows an address from words around one", () => {
    const address = "https://www.ikea.com/pt/en/p/lack-wall-shelf-white-30305718/";
    expect(typedAddress(`  ${address} `)).toBe(address);
    expect(typedAddress("shelf https://example.test/a")).toBeNull();
    expect(typedAddress("ftp://example.test/a")).toBeNull();
    expect(typedAddress("www.example.test")).toBeNull();
    expect(typedAddress("Https://example.test/a")).toBeNull();
  });

  it("promises nothing about tidying", () => {
    expect(TYPED_ROW_PLACEHOLDER).toBe("Add to this");
  });
});
