// @vitest-environment happy-dom
//
// 031 My account on the web (T3.7): Profile, Where you are, Signed in on,
// Sign out.
//
// Signed in on in its three states (AC-5): this device first whatever the
// list does; only this device says Nowhere else; others carry End and End all
// other sessions; a failed list says so beside Try again and never Nothing
// else. And Email's note follows the sign-in providers (AC-4).

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/settings/account" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const HERE_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15";
let sessions: { token: string; userAgent: string | null; createdAt: string }[] = [];
let listFails = false;
let listReads = 0;
const revoked: string[] = [];
let revokedOthers = 0;
let revokeRefused = false;
let signedOut = 0;

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    listSessions: () => {
      listReads += 1;
      return listFails ? Promise.reject(new Error("offline")) : Promise.resolve({ data: sessions, error: null });
    },
    getSession: () =>
      Promise.resolve({ data: { session: { token: "here", userAgent: HERE_UA, createdAt: "2026-09-20T10:00:00Z" } }, error: null }),
    revokeSession: ({ token }: { token: string }) => {
      if (revokeRefused) return Promise.resolve({ data: null, error: { status: 500, message: "down" } });
      revoked.push(token);
      sessions = sessions.filter((s) => s.token !== token);
      return Promise.resolve({ data: { status: true }, error: null });
    },
    revokeOtherSessions: () => {
      if (revokeRefused) return Promise.resolve({ data: null, error: { status: 500, message: "down" } });
      revokedOthers += 1;
      sessions = sessions.filter((s) => s.token === "here");
      return Promise.resolve({ data: { status: true }, error: null });
    },
    signOut: () => {
      signedOut += 1;
      return Promise.resolve({});
    },
    signIn: { social: () => Promise.resolve({}) },
  }),
}));

let providers: string[] = ["google"];
// 035. What DELETE /api/me answers, and what it was sent.
let deleteStatus = 204;
const deletes: unknown[] = [];
vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  const path = new URL(url).pathname;
  if (path === "/api/me" && init?.method === "DELETE") {
    deletes.push(JSON.parse(String(init.body)));
    return deleteStatus === 204 ? new Response(null, { status: 204 }) : json({ error: "last_owner" }, deleteStatus);
  }
  if (path === "/api/countries") return json({ countries: [{ code: "PT", name: "Portugal" }] });
  if (path === "/api/me")
    return json({
      accountId: "a1",
      state: "active",
      displayName: "Jo Martins",
      email: "jo@hey.com",
      initials: "JM",
      needsFirstRun: false,
      needsName: false,
      country: "PT",
      signInProviders: providers,
    });
  return json({}, 404);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const { AccountPane } = await import("../src/components/panes/Account");

const HERE = { token: "here", userAgent: HERE_UA, createdAt: "2026-09-20T10:00:00Z" };
const OLD = { token: "old", userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/128.0 Safari/537.36", createdAt: "2026-09-14T10:00:00Z" };
const PHONE = { token: "phone", userAgent: "offload/1 CFNetwork/1498 Darwin/23.5.0", createdAt: "2026-08-02T10:00:00Z" };

beforeEach(() => {
  sessions = [HERE];
  listFails = false;
  listReads = 0;
  revoked.length = 0;
  revokedOthers = 0;
  revokeRefused = false;
  signedOut = 0;
  providers = ["google"];
  deleteStatus = 204;
  deletes.length = 0;
  router.replace.mockClear();
});

afterEach(() => {
  document.body.innerHTML = "";
});

async function render() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () => createRoot(host).render(<AccountPane />));
  // The reads settle over a few turns.
  for (let i = 0; i < 5; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
  return host;
}

const section = (host: HTMLElement, heading: string) =>
  [...host.querySelectorAll("section")].find((s) => s.querySelector("h2")?.textContent?.startsWith(heading))!;

const button = (root: Element, text: string) =>
  [...root.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes(text))!;

describe("My account's sections", () => {
  it("draws Profile, Where you are and Signed in on as headings, and Sign out with none", async () => {
    const host = await render();
    expect([...host.querySelectorAll("h2")].map((h) => h.textContent)).toEqual(["Profile", "Where you are", "Signed in on"]);
    expect(section(host, "Profile").textContent).toContain("How you appear to people you share with.");
    expect(section(host, "Where you are").textContent).toContain(
      "Used to show dates and times in local time.",
    );
    expect(section(host, "Signed in on").textContent).toContain("Ending a session signs that device out on its next request.");
    expect(host.querySelector('button[aria-label="Country"]')?.textContent).toContain("Portugal");
  });

  it("says where the email came from (AC-4)", async () => {
    let host = await render();
    expect(section(host, "Profile").textContent).toContain("From your Google sign in. Changing it is not done here.");
    document.body.innerHTML = "";
    providers = ["apple", "google"];
    host = await render();
    expect(section(host, "Profile").textContent).toContain("From your sign in. Changing it is not done here.");
  });

  it("signs out from its own row and goes to the gate", async () => {
    const host = await render();
    await act(async () => button(host, "Sign out").click());
    for (let i = 0; i < 3; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(signedOut).toBe(1);
    expect(router.replace).toHaveBeenCalledWith("/sign-in");
  });
});

describe("Signed in on (AC-5)", () => {
  it("only this device: this device first with its pill, then Nowhere else", async () => {
    const host = await render();
    const rows = section(host, "Signed in on").textContent ?? "";
    expect(rows).toContain("Safari on MacThis device");
    expect(rows).toContain("Nowhere elseSign in on another device and it shows here.");
    expect(rows).not.toContain("Nothing else");
    expect(rows).not.toContain("End all other sessions");
  });

  it("several: each other with its date and End, then End all other sessions", async () => {
    sessions = [OLD, HERE, PHONE];
    const host = await render();
    const signedIn = section(host, "Signed in on");
    const text = signedIn.textContent ?? "";
    expect(text.indexOf("Safari on Mac")).toBeLessThan(text.indexOf("Chrome on Windows"));
    // The runtime's short month: Sep or Sept, as everywhere else this formats.
    expect(text).toMatch(/Chrome on WindowsSince 14 Sept?End/);
    expect(text).toContain("The app on iPhoneSince 2 AugEnd");
    expect(text).not.toContain("Nowhere else");

    await act(async () => signedIn.querySelector<HTMLButtonElement>('[aria-label="End the session on Chrome on Windows"]')!.click());
    for (let i = 0; i < 3; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(revoked).toEqual(["old"]);
    expect(section(host, "Signed in on").textContent).not.toContain("Chrome on Windows");

    await act(async () => button(section(host, "Signed in on"), "End all other sessions").click());
    for (let i = 0; i < 3; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(revokedOthers).toBe(1);
    expect(revoked).toEqual(["old"]);
    expect(section(host, "Signed in on").textContent).toContain("Nowhere else");
  });

  it("a failed list: this device, then the line and Try again, never Nothing else", async () => {
    listFails = true;
    const host = await render();
    const signedIn = section(host, "Signed in on");
    const text = signedIn.textContent ?? "";
    expect(text).toContain("Safari on MacThis device");
    expect(text).toContain("Couldn't load your other devices.");
    expect(text).not.toContain("Nothing else");
    expect(text).not.toContain("Nowhere else");

    listFails = false;
    sessions = [HERE, OLD];
    const reads = listReads;
    await act(async () => button(signedIn, "Try again").click());
    for (let i = 0; i < 3; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(listReads).toBe(reads + 1);
    expect(section(host, "Signed in on").textContent).toContain("Chrome on Windows");
    expect(section(host, "Signed in on").textContent).not.toContain("Couldn't load");
  });

  it("a refused End says so beside Try again, rather than nothing (security review)", async () => {
    sessions = [OLD, HERE];
    revokeRefused = true;
    const host = await render();
    await act(async () => section(host, "Signed in on").querySelector<HTMLButtonElement>('[aria-label="End the session on Chrome on Windows"]')!.click());
    for (let i = 0; i < 3; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
    const text = section(host, "Signed in on").textContent ?? "";
    expect(text).toContain("Chrome on Windows");
    expect(text).toContain("That didn't go through.");

    revokeRefused = false;
    await act(async () => button(section(host, "Signed in on"), "Try again").click());
    for (let i = 0; i < 3; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(revoked).toEqual(["old"]);
    expect(section(host, "Signed in on").textContent).not.toContain("That didn't go through.");
  });
});

// 035 AC-1, AC-2. The danger panel, and a confirmation that takes a typed word.
describe("Delete your account", () => {
  function type(input: HTMLInputElement, value: string) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
  const settle = async () => {
    for (let i = 0; i < 4; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
  };
  async function open(host: HTMLElement) {
    const panel = host.querySelector<HTMLElement>('[aria-label="Delete your account"]')!;
    await act(async () => button(panel, "Delete account").click());
    return dialog()!;
  }

  it("draws the panel with no heading of its own, and says what stays", async () => {
    const host = await render();
    const panel = host.querySelector<HTMLElement>('[aria-label="Delete your account"]')!;
    expect(panel.textContent).toContain("Delete your account");
    expect(panel.textContent).toContain("Everything only you can see goes with it. There's no undo.");
    expect(panel.querySelector("h2")).toBeNull();
    expect(dialog()).toBeNull();
  });

  it("keeps the button off until the word is typed, and Cancel sends nothing", async () => {
    const host = await render();
    const box = await open(host);
    expect(box.textContent).toContain("leaves what you added with the others");
    const field = box.querySelector<HTMLInputElement>('input[aria-label="Type delete to confirm"]')!;
    expect(field.getAttribute("autocapitalize")).toBe("none");
    expect(field.getAttribute("spellcheck")).toBe("false");
    expect(button(box, "Delete account").disabled).toBe(true);
    await act(async () => type(field, "delet"));
    expect(button(box, "Delete account").disabled).toBe(true);
    await act(async () => type(field, " Delete "));
    expect(button(box, "Delete account").disabled).toBe(false);
    await act(async () => button(box, "Cancel").click());
    expect(dialog()).toBeNull();
    expect(deletes).toEqual([]);
  });

  it("deletes on the word and lands on sign in saying so", async () => {
    const host = await render();
    const box = await open(host);
    await act(async () => type(box.querySelector<HTMLInputElement>("input")!, "delete"));
    await act(async () => button(box, "Delete account").click());
    await settle();
    expect(deletes).toEqual([{ confirm: "delete" }]);
    expect(router.replace).toHaveBeenCalledWith("/sign-in?deleted=1");
  });

  it("says a failure and offers Try again, without leaving", async () => {
    deleteStatus = 500;
    const host = await render();
    const box = await open(host);
    await act(async () => type(box.querySelector<HTMLInputElement>("input")!, "delete"));
    await act(async () => button(box, "Delete account").click());
    await settle();
    expect(box.querySelector('[role="alert"]')?.textContent).toBe("Couldn't delete your account");
    expect(button(box, "Try again")).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("tells the last staff owner to hand ownership over, with nothing to retry", async () => {
    deleteStatus = 409;
    const host = await render();
    const box = await open(host);
    await act(async () => type(box.querySelector<HTMLInputElement>("input")!, "delete"));
    await act(async () => button(box, "Delete account").click());
    await settle();
    expect(box.querySelector('[role="alert"]')?.textContent).toBe("Hand offload's ownership to someone else first.");
    expect(button(box, "Try again")).toBeUndefined();
    expect(button(box, "Delete account")).toBeUndefined();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
