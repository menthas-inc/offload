// What a phone keeps of an account, and when it lets go of it.
//
// Found on an iPhone on 2026-10-11, TestFlight 0.2.0 (18) against production:
// an account deleted from the phone, the same Apple ID signed in again as a
// new account, and the phone still drew the old one's whole conversation,
// its Done marks and chips and a photo. The rules this locks:
//
// 1. Everything of the account on the phone goes when its session ends here:
//    signed out, deleted, or refused by the server.
// 2. The phone stamps whose copy it holds, and launch checks the stamp before
//    the shell draws. A different account means the copy is somebody else's,
//    so it goes, and the screens holding it in memory are told. No stamp
//    means nobody's, so it goes too.
// 3. What is kept is how this phone draws, and it holds no words.
//
// The screens' part is read from source, since these tests render nothing.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
let storeThrows = false;
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => {
    if (storeThrows) throw new Error("keystore");
    return store.get(key) ?? null;
  },
  setItem: (key: string, value: string) => {
    if (storeThrows) throw new Error("keystore");
    store.set(key, value);
  },
  deleteItemAsync: (key: string) => Promise.resolve(void store.delete(key)),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "afu",
}));

// The cache folder as a set of paths, so what goes can be read back.
const disk = new Set<string>();
vi.mock("expo-file-system", () => {
  const join = (parts: (string | { uri: string })[]) => parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/");
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get exists() {
      return [...disk].some((k) => k === this.uri || k.startsWith(this.uri + "/"));
    }
    delete() {
      for (const k of [...disk]) if (k === this.uri || k.startsWith(this.uri + "/")) disk.delete(k);
    }
  }
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get exists() {
      return disk.has(this.uri);
    }
    delete() {
      disk.delete(this.uri);
    }
  }
  return { Directory, File, Paths: { cache: "cache:" } };
});

let dismissed = 0;
vi.mock("expo-notifications", () => ({
  dismissAllNotificationsAsync: () => {
    dismissed += 1;
    return Promise.resolve();
  },
}));

// The session end and the account change are auth's; what they tell is
// captured here, and the account change runs what it would run.
const signedOut: (() => void | Promise<void>)[] = [];
let changed = 0;
vi.mock("../lib/auth", () => ({
  onSignedOut: (listener: () => void | Promise<void>) => {
    signedOut.push(listener);
    return () => undefined;
  },
  accountChanged: async () => {
    changed += 1;
    for (const listener of signedOut) await listener();
  },
}));

const { claimDevice, onClaimed, ACCOUNT_KEYS, PHONE_KEYS } = await import("../lib/device-data");
const { keepForAccount } = await import("../lib/account-keys");

/** What an account leaves on a phone after a week of use. */
function lived(): void {
  store.set("offload_theme", "dark");
  store.set("offload_week_start", "sunday");
  store.set("offload_map_views", '["t1"]');
  store.set("offload_today_notifications_until", "2026-10-11T00:00:00.000Z");
  keepForAccount("offload_labels_t1", '{"labels":["l1"],"none":false}');
  keepForAccount("offload_labels_t2", '{"labels":[],"none":true}');
  for (const path of [
    "cache:/photos/b1-thumb.jpg",
    "cache:/photos/b1-large.jpg",
    "cache:/avatars/a2.png",
    "cache:/voice/note.m4a",
    "cache:/voice-play/v1.m4a",
    "cache:/pdfs/b3/Lease.pdf",
    "cache:/ImagePicker/picked.jpg",
    "cache:/DocumentPicker/x/doc.pdf",
    "cache:/ExpoAudio/recording-1.m4a",
    "cache:/Audio/recording-2.m4a",
    // Android's HTTP cache under every fetch, where a rendition and a mark
    // land on their way to the folders above, and the image cache under a
    // link's preview picture.
    "cache:/http-cache/9f2a.1",
    "cache:/image_cache/v2.ols100.1/42/abc.cnt",
    "cache:/offload.zip",
  ]) {
    disk.add(path);
  }
}

beforeEach(() => {
  store.clear();
  disk.clear();
  storeThrows = false;
  dismissed = 0;
  changed = 0;
});

describe("the session ends on this phone", () => {
  it("takes everything of the account with it, and keeps how the phone draws", async () => {
    lived();
    store.set("offload_account", "a1");
    expect(signedOut.length).toBeGreaterThan(0);
    for (const listener of signedOut) await listener();

    expect([...disk]).toEqual([]);
    expect([...store.keys()].sort()).toEqual(["offload_theme", "offload_week_start"]);
    expect(dismissed).toBe(1);
  });
});

describe("the stamp, read at launch", () => {
  it("leaves the copy alone for the account it belongs to", async () => {
    lived();
    store.set("offload_account", "a1");
    await claimDevice("a1");
    expect(disk.size).toBe(13);
    expect(store.get("offload_map_views")).toBe('["t1"]');
    expect(changed).toBe(0);
  });

  it("forgets another account's copy before the new one is stamped, and tells the screens", async () => {
    lived();
    store.set("offload_account", "a1");
    await claimDevice("a2");
    expect([...disk]).toEqual([]);
    expect(store.has("offload_map_views")).toBe(false);
    expect(store.has("offload_labels_t1")).toBe(false);
    expect(changed).toBe(1);
    expect(store.get("offload_account")).toBe("a2");
  });

  // No stamp is a copy from before this shipped, or one whose account ended
  // without the phone hearing. Either way it is nobody's to keep. Nothing in
  // memory is torn down, so a photo shared behind the gate stays in the draft.
  it("forgets a copy nobody stamped, without tearing down the screens", async () => {
    lived();
    await claimDevice("a1");
    expect([...disk]).toEqual([]);
    expect(store.has("offload_today_notifications_until")).toBe(false);
    expect(changed).toBe(0);
    expect(store.get("offload_account")).toBe("a1");
  });

  // After a sign-out the conversation mounted again with nobody signed in,
  // so it had no tail to show the person who signs in next. Launch claiming
  // the phone is the moment somebody is, and it says so, stamp written.
  it("says who the phone now holds, whatever it found", async () => {
    const heard: { id: string; stamp: string | undefined }[] = [];
    const stop = onClaimed((id) => heard.push({ id, stamp: store.get("offload_account") }));
    await claimDevice("a1");
    await claimDevice("a1");
    await claimDevice("a2");
    stop();
    await claimDevice("a3");
    expect(heard).toEqual([
      { id: "a1", stamp: "a1" },
      { id: "a1", stamp: "a1" },
      { id: "a2", stamp: "a2" },
    ]);
  });

  it("never stops launch when the store cannot be read", async () => {
    lived();
    storeThrows = true;
    await expect(claimDevice("a1")).resolves.toBeUndefined();
    expect([...disk]).toEqual([]);
  });
});

// Every key and folder the app writes is named here, as the account's or as
// the phone's, so one added later without a decision fails this rather than
// surviving the next sign-out.
describe("every store the app writes is accounted for", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const files = (dir: string): string[] =>
    readdirSync(join(root, dir)).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(join(root, path)).isDirectory()) return files(path);
      return /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
  const sources = ["lib", "components", "app"].flatMap(files).map((path) => ({
    path,
    text: readFileSync(join(root, path), "utf8"),
  }));
  const device = readFileSync(join(root, "lib/device-data.ts"), "utf8");

  it("names every secure-storage key, as the account's or the phone's", () => {
    const session = ["offload_cookie", "offload_session_data"];
    const own = ["offload_account", "offload_account_keys"];
    const known = new Set<string>([...ACCOUNT_KEYS, ...PHONE_KEYS, ...session, ...own]);
    for (const { path, text } of sources) {
      if (!text.includes("expo-secure-store")) continue;
      for (const [literal] of text.matchAll(/"offload_[a-z_]+"/g)) {
        expect(known.has(JSON.parse(literal) as string), `${path} writes ${literal}`).toBe(true);
      }
    }
  });

  it("writes a key with a name made at runtime only through the account's own list", () => {
    for (const { path, text } of sources) {
      if (path.endsWith("account-keys.ts") || path.endsWith("auth.ts")) continue;
      expect(text, path).not.toMatch(/SecureStore\.(setItem|setItemAsync)\(\s*(`|[a-z]+Key\()/);
    }
  });

  it("forgets every folder the app makes in the cache", () => {
    for (const { path, text } of sources) {
      for (const [, name] of text.matchAll(/Paths\.cache,\s*"([^"]+)"/g)) {
        expect(device, `${path} keeps ${name}`).toContain(`"${name}"`);
      }
    }
  });
});

describe("the screens let go with it", () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const code = (path: string) =>
    read(path)
      .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")
      .replace(/\s+/g, " ");

  // The conversation lives above the router, so going back to the gate never
  // reached it: it kept the last account's turns, chips and photos for the
  // next one. Keyed on the end of a session, it and every screen under it
  // start again empty (009 AC-32b).
  it("starts the conversation and the screens again when a session ends", () => {
    const layout = code("app/_layout.tsx");
    expect(layout).toContain('import "../lib/device-data"');
    expect(layout).toMatch(/onSignedOut\(/);
    expect(layout).toMatch(/<ConversationProvider key=\{/);
    expect(layout).toContain("router.dismissAll()");
  });

  // One place takes the phone to the gate, after the tree has started again,
  // so a navigation from a screen that is going does not race it.
  it("leaves the way to the gate to the root layout", () => {
    expect(code("components/settings/useSignOut.ts")).not.toContain('router.replace("/")');
    expect(code("app/settings/[page].tsx")).not.toContain('router.replace("/")');
  });

  // A returning person signing in again without a relaunch sees their
  // conversation, as a cold launch shows it.
  it("asks for the conversation's tail again once somebody is signed in", () => {
    const context = code("components/shell/conversation-context.tsx");
    expect(context).toContain("tailAsker(");
    expect(context).toMatch(/onClaimed\(\(\) => askTail\(\)\)/);
  });

  it("checks the stamp before launch opens the shell", () => {
    const index = code("app/index.tsx");
    expect(index).toContain("claimDevice(me.accountId)");
    expect(index.indexOf("claimDevice(")).toBeLessThan(index.indexOf('router.replace("/welcome")'));
  });
});
