// Secure-storage keys named at runtime, and the list that names them.
//
// From the security review of PR 108 (2026-10-11). A name came off the list
// before its value's delete had gone through, so a delete that failed left a
// value on the phone that nothing could find again; the list's own delete
// raced the next key being listed; and the values were written in the store's
// default class, which a backup restored onto another phone carries. The
// rules: a name leaves the list only once its value has, and every value is
// this device's only.

import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const classes = new Map<string, unknown>();
/** Deletes that fail, and deletes held until the test lets them go. */
let failing = new Set<string>();
let holding = false;
const held: (() => void)[] = [];

vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string, options?: { keychainAccessible?: unknown }) => {
    store.set(key, value);
    classes.set(key, options?.keychainAccessible);
  },
  deleteItemAsync: (key: string) => {
    const run = () => {
      if (failing.has(key)) throw new Error("keystore");
      store.delete(key);
    };
    if (!holding) return Promise.resolve().then(run);
    return new Promise<void>((resolve, reject) =>
      held.push(() => {
        try {
          run();
          resolve();
        } catch (error) {
          reject(error);
        }
      }),
    );
  },
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "afu-device-only",
}));

const { accountKeys, dropForAccount, forgetAccountKeys, keepForAccount } = await import("../lib/account-keys");

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const key = (i: number) => `offload_labels_00000000-0000-0000-0000-${String(i).padStart(12, "0")}`;

beforeEach(() => {
  store.clear();
  classes.clear();
  failing = new Set();
  holding = false;
  held.length = 0;
});

describe("a name leaves the list only once its value has", () => {
  it("a value dropped whose delete fails stays listed, for the sign-out to take", async () => {
    keepForAccount(key(1), "a");
    failing.add(key(1));
    dropForAccount(key(1));
    await settle();
    expect(store.has(key(1))).toBe(true);
    expect(accountKeys()).toEqual([key(1)]);
  });

  it("a value dropped is unlisted once it has gone", async () => {
    keepForAccount(key(1), "a");
    keepForAccount(key(2), "b");
    dropForAccount(key(1));
    await settle();
    expect(store.has(key(1))).toBe(false);
    expect(accountKeys()).toEqual([key(2)]);
  });

  it("the oldest let go to make room stays listed while its delete fails", async () => {
    failing.add(key(0));
    for (let i = 0; i <= 32; i++) keepForAccount(key(i), "x");
    await settle();
    expect(store.has(key(0))).toBe(true);
    expect(accountKeys()).toContain(key(0));
    failing.clear();
    keepForAccount(key(33), "x");
    await settle();
    expect(store.has(key(0))).toBe(false);
    expect(accountKeys()).not.toContain(key(0));
  });

  // The last name dropped and a new one listed before the store answered:
  // the list's delete landed after, and took the new name with it.
  it("an emptied list never takes a name listed after it", async () => {
    keepForAccount(key(1), "a");
    holding = true;
    dropForAccount(key(1));
    keepForAccount(key(2), "b");
    for (const release of held.splice(0)) release();
    await settle();
    expect(store.get(key(2))).toBe("b");
    expect(accountKeys()).toEqual([key(2)]);
  });

  it("sign-out deletes every value, and the list once they have all gone", async () => {
    keepForAccount(key(1), "a");
    keepForAccount(key(2), "b");
    failing.add(key(2));
    await forgetAccountKeys();
    expect(store.has(key(1))).toBe(false);
    expect(accountKeys()).toEqual([key(2)]);
    failing.clear();
    await forgetAccountKeys();
    expect([...store.keys()]).toEqual([]);
  });
});

describe("every value is this device's only", () => {
  it("the value and the list", () => {
    keepForAccount(key(1), "a");
    expect(classes.get(key(1))).toBe("afu-device-only");
    expect(classes.get("offload_account_keys")).toBe("afu-device-only");
  });
});
