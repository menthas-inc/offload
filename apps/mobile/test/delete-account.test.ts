// 035 Deleting an account from a phone.
//
// The word, the three answers the server can give, and what the device does
// with each: only a delete the server confirmed forgets the session here. The
// rest are rules about the screens, read from their source since these tests
// render nothing.

import { existsSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

let answer: { status: number; data: null; error?: string } = { status: 204, data: null };
let throws = false;
const sent: { path: string; init: RequestInit }[] = [];
let forgotten = 0;

vi.mock("../lib/api", () => ({
  send: (path: string, init: RequestInit) => {
    sent.push({ path, init });
    return throws ? Promise.reject(new Error("offline")) : Promise.resolve(answer);
  },
}));
vi.mock("../lib/auth", () => ({
  accountDeleted: () => {
    forgotten += 1;
    return Promise.resolve();
  },
}));

const { deleteAccount, takeDeletedNotice, wordMatches } = await import("../lib/account");

beforeEach(() => {
  answer = { status: 204, data: null };
  throws = false;
  sent.length = 0;
  forgotten = 0;
  takeDeletedNotice();
});

describe("the word (AC-2)", () => {
  it("is delete, whatever its case and the space around it", () => {
    expect(wordMatches("delete")).toBe(true);
    expect(wordMatches(" Delete ")).toBe(true);
    expect(wordMatches("DELETE")).toBe(true);
  });

  it("is nothing short of it", () => {
    expect(wordMatches("")).toBe(false);
    expect(wordMatches("delet")).toBe(false);
    expect(wordMatches("delete it")).toBe(false);
  });
});

describe("the delete", () => {
  it("sends the word as the server reads it, forgets the session and leaves a notice once", async () => {
    expect(await deleteAccount(" Delete ")).toBe("done");
    expect(sent).toEqual([{ path: "/api/me", init: { method: "DELETE", body: JSON.stringify({ confirm: "delete" }) } }]);
    expect(forgotten).toBe(1);
    expect(takeDeletedNotice()).toBe(true);
    expect(takeDeletedNotice()).toBe(false);
  });

  it("keeps the session when the last staff owner is refused", async () => {
    answer = { status: 409, data: null, error: "last_owner" };
    expect(await deleteAccount("delete")).toBe("last_owner");
    expect(forgotten).toBe(0);
    expect(takeDeletedNotice()).toBe(false);
  });

  it("keeps the session when it did not go through, however it failed", async () => {
    answer = { status: 500, data: null };
    expect(await deleteAccount("delete")).toBe("failed");
    answer = { status: 0, data: null };
    expect(await deleteAccount("delete")).toBe("failed");
    throws = true;
    expect(await deleteAccount("delete")).toBe("failed");
    expect(forgotten).toBe(0);
  });
});

describe("the screens", () => {
  const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  // Comments out, and wrapped copy back onto one line.
  const code = (path: string) =>
    read(path)
      .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")
      .replace(/\s+/g, " ");

  it("has a sheet whose field does not capitalise, correct or spell-check", () => {
    expect(existsSync(new URL("../components/settings/DeleteAccountSheet.tsx", import.meta.url))).toBe(true);
    const sheet = code("components/settings/DeleteAccountSheet.tsx");
    expect(sheet).toContain('autoCapitalize="none"');
    expect(sheet).toContain("autoCorrect={false}");
    expect(sheet).toContain("spellCheck={false}");
    expect(sheet).toContain('accessibilityLabel="Type delete to confirm"');
    expect(sheet).toContain('keyboard="lift"');
  });

  it("says what happened and never why", () => {
    const sheet = code("components/settings/DeleteAccountSheet.tsx");
    expect(sheet).toContain("Couldn&apos;t delete your account");
    expect(sheet).toContain("Hand offload&apos;s ownership to someone else first.");
    expect(sheet).toContain("leaves what you added with the others");
    expect(sheet).not.toMatch(/network|server|seems|went wrong/i);
  });

  it("puts Shared threads above Delete account on My account, with no noun", () => {
    const page = code("app/settings/[page].tsx");
    const shared = page.indexOf('title="Shared threads"');
    const del = page.indexOf('title="Delete account"');
    expect(shared).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(shared);
    expect(page).toContain("Everything only you can see goes with it. There's no undo.");
    expect(page).not.toMatch(/Everything offload knows|private things/);
  });

  it("says the account is deleted on both sign-in screens, from the one string", () => {
    expect(read("lib/gate.ts")).toContain('deleted: "Your account is deleted."');
    for (const screen of ["components/screens/SignIn.ios.tsx", "components/screens/SignIn.android.tsx"]) {
      const source = code(screen);
      expect(source).toContain("takeDeletedNotice()");
      expect(source).toContain("GATE.signIn.deleted");
    }
  });

  it("writes none of it with a dash", () => {
    for (const file of ["components/settings/DeleteAccountSheet.tsx", "lib/account.ts"]) {
      expect(read(file)).not.toMatch(/[–—]/);
    }
  });
});
