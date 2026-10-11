// 030 T4.9, AC-28. The phones' map keys: applied through the maps plugin's
// own mods so neither appears in the config a build or an update serves, and
// `mapsAvailable` false for a platform built without its key, so a keyless
// iOS build never falls back to Apple's map.

import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const base = JSON.parse(readFileSync(`${process.cwd()}/app.json`, "utf8")).expo;

async function configWith(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const { default: make } = await import("../app.config");
  return make({ config: structuredClone(base) } as never);
}

afterEach(() => vi.unstubAllEnvs());

describe("the map keys (AC-28)", () => {
  it("says which platforms have a key, and serves neither key", async () => {
    const config = await configWith({ GOOGLE_MAPS_IOS_KEY: "ios-secret-key", GOOGLE_MAPS_ANDROID_KEY: "android-secret-key" });
    expect(config.extra?.["mapsAvailable"]).toEqual({ ios: true, android: true });
    const { mods: _mods, ...served } = config as { mods?: unknown; plugins?: unknown[] };
    void _mods;
    expect(JSON.stringify(served)).not.toContain("secret-key");
    expect(JSON.stringify(served.plugins ?? [])).not.toContain("react-native-maps");
  });

  it("has no map on a platform built without its key", async () => {
    const config = await configWith({ GOOGLE_MAPS_ANDROID_KEY: "android-secret-key", GOOGLE_MAPS_IOS_KEY: "" });
    expect(config.extra?.["mapsAvailable"]).toEqual({ ios: false, android: true });
  });

  it("keeps everything app.json says", async () => {
    const config = await configWith({});
    expect(config.ios?.bundleIdentifier).toBe("club.offload.app");
    expect(config.extra?.["eas"]).toEqual(base.extra.eas);
    expect(config.plugins).toEqual(base.plugins);
  });
});

// 2026-10-09, ITMS-90683 on build 16. The Google Maps SDK links Core Location,
// so Apple wants a location purpose string in every build that carries it,
// though offload never asks for a location (ThreadMap turns the button off).
// The string says so, since it is only ever shown if something asks.
describe("the location purpose string", () => {
  it("is in every build, and says offload never asks", async () => {
    const config = await configWith({ GOOGLE_MAPS_IOS_KEY: "ios-secret-key" });
    const text = config.ios?.infoPlist?.["NSLocationWhenInUseUsageDescription"];
    expect(typeof text).toBe("string");
    expect(text).toMatch(/^offload never asks for your location\./);
    // Written as escapes so the gate, which refuses the characters themselves
    // anywhere in the repo, can read this file (the same as evals/run.py).
    expect(text).not.toMatch(/[\u2013\u2014]/);
  });
});
