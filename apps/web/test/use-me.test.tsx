// @vitest-environment happy-dom
//
// Only a 401 sends anyone to the gate.
//
// On 2026-09-30 between 07:33 and 07:42 UTC Railway's edge answered
// "Application not found" (404) with every service healthy. `useMe` read any
// response that was not ok as signed out and sent a good session to
// /sign-in; a fetch that threw, which is what a cross-origin 404 without CORS
// headers does, held the shell blank with no way forward. Either is the app
// not hearing an answer, and the screen holds with a way to ask again.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stable, as Next's is: the hook's effect depends on it.
const replace = vi.fn();
const router = { replace };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

let answer: () => Promise<Response>;
vi.stubGlobal("fetch", vi.fn(() => answer()));

const { useMe } = await import("../src/lib/use-me");
type MeState = ReturnType<typeof useMe>;

const ME = { accountId: "a1", state: "active", displayName: "Ana", email: "ana@example.com", needsFirstRun: false, needsName: false };

let seen: MeState[] = [];
function Reads() {
  seen.push(useMe("shell"));
  return null;
}

let root: Root;
const last = () => seen[seen.length - 1]!;
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  replace.mockClear();
  seen = [];
  root = createRoot(document.body.appendChild(document.createElement("div")));
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

async function mount() {
  await act(async () => root.render(<Reads />));
  await settle();
}

describe("the shell's first question", () => {
  it("is ready with the account when the server knows the session", async () => {
    answer = () => Promise.resolve(new Response(JSON.stringify(ME), { status: 200 }));
    await mount();
    expect(last()).toEqual({ status: "ready", me: ME });
    expect(replace).not.toHaveBeenCalled();
  });

  it("goes to the gate on a 401", async () => {
    answer = () => Promise.resolve(new Response('{"error":"unauthenticated"}', { status: 401 }));
    await mount();
    expect(replace).toHaveBeenCalledWith("/sign-in");
  });

  it("holds on the edge's 404 rather than going to the gate", async () => {
    answer = () => Promise.resolve(new Response("Application not found", { status: 404 }));
    await mount();
    expect(replace).not.toHaveBeenCalled();
    expect(last().status).toBe("unreachable");
  });

  it("holds on a 502", async () => {
    answer = () => Promise.resolve(new Response("Bad gateway", { status: 502 }));
    await mount();
    expect(replace).not.toHaveBeenCalled();
    expect(last().status).toBe("unreachable");
  });

  it("holds, rather than staying blank, when the fetch throws", async () => {
    answer = () => Promise.reject(new TypeError("Failed to fetch"));
    await mount();
    expect(replace).not.toHaveBeenCalled();
    expect(last().status).toBe("unreachable");
  });

  it("asks again on retry, and lands when the answer comes", async () => {
    answer = () => Promise.resolve(new Response("Application not found", { status: 404 }));
    await mount();
    const held = last();
    if (held.status !== "unreachable") throw new Error(`expected unreachable, got ${held.status}`);

    answer = () => Promise.resolve(new Response(JSON.stringify(ME), { status: 200 }));
    await act(async () => held.retry());
    await settle();

    expect(last()).toEqual({ status: "ready", me: ME });
    expect(replace).not.toHaveBeenCalled();
  });

  // 027 AC-29. Launch's wait grows with each ask and honours Retry-After.
  it("says how many times it has asked, and how long the server asked it to wait", async () => {
    answer = () => Promise.resolve(new Response("Busy", { status: 503, headers: { "retry-after": "30" } }));
    await mount();
    const first = last();
    if (first.status !== "unreachable") throw new Error(`expected unreachable, got ${first.status}`);
    expect(first.attempt).toBe(0);
    expect(first.retryAfter).toBe(30);

    answer = () => Promise.reject(new TypeError("Failed to fetch"));
    await act(async () => first.retry());
    await settle();
    const second = last();
    if (second.status !== "unreachable") throw new Error(`expected unreachable, got ${second.status}`);
    expect(second.attempt).toBe(1);
    expect(second.retryAfter).toBeNull();
  });
});
