// 2026-10-07. A thread made by hand on the phones: the plus in My threads'
// bar opens Edit thread's sheet as New thread, Create makes it with what the
// sheet showed, and the screen opens on it. The screens are read from their
// source, since these tests render nothing.

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const calls: { path: string; init: RequestInit }[] = [];
vi.mock("../lib/api", () => ({
  send: (path: string, init: RequestInit = {}) => {
    calls.push({ path, init });
    return Promise.resolve({ status: 200, data: { thread: { id: "n1", name: "Dentist", icon: "stethoscope", hue: 2 } } });
  },
}));
vi.mock("expo-file-system", () => ({ File: class {} }));
vi.mock("expo-secure-store", () => ({ getItem: () => null, setItem: () => undefined, deleteItemAsync: () => Promise.resolve() }));

const threads = await import("../lib/threads");
const screen = readFileSync(new URL("../components/screens/MyThreads.tsx", import.meta.url), "utf8");
const sheet = readFileSync(new URL("../components/screens/EditThreadSheet.tsx", import.meta.url), "utf8");

describe("a new thread from My threads", () => {
  it("posts what the sheet showed and answers with the thread", async () => {
    const made = await threads.createThread({ name: "Dentist", icon: "stethoscope", hue: 2 });
    expect(calls[0]?.path).toBe("/v1/threads");
    expect(calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ name: "Dentist", icon: "stethoscope", hue: 2 });
    expect(made).toEqual({ id: "n1", name: "Dentist" });
  });

  it("has a plus in the bar that opens the sheet as New thread, and opens what it made", () => {
    expect(screen).toContain('accessibilityLabel="New thread"');
    expect(screen).toMatch(/<EditThreadSheet[\s\S]*heading="New thread"[\s\S]*action="Create"/);
    expect(screen).toMatch(/createThread\(/);
    expect(sheet).toContain("{heading}");
    expect(sheet).toContain("{action}");
  });
});
