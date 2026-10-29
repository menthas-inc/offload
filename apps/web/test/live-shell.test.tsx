// @vitest-environment happy-dom
//
// 048 P2, P3 and W1 in the shell. A change reaches every screen under it as
// `changed`, beside `filed`, which stays the one that marks. The thread list
// reads again on what changes it, and the badges take their two fields from
// the account and nothing else, so a live change never trips the gates.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Changes } from "@offload/widgets";

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/threads" }));

const live = vi.hoisted(() => ({ hear: null as ((changes: Changes) => void) | null, closed: 0 }));
vi.mock("../src/lib/live", () => ({
  openLive: (hear: (changes: Changes) => void) => {
    live.hear = hear;
    return () => {
      live.closed += 1;
    };
  },
}));
vi.mock("../src/components/shell/Sidebar", () => ({
  Sidebar: ({ activityNew, requestsWaiting }: { activityNew: boolean; requestsWaiting: number }) => (
    <p data-badges>{`${activityNew ? "new" : "none"} ${requestsWaiting}`}</p>
  ),
}));
vi.mock("../src/components/shell/Composer", () => ({ Composer: () => null }));

const me = {
  accountId: "a1",
  state: "active",
  displayName: "Jo",
  email: "jo@example.com",
  initials: "JO",
  needsFirstRun: false,
  needsName: false,
  needsConsent: false,
  activityNew: false,
  requestsWaiting: 0,
  atDailyLimit: false,
};
let served = { ...me };
const asked: string[] = [];
vi.stubGlobal("fetch", async (url: string) => {
  const path = new URL(url).pathname;
  asked.push(path);
  if (path === "/api/me") return new Response(JSON.stringify(served), { status: 200 });
  if (path === "/v1/threads") return new Response(JSON.stringify({ groups: [], invitations: [], loose: null }), { status: 200 });
  return new Response("{}", { status: 404 });
});

const { default: ShellLayout } = await import("../src/app/(shell)/layout");
const { useThreads } = await import("../src/components/shell/threads-context");

let seen: ReturnType<typeof useThreads>["changed"][] = [];
function Screen() {
  const { changed } = useThreads();
  seen.push(changed);
  return null;
}

let root: Root;
let host: HTMLElement;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  served = { ...me };
  asked.length = 0;
  seen = [];
  live.hear = null;
  live.closed = 0;
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  await act(async () =>
    root.render(
      <ShellLayout>
        <Screen />
      </ShellLayout>,
    ),
  );
  await settle();
  asked.length = 0;
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.useRealTimers();
});

const settle = async () => {
  for (let i = 0; i < 4; i += 1) await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
};
const hear = async (changes: Changes) => {
  await act(async () => live.hear!(changes));
  await settle();
};
const count = (path: string) => asked.filter((one) => one === path).length;

describe("the shell's live connection", () => {
  it("opens once, and closes with the shell", () => {
    expect(live.hear).not.toBeNull();
    act(() => root.unmount());
    expect(live.closed).toBe(1);
    root = createRoot(host);
  });

  it("hands every change down as changed, with when", async () => {
    await hear({ kinds: ["memories"] });
    expect(seen.at(-1)).toMatchObject({ kinds: ["memories"], at: expect.any(Number) });
  });

  it("reads the thread list again on a thread, a removal, an invitation or everything", async () => {
    // Each past the last one's two seconds, so the floor runs it at once.
    let later = 0;
    for (const kind of ["thread", "removed", "invitation", "all"] as const) {
      asked.length = 0;
      later += 5_000;
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now() + later);
      await hear({ kinds: [kind], threads: ["t1"], removed: ["t1"] });
      vi.useRealTimers();
      expect(count("/v1/threads"), kind).toBe(1);
    }
  });

  it("does not read the thread list for a kind it does not show", async () => {
    await hear({ kinds: ["memories"] });
    await hear({ kinds: ["people"] });
    expect(count("/v1/threads")).toBe(0);
  });

  it("takes the two badges from the account and nothing else", async () => {
    served = { ...me, activityNew: true, requestsWaiting: 2, needsConsent: true };
    await hear({ kinds: ["activity"] });
    expect(count("/api/me")).toBe(1);
    expect(host.querySelector("[data-badges]")?.textContent).toBe("new 2");
    // The consent gate moved on the server, and a live change is not where it
    // is asked: that is the next load's.
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("does not read the account for a kind that is not activity", async () => {
    await hear({ kinds: ["thread"], threads: ["t1"] });
    expect(count("/api/me")).toBe(0);
  });
});
