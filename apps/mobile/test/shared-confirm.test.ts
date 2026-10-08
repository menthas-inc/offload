// 2026-10-07. In a shared thread archive hides a row for everyone, so it asks
// first and says so; a thread with others in it is left, not deleted, and the
// question names who it stays with. The words are the widgets' own; the
// screens are read from their source, since these tests render nothing.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const thread = read("../components/screens/Thread.tsx");
const today = read("../components/today/useTodayRows.tsx");
const threads = read("../components/screens/MyThreads.tsx");
const row = read("../components/shell/ThreadRow.tsx");

describe("archiving in a shared thread", () => {
  it("asks on the thread, where its people are known", () => {
    expect(thread).toMatch(/asksBeforeArchive\(\w+, shared\)/);
    expect(thread).toMatch(/<ConfirmSheet[\s\S]*archiveAsk\([\s\S]*ARCHIVE_SHARED[\s\S]*action="Archive"/);
    // Every archive goes through the question.
    expect(thread).not.toMatch(/run: \(\) => archive\(acting\)/);
  });

  it("asks on Today for a row that is not yours", () => {
    expect(today).toMatch(/asksBeforeArchive\(\w+, null\)/);
    expect(today).toMatch(/<ConfirmSheet[\s\S]*ARCHIVE_SHARED/);
    expect(today).not.toMatch(/run: \(\) => archive\(acting\)/);
  });
});

describe("leaving a shared thread from My threads", () => {
  it("says Leave and asks, naming who it stays with", () => {
    expect(threads).toMatch(/leaveAsk\(/);
    expect(threads).toMatch(/staysWith\(/);
    expect(threads).toMatch(/action="Leave"/);
    expect(row).toMatch(/leaves \? "Leave" : "Delete"/);
  });
});
