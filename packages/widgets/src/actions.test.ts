// 050. The label and destination rules every surface shares, held to the
// table the agent's tests read too.

import { describe, expect, it } from "vitest";
import { actionKind, isActionUrl, labelOk, shownDestination } from "./actions.js";

import fixtures from "./actions.fixtures.json" with { type: "json" };

const table = fixtures as {
  labels: { label: string; ok: boolean }[];
  urls: { url: string; ok: boolean; kind?: string; shown?: string }[];
};

describe("labelOk", () => {
  for (const { label, ok } of table.labels) {
    it(`${ok ? "keeps" : "refuses"} ${JSON.stringify(label)}`, () => expect(labelOk(label)).toBe(ok));
  }
});

describe("isActionUrl, actionKind and shownDestination", () => {
  for (const { url, ok, kind, shown } of table.urls) {
    it(`${ok ? "keeps" : "refuses"} ${JSON.stringify(url)}`, () => {
      expect(isActionUrl(url)).toBe(ok);
      if (ok) {
        expect(actionKind(url)).toBe(kind);
        expect(shownDestination(url)).toBe(shown);
      } else {
        expect(actionKind(url)).toBeNull();
        expect(shownDestination(url)).toBeNull();
      }
    });
  }
});
