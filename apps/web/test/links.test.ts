// What an anchor on the web may point at, and what an icon name may be.
//
// Security review 2026-09-22, L22 and L30. A row's link and a reply's source
// became hrefs with no look at the scheme, and a thread's icon name became a
// CSS url() with no look at its characters.

import { describe, expect, it } from "vitest";
import { webHref } from "../src/lib/links";
import { iconUrl } from "../src/components/Icon";

describe("an href from the server", () => {
  it("is a web address or nothing", () => {
    expect(webHref("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(webHref("http://example.com/")).toBe("http://example.com/");
    for (const url of ["mailto:a@b.c", "tel:123", "javascript:alert(1)", "data:text/html,hi", "offload://x", "", null, undefined]) {
      expect(webHref(url)).toBeUndefined();
    }
  });
});

describe("an icon name", () => {
  it("becomes a url only when it is a plain slug", () => {
    expect(iconUrl("inbox")).toBe('url("/icons/inbox.svg")');
    expect(iconUrl("arrow-up-right")).toBe('url("/icons/arrow-up-right.svg")');
    for (const name of ['x") , url(https://evil.example/t.svg', "../secret", "Inbox", "in box", ""]) {
      expect(iconUrl(name)).toBe("none");
    }
  });
});
