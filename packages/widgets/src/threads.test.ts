// 044. The host shown before a PDF action opens, computed on the client from
// the parsed URL. The defence against a look-alike link lives here: the true
// host always shows, in ASCII, with the end (where the domain sits) kept.

import { describe, expect, it } from "vitest";
import { hostForAction } from "./threads.js";

describe("hostForAction", () => {
  it("shows the host of a plain https link", () => {
    expect(hostForAction("https://lufthansa.com/checkin?x=1")).toBe("lufthansa.com");
  });

  it("shows the real host when userinfo is used as bait", () => {
    // lufthansa.com is the userinfo, evil.ru is the host.
    expect(hostForAction("https://lufthansa.com@evil.ru/checkin")).toBe("evil.ru");
  });

  it("shows the whole host of a subdomain look-alike, not a trusted suffix", () => {
    expect(hostForAction("https://lufthansa.com.evil.ru/")).toBe("lufthansa.com.evil.ru");
  });

  it("shows a mixed-script homograph as its punycode, never the bait glyphs", () => {
    // Cyrillic 'аррӏе' that reads as 'apple'. URL encodes it to xn--.
    const host = hostForAction("https://аррӏе.com/");
    expect(host).toMatch(/^xn--/);
    expect(host).not.toContain("а");
  });

  it("never shows a bidi override that would repaint the host", () => {
    // The URL parser refuses such a host outright (null, so nothing opens); if
    // one ever parsed, the override is stripped. Either way it never shows.
    const host = hostForAction("https://ex‮ample.com/");
    expect(host === null || !host.includes("‮")).toBe(true);
  });

  it("is null for a scheme that is not http or https", () => {
    expect(hostForAction("javascript:alert(1)")).toBeNull();
    expect(hostForAction("mailto:a@b.com")).toBeNull();
    expect(hostForAction("tel:+351912345678")).toBeNull();
  });

  it("is null for an unparseable or empty url", () => {
    expect(hostForAction("not a url")).toBeNull();
    expect(hostForAction("")).toBeNull();
    expect(hostForAction(null)).toBeNull();
  });

  it("middle-clips a long host but keeps the end where the domain is", () => {
    const long = "https://" + "a".repeat(60) + ".lufthansa.com/";
    const shown = hostForAction(long)!;
    expect(shown.length).toBeLessThanOrEqual(30);
    expect(shown).toContain("…");
    expect(shown.endsWith("lufthansa.com")).toBe(true);
  });
});
