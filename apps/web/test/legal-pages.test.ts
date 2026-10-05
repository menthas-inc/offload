import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

// going-public.md, item 9 and the Safe Browsing flag of 2026-10-03. What a
// stranger or a crawler finds on the public site: terms beside privacy, a way
// to write to us on every page, a robots file, and no placeholder left on a
// page that is already published.
const src = (path: string) => `${process.cwd()}/src/${path}`;
const read = (path: string) => readFileSync(src(path), "utf8").replace(/\s+/g, " ");

describe("the public site reads as finished", () => {
  it("has a terms page in the privacy page's frame", () => {
    expect(existsSync(src("app/(marketing)/terms/page.tsx"))).toBe(true);
    const terms = read("app/(marketing)/terms/page.tsx");
    expect(terms).toContain('title: "Terms · offload"');
    expect(terms).toContain("<ScreenFooter />");
    expect(terms).toContain('href="/privacy"');
    expect(terms).toContain("hello@offload.club");
  });

  it("names terms, privacy and an address in the footer every public page shares", () => {
    const screen = read("components/Screen.tsx");
    expect(screen).toContain('href="/terms"');
    expect(screen).toContain('href="/privacy"');
    expect(screen).toContain('href="mailto:hello@offload.club"');
  });

  it("links the terms from help", () => {
    expect(read("components/panes/Help.tsx")).toContain('href="/terms"');
  });

  it("leaves no placeholder on the privacy page", () => {
    const privacy = read("app/(marketing)/privacy/page.tsx");
    expect(privacy).not.toContain("<Todo>");
    expect(privacy).not.toContain("To fill in before this is published");
  });

  it("writes neither page with a dash", () => {
    for (const page of ["app/(marketing)/terms/page.tsx", "app/(marketing)/privacy/page.tsx"]) {
      expect(read(page)).not.toMatch(/[–—]|&[mn]dash;/);
    }
  });

  it("serves a robots file that opens the public pages and closes the app", async () => {
    const { default: robots } = await import("../src/app/robots");
    const { rules, sitemap } = robots();
    const rule = Array.isArray(rules) ? rules[0]! : rules;
    expect(rule.allow).toBe("/");
    expect(rule.disallow).toEqual(expect.arrayContaining(["/threads", "/settings", "/admin"]));
    expect(sitemap).toBe("https://offload.club/sitemap.xml");
  });

  it("lists the public pages in the sitemap", async () => {
    const { default: sitemap } = await import("../src/app/sitemap");
    expect(sitemap().map((entry) => entry.url)).toEqual([
      "https://offload.club/",
      "https://offload.club/privacy",
      "https://offload.club/privacy/companies",
      "https://offload.club/terms",
      "https://offload.club/delete-account",
    ]);
  });

  // 035 AC-11. Play asks for a web address where deleting an account can be
  // started without the app. The same page for every visitor, with nothing to
  // fill in: an address field here would say whether an address has an account.
  it("has a delete-account page that takes no input and leads to sign in", () => {
    const page = read("app/(marketing)/delete-account/page.tsx");
    expect(page).toContain('title: "Delete your account · offload"');
    expect(page).not.toMatch(/<input|<form|<textarea|"use client"/);
    expect(page).toContain('href="/sign-in"');
    expect(page).toContain("hello@offload.club");
    expect(page).toContain("leaves what you added with the others");
    expect(page).not.toMatch(/[\u2013\u2014]|&[mn]dash;/);
  });

  // 035 AC-24. The privacy page is a claim surface: once deleting an account
  // and exporting are built, the page may not say they are done by hand. Since
  // 2026-10-05 it says so generally, and the mechanics live in the product.
  it("says on the privacy page that deleting and exporting are yours to do in Settings", () => {
    const privacy = read("app/(marketing)/privacy/page.tsx");
    expect(privacy).not.toContain("none of the controls below is built yet");
    expect(privacy).toContain("In Settings you can export everything, delete your account");
    expect(privacy).toContain('href="/delete-account"');
  });

  it("says the account is deleted on sign in, once, in place of the invite line", () => {
    const page = read("app/(app)/sign-in/page.tsx");
    expect(page).toContain("Your account is deleted.");
    expect(page).toContain('.has("deleted")');
  });
});
