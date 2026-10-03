// 036. What the Storage row says, decided once for the phones and the web
// (AC-11): whole megabytes under a gigabyte, gigabytes to one place from
// there, a trailing zero dropped.

import { describe, expect, it } from "vitest";
import { storageFigure } from "@offload/widgets";

const MB = 1024 * 1024;
const GB = 1024 * MB;

describe("the Storage row's figure", () => {
  it("is whole megabytes under a gigabyte, rounded down", () => {
    expect(storageFigure(0, GB)).toBe("0 MB of 1 GB");
    expect(storageFigure(312.9 * MB, GB)).toBe("312 MB of 1 GB");
    expect(storageFigure(1023.9 * MB, GB)).toBe("1023 MB of 1 GB");
  });

  it("is gigabytes to one place from a gigabyte, without a trailing zero", () => {
    expect(storageFigure(GB, GB)).toBe("1 GB of 1 GB");
    expect(storageFigure(1.44 * GB, 2 * GB)).toBe("1.4 GB of 2 GB");
  });

  it("says a limit under a gigabyte in megabytes", () => {
    expect(storageFigure(10 * MB, 500 * MB)).toBe("10 MB of 500 MB");
  });
});
