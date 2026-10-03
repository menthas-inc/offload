// @vitest-environment happy-dom
//
// 034 AC-7, AC-50 and AC-51, on the Staff page: the kit's table with your own
// row fixed, add by address from a dialog that says why it was refused, a
// role switched in place, and remove behind a confirmation.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/admin/staff", useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { default: StaffPage } = await import("../src/app/(admin)/admin/staff/page");

const ME = { id: "a1", name: "Ada Boss", email: "ada@example.test", role: "owner", added: "2026-06-03T10:00:00.000Z", lastHere: "2026-10-02T09:30:00.000Z", you: true };
const SAM = { id: "s1", name: "Sam Okoro", email: "sam@example.test", role: "support", added: "2026-09-12T10:00:00.000Z", lastHere: null, you: false };
const LIST = { staff: [ME, SAM], owners: 1 };

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];

function api(answers: { list?: number; write?: { status: number; body?: unknown }; hold?: boolean } = {}) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const method = init?.method ?? "GET";
      if (method !== "GET") {
        if (answers.hold) return new Promise<Response>(() => {});
        return new Response(JSON.stringify(answers.write?.body ?? {}), { status: answers.write?.status ?? 200 });
      }
      return new Response(JSON.stringify(LIST), { status: answers.list ?? 200 });
    }),
  );
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function open() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => root.render(<StaffPage />));
  await settle();
  return host;
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
const button = (host: Element, text: string) => [...host.querySelectorAll("button")].find((one) => one.textContent === text)!;
const click = async (node: Element) => {
  await act(async () => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await settle();
};
const rows = (host: Element) => [...host.querySelectorAll('[role="table"]')[0]!.querySelectorAll('[role="row"]')].slice(1);
const writes = () => calls.filter((call) => call.init?.method && call.init.method !== "GET");

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("AC-7 the states", () => {
  it("shows one spinner while it loads", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.body.appendChild(document.createElement("div"));
    await act(async () => createRoot(host).render(<StaffPage />));
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(host.querySelector('[role="table"]')).toBeNull();
  });

  it("says a failed read failed, beside Try again, and draws no list", async () => {
    api({ list: 500 });
    const host = await open();
    expect(host.textContent).toContain("Couldn't load staff.");
    expect(button(host, "Try again")).toBeDefined();
    expect(host.querySelector('[role="table"]')).toBeNull();
  });
});

describe("the list", () => {
  it("says how many people can open the panel, and how many are owners", async () => {
    api();
    const host = await open();
    expect(host.querySelector("h1")!.textContent).toBe("Staff");
    expect(host.textContent).toContain("2 people can open this panel · 1 owner");
    expect(host.textContent).not.toContain("1 owners");
  });

  it("draws each person with their role, when they were added and when they were last here", async () => {
    api();
    const host = await open();
    const [me, sam] = rows(host);
    expect(me!.textContent).toContain("Ada Boss · you");
    expect(me!.textContent).toContain("ada@example.test");
    expect(me!.textContent).toContain("3 Jun");
    expect(sam!.textContent).toContain("Sam Okoro");
    expect(sam!.textContent).toContain("12 Sept");
    expect(sam!.textContent).toContain("never");
  });

  it("does not draw what you may not do to yourself", async () => {
    api();
    const host = await open();
    const [me, sam] = rows(host);
    expect(me!.querySelectorAll("button")).toHaveLength(0);
    expect(me!.textContent).toContain("Ownerfixed");
    expect(me!.textContent).toContain("you cannot remove yourself");
    expect([...sam!.querySelectorAll("button")].map((one) => one.textContent)).toEqual(["Owner", "Support", "Remove"]);
    expect(button(sam!, "Support").getAttribute("aria-pressed")).toBe("true");
    expect(button(sam!, "Owner").getAttribute("aria-pressed")).toBe("false");
  });

  it("says what each role can do, and the rules, as they are", async () => {
    api();
    const host = await open();
    expect(host.textContent).toContain("What the two roles can do");
    expect(host.textContent).toContain("Waitlist, People and a person's page");
    expect(host.textContent).toContain("Health, Costs, Limits, Staff and Audit");
    expect(host.textContent).toContain("There is always at least one owner.");
    expect(host.textContent).toContain("on their next request");
    // The kit's rules that are no longer true.
    expect(host.textContent).not.toContain("offload.app address");
    expect(host.textContent).not.toContain("the difference is money");
    expect(host.textContent).not.toContain("immediately");
  });
});

describe("a role, switched in place", () => {
  it("sends the new role and says so", async () => {
    api({ write: { status: 200, body: { role: "owner" } } });
    const host = await open();
    await click(button(rows(host)[1]!, "Owner"));
    const [patch] = writes();
    expect(patch!.url).toMatch(/\/v1\/admin\/staff\/s1$/);
    expect(patch!.init).toMatchObject({ method: "PATCH", credentials: "include" });
    expect(JSON.parse(String(patch!.init!.body))).toEqual({ role: "owner" });
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Sam is now owner");
  });

  it("does nothing for the role they already have", async () => {
    api();
    const host = await open();
    await click(button(rows(host)[1]!, "Support"));
    expect(writes()).toEqual([]);
  });

  it("says what did not happen when it is refused", async () => {
    api({ write: { status: 409, body: { error: "last_owner" } } });
    const host = await open();
    await click(button(rows(host)[1]!, "Owner"));
    expect(host.querySelector('[role="status"]')!.textContent).toBe("There has to be an owner. The role is unchanged.");
  });
});

describe("add someone", () => {
  async function dialogFor(host: Element) {
    await click(button(host, "Add someone"));
    return host.querySelector('[role="dialog"]')!;
  }

  it("asks for an address and a role, and says nothing is emailed", async () => {
    api();
    const host = await open();
    const dialog = await dialogFor(host);
    expect(dialog.textContent).toContain("Add someone to staff");
    expect(dialog.textContent).toContain("They sign in with Apple or Google on this address. Nothing is emailed, so tell them yourself.");
    expect(dialog.querySelectorAll("input")).toHaveLength(1);
    expect(button(dialog, "Support").getAttribute("aria-pressed")).toBe("true");
    expect((button(dialog, "Add to staff") as HTMLButtonElement).disabled).toBe(true);
  });

  it("posts the address and the role, closes, and says Added to staff", async () => {
    api({ write: { status: 200, body: { id: "n1" } } });
    const host = await open();
    const dialog = await dialogFor(host);
    await act(async () => type(dialog.querySelector("input")!, " new@example.test "));
    await click(button(dialog, "Owner"));
    await click(button(dialog, "Add to staff"));

    const [post] = writes();
    expect(post!.url).toMatch(/\/v1\/admin\/staff$/);
    expect(post!.init).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(String(post!.init!.body))).toEqual({ email: "new@example.test", role: "owner" });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Added to staff");
    // And the list is read again.
    expect(calls.filter((call) => !call.init?.method && call.url.endsWith("/v1/admin/staff"))).toHaveLength(2);
  });

  for (const [code, line] of [
    ["no_account", "No active account has that address."],
    ["two_sign_ins", "That account signs in two ways. Use one that signs in one way."],
    ["already_staff", "They are already staff."],
  ] as const) {
    it(`keeps the dialog open and says one plain line for ${code}`, async () => {
      api({ write: { status: 409, body: { error: code } } });
      const host = await open();
      const dialog = await dialogFor(host);
      await act(async () => type(dialog.querySelector("input")!, "new@example.test"));
      await click(button(dialog, "Add to staff"));

      const still = host.querySelector('[role="dialog"]')!;
      expect(still).not.toBeNull();
      expect(still.querySelector('[role="alert"]')!.textContent).toBe(line);
      expect(host.querySelector('[role="status"]')).toBeNull();
    });
  }

  it("says what did not happen when the write fails outright", async () => {
    api({ write: { status: 500 } });
    const host = await open();
    const dialog = await dialogFor(host);
    await act(async () => type(dialog.querySelector("input")!, "new@example.test"));
    await click(button(dialog, "Add to staff"));
    expect(host.querySelector('[role="dialog"] [role="alert"]')!.textContent).toBe("That did not go through. Nobody was added.");
  });
});

describe("remove", () => {
  it("asks first, saying what happens, and does nothing on Cancel", async () => {
    api();
    const host = await open();
    await click(button(rows(host)[1]!, "Remove"));
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Remove Sam Okoro?");
    expect(dialog.textContent).toContain("They lose this panel on their next request. Their own offload account is untouched");
    await click(button(dialog, "Cancel"));
    expect(writes()).toEqual([]);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it("removes on confirm and says so", async () => {
    api({ write: { status: 200, body: { status: "removed" } } });
    const host = await open();
    await click(button(rows(host)[1]!, "Remove"));
    await click(button(host.querySelector('[role="dialog"]')!, "Remove"));
    const [del] = writes();
    expect(del!.url).toMatch(/\/v1\/admin\/staff\/s1$/);
    expect(del!.init).toMatchObject({ method: "DELETE", credentials: "include" });
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Sam no longer has access");
  });

  it("says nobody was removed when it does not go through", async () => {
    api({ write: { status: 500 } });
    const host = await open();
    await click(button(rows(host)[1]!, "Remove"));
    await click(button(host.querySelector('[role="dialog"]')!, "Remove"));
    expect(host.querySelector('[role="status"]')!.textContent).toBe("That did not go through. Nobody was removed.");
  });
});
