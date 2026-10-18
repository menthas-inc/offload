// Dark theme: edges (design log, 2026-10-07).
//
// In dark a fill or a tint on the page measured 1.07:1 to 1.23:1, so every
// surface that holds rows draws a 1px inset ring: a grouped list or a neutral
// chip the card edge, a control or a well the well edge, a tint its own hue's.
// The edge tokens are transparent in light, so the ring is painted in both
// themes with no [data-theme] selector and nothing moves in light. The one
// exception is the sidebar, which is dark in both themes and keys off the page.
//
// And the lighter --moss-700 is a text step in dark, never a fill under white
// words: the admin link and the admin nav move to --surface-accent.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "../src");

/** Every plain rule as [selector, body], comments removed. */
function rules(file: string): [string, string][] {
  const plain = readFileSync(join(SRC, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  return [...plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1]!.trim().replace(/\s+/g, " "), m[2]!]);
}

/** The bodies of every rule whose selector is exactly this one, joined. */
function body(file: string, selector: string): string {
  return rules(file)
    .filter(([s]) => s === selector)
    .map(([, b]) => b)
    .join("\n");
}

/** Every edge token an inset 1px ring in this shadow names. */
function edges(value: string): string[] {
  return [...value.matchAll(/inset 0 0 0 1px var\(--edge-(\w+)\)/g)].map((m) => m[1]!);
}

function shadow(file: string, selector: string): string {
  const found = body(file, selector);
  expect(found, `${file} ${selector} exists`).not.toBe("");
  return found.match(/box-shadow:\s*([^;]+);/)?.[1]?.replace(/\s+/g, " ") ?? "";
}

const SHELL = "app/(shell)/shell.module.css";
const TODAY = "app/(shell)/today.module.css";
const MEMORIES = "app/(shell)/memories.module.css";
const ANSWER = "app/(shell)/answer.module.css";
const COMPOSER = "app/(shell)/composer.module.css";
const LABELS = "components/labels/labels.module.css";
const PEOPLE = "components/people/people.module.css";
const LOOSE = "components/loose/loose.module.css";
const AUTH = "app/(app)/auth.module.css";
const ADMIN = "app/(admin)/admin.module.css";
const FIRSTRUN = "components/firstrun/firstrun.module.css";
const MAP = "components/map/map.module.css";
const EDIT = "components/panes/EditThread.module.css";

const EDGES: [file: string, selector: string, edge: string][] = [
  // Today: the To do and If you have time card holds rows; an
  // event card is a well.
  [TODAY, ".rows", "card"],
  [TODAY, ".event", "well"],
  // Needs you, by the tone its kind line carries.
  [TODAY, '.card:has(> .kind[data-tone="danger"])', "danger"],
  [TODAY, '.card:has(> .kind[data-tone="attention"])', "attention"],
  [TODAY, '.card:has(> .kind[data-tone="accent"])', "accent"],

  // The shell.
  [SHELL, ".chip", "card"],
  [SHELL, ".chipLate", "danger"],
  [SHELL, ".chipSoon", "noticed"],
  [SHELL, ".tool", "card"],
  [SHELL, ".segmented", "well"],
  [SHELL, ".comboFilter", "well"],
  [SHELL, ".rowIcon", "well"],
  [SHELL, ".crumb", "well"],
  [SHELL, ".provenance", "well"],
  [SHELL, ".settingsIcon", "well"],
  [SHELL, ".settingsTime", "well"],
  [SHELL, ".actLead", "well"],
  [SHELL, ".detailPictureEmpty", "well"],
  [SHELL, '.sectionCount[data-tone="neutral"]', "well"],
  [SHELL, '.sectionCount[data-tone="accent"]', "accent"],
  [SHELL, ".settingsTile", "accent"],
  [SHELL, '.settingsStatus[data-tone="on"]', "accent"],
  [SHELL, '.appMark[data-tone="mail"]', "accent"],
  [SHELL, ".threadPill", "accent"],
  [SHELL, ".actTag", "noticed"],
  [SHELL, ".actTagQuiet", "well"],

  // Labels: the chip at rest.
  [LABELS, ".chip", "card"],

  // Memories.
  [MEMORIES, ".searchField", "well"],
  [MEMORIES, ".why", "well"],
  [MEMORIES, ".head em", "well"],

  // An answer: the accent rows and the fill rows.
  [ANSWER, ".head", "accent"],
  [ANSWER, ".inThread", "accent"],
  [ANSWER, ".tile", "well"],
  [ANSWER, ".more", "well"],

  // People: the accent cards, the lists of rows, and the field and tile.
  [PEOPLE, ".card", "accent"],
  [PEOPLE, ".strip", "accent"],
  [PEOPLE, ".modalList", "card"],
  [PEOPLE, ".preview", "card"],
  [PEOPLE, ".foundRow", "card"],
  [PEOPLE, ".find", "well"],
  [PEOPLE, ".plusLead", "well"],

  // Loose: the move suggestion.
  [LOOSE, ".suggest", "accent"],

  // Getting in: the refusal.
  [AUTH, ".refusal", "attention"],

  // The rest of the fills and tints the app draws.
  [COMPOSER, ".sentPhotoTile", "well"],
  [EDIT, ".well", "well"],
  [MAP, ".pill", "well"],
  [MAP, ".sheetTile", "well"],
  [MAP, ".button", "well"],
  [FIRSTRUN, ".well", "well"],
  [FIRSTRUN, ".wave", "well"],
  [FIRSTRUN, ".note", "well"],
  [FIRSTRUN, ".cardRowNew", "accent"],
  [FIRSTRUN, ".pillFiled", "accent"],
  [FIRSTRUN, ".photo", "accent"],
  [FIRSTRUN, ".markMail", "accent"],
  [FIRSTRUN, ".connected", "accent"],
  [FIRSTRUN, ".notice", "attention"],
];

describe("dark edges", () => {
  it.each(EDGES)("%s %s draws the %s edge", (file, selector, edge) => {
    expect(edges(shadow(file, selector))).toContain(edge);
  });

  it("adds the edge to a shadow already there, never replaces it", () => {
    expect(shadow(ANSWER, ".head")).toMatch(/inset 0 -1px 0 var\(--border-hairline\)/);
    expect(shadow(ANSWER, ".inThread")).toMatch(/inset 0 1px 0 var\(--border-hairline\)/);
    for (const tone of ["danger", "attention", "accent"]) {
      const card = shadow(TODAY, `.card:has(> .kind[data-tone="${tone}"])`);
      expect(card).toMatch(/inset 0 0 0 1px var\(--border-hairline\)/);
      expect(card).toContain("var(--shadow-2)");
    }
  });

  it("drops the edge where a variant paints its own ground or outline", () => {
    for (const [file, selector] of [
      [SHELL, ".chipOn"],
      [SHELL, '.tool[data-on="true"]'],
      [SHELL, ".tool:hover"],
      [SHELL, '.crumb[data-on="true"]'],
      [SHELL, ".row[data-archived] .rowIcon"],
      [SHELL, ".actLeadOff"],
      [LABELS, '.chip[data-tone="outline"]'],
      [LABELS, ".chip[data-selected]"],
      [LABELS, ".chip[data-disabled]"],
      [LOOSE, '.suggestHit[data-kind="create"] > .suggest'],
    ] as const) {
      expect(shadow(file, selector), `${file} ${selector}`).toBe("none");
    }
  });

  it("rings a memory kind at rest in its own hue, at the edge share", () => {
    expect(shadow(MEMORIES, ".kind")).toMatch(/^inset 0 0 0 1px color-mix\(in oklch, var\(--k\) var\(--edge-hue\), transparent\)$/);
  });

  it("mixes a kind's words at the hue ink share", () => {
    const block = rules(MEMORIES).find(([s]) => s.startsWith(".head[data-k], .row[data-k]"))?.[1] ?? "";
    expect(block).toMatch(/--ki:\s*color-mix\(in oklch, var\(--k\) var\(--hue-ink-mix\), var\(--text-primary\)\);/);
  });

  it("edges the sidebar off the page's theme, not its own", () => {
    expect(shadow(SHELL, ':global(html[data-theme="dark"]) .sidebar')).toMatch(/^inset -1px 0 0 var\(--border-lift\)$/);
  });
});

describe("the lighter --moss-700 is never a fill under white words", () => {
  it("fills the admin link with the accent surface, and deepens it on hover", () => {
    const link = body(AUTH, ".adminLink");
    expect(link).toMatch(/background:\s*var\(--surface-accent\);/);
    expect(link).not.toContain("--moss-700");
    expect(body(AUTH, ".adminLink:hover")).toMatch(
      /background:\s*color-mix\(in srgb, var\(--surface-accent\) 88%, black\);/,
    );
  });

  it("fills the admin nav with the accent surface", () => {
    const nav = body(ADMIN, ".nav");
    expect(nav).toMatch(/background:\s*var\(--surface-accent\);/);
    expect(nav).not.toContain("--moss-700");
  });
});
