// 2026-10-08. The app's own iOS privacy manifest declares what the App Store
// privacy label declares. Apple compares the two, and the label is typed into
// App Store Connect by hand, so the list below is that label, row for row: a
// change to either has to change the other here, in the same diff.
//
// Each row is collected, never used to track. Crash and performance data are
// there for the Google Maps SDK, which declares them in its own manifest.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Purpose = "AppFunctionality" | "Analytics";
const LABEL: [type: string, linked: boolean, purposes: Purpose[]][] = [
  ["Name", true, ["AppFunctionality"]],
  ["EmailAddress", true, ["AppFunctionality"]],
  ["PreciseLocation", true, ["AppFunctionality"]],
  ["CoarseLocation", true, ["AppFunctionality"]],
  ["Contacts", true, ["AppFunctionality"]],
  ["EmailsOrTextMessages", true, ["AppFunctionality"]],
  ["PhotosorVideos", true, ["AppFunctionality"]],
  ["AudioData", true, ["AppFunctionality"]],
  ["OtherUserContent", true, ["AppFunctionality"]],
  ["UserID", true, ["AppFunctionality", "Analytics"]],
  ["DeviceID", true, ["AppFunctionality", "Analytics"]],
  ["ProductInteraction", true, ["Analytics"]],
  ["CrashData", false, ["Analytics"]],
  ["PerformanceData", false, ["Analytics"]],
  ["OtherDiagnosticData", true, ["AppFunctionality", "Analytics"]],
  ["OtherDataTypes", true, ["AppFunctionality"]],
];

const manifest = JSON.parse(readFileSync(`${process.cwd()}/app.json`, "utf8")).expo.ios.privacyManifests;

describe("the iOS privacy manifest (App Store label, 2026-10-08)", () => {
  it("declares exactly the label's collected data, none of it for tracking", () => {
    expect(manifest.NSPrivacyTracking).toBe(false);
    expect(manifest.NSPrivacyCollectedDataTypes).toEqual(
      LABEL.map(([type, linked, purposes]) => ({
        NSPrivacyCollectedDataType: `NSPrivacyCollectedDataType${type}`,
        NSPrivacyCollectedDataTypeLinked: linked,
        NSPrivacyCollectedDataTypeTracking: false,
        NSPrivacyCollectedDataTypePurposes: purposes.map((p) => `NSPrivacyCollectedDataTypePurpose${p}`),
      })),
    );
  });

  // What prebuild already wrote from Expo's template, kept so the app's own
  // required-reason declarations never depend on the template staying put.
  it("keeps the required-reason APIs prebuild declares", () => {
    expect(manifest.NSPrivacyAccessedAPITypes).toEqual([
      { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp", NSPrivacyAccessedAPITypeReasons: ["C617.1"] },
      { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults", NSPrivacyAccessedAPITypeReasons: ["CA92.1"] },
      { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategorySystemBootTime", NSPrivacyAccessedAPITypeReasons: ["35F9.1"] },
    ]);
  });

  it("reaches the resolved config", async () => {
    const base = JSON.parse(readFileSync(`${process.cwd()}/app.json`, "utf8")).expo;
    const { default: make } = await import("../app.config");
    expect(make({ config: base } as never).ios?.privacyManifests).toEqual(manifest);
  });
});
