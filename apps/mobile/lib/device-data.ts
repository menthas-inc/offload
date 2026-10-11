// What this phone keeps of the account signed in on it, and letting go of it.
//
// The server holds the account. The phone holds copies, for speed or because
// a platform needs a file: photo renditions and people's marks fetched once,
// voice notes waiting to be sent or being heard, a PDF in the viewer, a picked
// or shared file on its way up, an export on its way to Files, a few choices
// kept per thread, and whatever a notification left on the lock screen. On 2026-10-11 a
// phone that deleted its account and signed in again as a new one still drew
// the old conversation, its chips and a photo, because nothing here knew the
// account had gone.
//
// Two rules. Everything listed here goes when a session ends on this phone,
// however it ended (`onSignedOut`). And the phone stamps whose copy it holds:
// launch reads the stamp before the shell draws, and a copy stamped for
// somebody else, or for nobody, goes first. That covers an account deleted on
// the web while this phone was away, a Keychain that outlived a reinstall, and
// any path that ends a session without this hearing it.
//
// Imported once by the root layout, so it is listening before anything can
// sign out. The layout claims the phone at launch whatever route opened, and
// the index route waits on the same claim before the shell.

import * as SecureStore from "expo-secure-store";
import { Directory, File, Paths } from "expo-file-system";
import * as Notifications from "expo-notifications";
import { accountChanged, onSignedOut } from "./auth";
import { DEVICE_ONLY, forgetAccountKeys } from "./account-keys";
import { copyForgotten } from "./session-end";
import { SHARED } from "./shared-in";
import { within } from "./within";

/** Fixed names in secure storage that belong to the account: the threads left
 *  on Map, and Today's put-off of the notifications card. Names made at
 *  runtime are in `account-keys.ts`; the session's own are `auth.ts`'s. */
export const ACCOUNT_KEYS = ["offload_map_views", "offload_today_notifications_until"] as const;

/** Kept. How this phone draws, chosen on it: the theme and the first day of
 *  the week. Neither holds a word of anybody's. */
export const PHONE_KEYS = ["offload_theme", "offload_week_start"] as const;

/** Folders in the app's cache: ours, the ones expo's pickers and recorder
 *  write a file to before it is ours (`ExpoAudio` on iOS, `Audio` on
 *  Android), and on Android React Native's HTTP cache, which keeps a
 *  rendition or a mark that the server let a client cache, and Fresco's,
 *  which keeps a link's preview picture. Both treat a missing file as a miss.
 *  The files shared in from other apps are `SHARED`, below. */
const FOLDERS = [
  "photos",
  "avatars",
  "voice",
  "voice-play",
  "pdfs",
  "ImagePicker",
  "DocumentPicker",
  "ExpoAudio",
  "Audio",
  "http-cache",
  "image_cache",
];

/** The export, while it is on its way to Files. */
const FILES = ["offload.zip"];

/** Which account the copy belongs to. */
const STAMP = "offload_account";

function remove(entry: Directory | File): void {
  try {
    if (entry.exists) entry.delete();
  } catch {
    // Still there: the next launch's stamp check takes it.
  }
}

/** The files at the top of a folder, never the folders in it. */
function looseFiles(dir: Directory): void {
  try {
    for (const entry of dir.list()) if (entry instanceof File) remove(entry);
  } catch {
    // Not there on this platform, or not readable: nothing of ours to clear.
  }
}

/** How long the stores are waited on. The gate and Sign out's button wait on
 *  this, and a keystore or a notification centre that never answers must not
 *  hold the last account's screen up. What a store kept is the next claim's:
 *  another account finds the old stamp, or none, and forgets it all; the same
 *  account finds only its own. */
const PATIENCE_MS = 3000;

/** Every copy of the account on this phone, the stamp with it. Without the
 *  files shared in, which a sign-in that found no stamp leaves in the draft:
 *  `forgetShared` takes those at a session's end. */
async function forgetCopy(): Promise<void> {
  // First, so a photo, a mark or a PDF still on its way down keeps nothing.
  copyForgotten();
  for (const name of FOLDERS) remove(new Directory(Paths.cache, name));
  for (const name of FILES) remove(new File(Paths.cache, name));
  await within(
    (async () => {
      await Promise.all([...ACCOUNT_KEYS, STAMP].map((key) => SecureStore.deleteItemAsync(key).catch(() => undefined)));
      await forgetAccountKeys();
      // A delivered notification carries a few words of what was dumped.
      await Notifications.dismissAllNotificationsAsync().catch(() => undefined);
    })().catch(() => undefined),
    PATIENCE_MS,
    undefined,
  );
}

/** The files shared in from other apps: ours, and whatever expo-share-intent
 *  left where it puts them, the top of the cache on Android and of the app
 *  group's container on iOS (`shared-in.ts`). Loose files only: the
 *  container's folders are the system's. */
function forgetShared(): void {
  remove(new Directory(Paths.cache, SHARED));
  looseFiles(Paths.cache);
  let containers: Directory[] = [];
  try {
    containers = Object.values(Paths.appleSharedContainers);
  } catch {
    // Android has none.
  }
  for (const container of containers) looseFiles(container);
}

/** Everything of the account on this phone, at the end of its session. */
export async function forgetAccountData(): Promise<void> {
  forgetShared();
  await forgetCopy();
}

/** Launch, once the server has said who is signed in, before the shell.
 *
 *  The same account: nothing to forget. Another account's stamp: everything
 *  holding its copy hears it as a sign-out, the screens in memory with it. No
 *  stamp: the copy goes and nothing in memory is touched, since nothing in
 *  memory can be older than this launch or the last sign-out, and a file
 *  shared behind the gate is waiting in the draft. Never throws: a store that
 *  cannot be read is a reason to forget, not to hold launch. Every way,
 *  whoever listens then hears who the phone holds now.
 *
 *  The root layout and the index route both ask at launch, from one answer;
 *  a second ask for the same account while the first runs joins it. */
export function claimDevice(accountId: string): Promise<void> {
  if (claiming?.accountId === accountId) return claiming.done;
  const done = claim(accountId).finally(() => {
    if (claiming?.done === done) claiming = null;
  });
  claiming = { accountId, done };
  return done;
}

let claiming: { accountId: string; done: Promise<void> } | null = null;

async function claim(accountId: string): Promise<void> {
  let stamp: string | null = null;
  try {
    stamp = SecureStore.getItem(STAMP);
  } catch {
    stamp = null;
  }
  if (stamp !== accountId) {
    if (stamp) await accountChanged().catch(() => undefined);
    else await forgetCopy().catch(() => undefined);
    try {
      SecureStore.setItem(STAMP, accountId, DEVICE_ONLY);
    } catch {
      // Unstamped, so the next launch forgets again, which is the safe way round.
    }
  }
  for (const listener of [...claimed]) listener(accountId);
}

const claimed = new Set<(accountId: string) => void>();

/** Hear launch claim the phone for an account, once its copy is settled: the
 *  moment somebody is signed in here, for the conversation, which mounts
 *  again signed out after a sign-out. Returns the way to stop. */
export function onClaimed(listener: (accountId: string) => void): () => void {
  claimed.add(listener);
  return () => {
    claimed.delete(listener);
  };
}

onSignedOut(forgetAccountData);
