// The phones' toast to a screen reader. It said nothing: no live region, so a
// write that did not land was silent unless you happened to look. The kit's
// failure form is an alert, and the web reads failure from the action.

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios" }, Pressable: () => null, Text: () => null, View: () => null }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0 }) }));
vi.mock("react-native-reanimated", () => ({ default: { View: () => null }, FadeInUp: {}, FadeOut: {} }));

const { toastFailed } = await import("../components/shell/Toast");

describe("a failure toast", () => {
  it("is one whose action is Retry or Try again", () => {
    expect(toastFailed({ label: "Retry", onPress: () => {} })).toBe(true);
    expect(toastFailed({ label: "Try again", onPress: () => {} })).toBe(true);
    expect(toastFailed({ label: "Undo", onPress: () => {} })).toBe(false);
    expect(toastFailed(undefined)).toBe(false);
  });

  const source = readFileSync(`${process.cwd()}/components/shell/Toast.tsx`, "utf8");

  it("interrupts a screen reader when it failed and waits its turn otherwise", () => {
    expect(source).toMatch(/accessibilityLiveRegion=\{failed \? "assertive" : "polite"\}/);
    expect(source).toMatch(/accessibilityRole=\{failed \? "alert" : undefined\}/);
  });

  it("gives its action a full tap target", () => {
    expect(source).toMatch(/min-h-tap-min/);
  });
});
