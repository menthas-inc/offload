// A share that reaches a phone whose offload was killed in the background.
// Android keeps the task, recreates the activity from the intent it was first
// opened with, and hands the share over as a new intent while the app is
// still loading, which Expo's delegate drops. The plugin writes the two lines
// into MainActivity that keep it (2026-10-16, seen on a Pixel 9).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const { shareRelaunch } = require("../plugins/with-share-relaunch.js") as { shareRelaunch: (src: string) => string };

// Expo 57's template, as prebuild writes it.
const TEMPLATE = `package club.offload.app

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null)
  }

  override fun getMainComponentName(): String = "main"
}
`;

describe("a share into an offload Android had killed", () => {
  const out = shareRelaunch(TEMPLATE);
  const onCreate = out.slice(out.indexOf("override fun onCreate"), out.indexOf("override fun getMainComponentName"));

  it("does not take the share it was first opened with a second time", () => {
    const forget = onCreate.indexOf("savedInstanceState != null");
    expect(forget).toBeGreaterThan(-1);
    // Before super.onCreate, where the share library reads the intent.
    expect(forget).toBeLessThan(onCreate.indexOf("super.onCreate(null)"));
  });

  it("keeps a share that arrives while the app is loading, for the library to read", () => {
    const keep = onCreate.indexOf("addOnNewIntentListener");
    expect(keep).toBeGreaterThan(onCreate.indexOf("super.onCreate(null)"));
    expect(onCreate).toContain("ExpoShareIntentSingleton.intent = next");
    expect(out).toContain("import android.content.Intent");
    expect(out).toContain("import expo.modules.shareintent.ExpoShareIntentSingleton");
  });

  it("keeps only a share, not any typed intent another app sends", () => {
    const keep = onCreate.slice(onCreate.indexOf("addOnNewIntentListener"));
    expect(keep).toContain("next.action == Intent.ACTION_SEND || next.action == Intent.ACTION_SEND_MULTIPLE");
    expect(keep).not.toContain("next.type != null");
  });

  it("writes it once however often prebuild runs", () => {
    expect(shareRelaunch(out)).toBe(out);
  });

  it("refuses a MainActivity it cannot find its place in", () => {
    expect(() => shareRelaunch(TEMPLATE.replace("super.onCreate(null)", "super.onCreate(savedInstanceState)"))).toThrow();
  });

  it("is in the app's plugins", () => {
    const plugins = JSON.parse(readFileSync(`${process.cwd()}/app.json`, "utf8")).expo.plugins as unknown[];
    expect(plugins).toContain("./plugins/with-share-relaunch.js");
  });
});
