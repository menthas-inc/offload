// What the phones will open, and what they will not.
//
// Security review 2026-09-22, L21. A row's link and a reply's source were
// opened with the platform's opener and no look at the scheme, so a member
// could put `sms:` or another app's scheme, with arguments, in a shared thread
// and anyone tapping the row would open it.

import { describe, expect, it, vi } from "vitest";

const opened: string[] = [];

vi.mock("react-native", () => ({
  Linking: {
    openURL: (url: string) => {
      opened.push(url);
      return Promise.resolve();
    },
  },
}));
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));

const { openLink } = await import("../lib/links");

describe("opening a link", () => {
  it("opens a web page", async () => {
    expect(await openLink("https://example.com/a?b=1")).toBe(true);
    expect(await openLink("http://example.com/")).toBe(true);
    expect(opened).toEqual(["https://example.com/a?b=1", "http://example.com/"]);
  });

  it("opens nothing else", async () => {
    for (const url of ["sms:+441234?body=hi", "tel:123", "javascript:alert(1)", "offload://welcome", "file:///etc/passwd", "", "not a url"]) {
      expect(await openLink(url)).toBe(false);
    }
    expect(opened).toHaveLength(2);
  });
});
