// What this phone keeps of the account signed in on it, and letting go of it.
//
// The server holds the account. The phone holds copies, for speed or because
// a platform needs a file: photo renditions and people's marks fetched once,
// voice notes waiting to be sent or being heard, a PDF in the viewer, a picked
// file on its way up, an export on its way to Files, a few choices kept per
// thread, and whatever a notification left on the lock screen. On 2026-10-11 a
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
// sign out.

import * as SecureStore from "expo-secure-store";
import { Directory, File, Paths } from "expo-file-system";
import * as Notifications from "expo-notifications";
import { accountChanged, onSignedOut } from "./auth";
import { forgetAccountKeys } from "./account-keys";

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
 *  Not the cache's top level, where a photo shared from another app waits
 *  behind the gate and is cleared once it is in the draft. */
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

/** Every copy of the account on this phone, the stamp with it. */
export async function forgetAccountData(): Promise<void> {
  for (const name of FOLDERS) remove(new Directory(Paths.cache, name));
  for (const name of FILES) remove(new File(Paths.cache, name));
  await Promise.all([...ACCOUNT_KEYS, STAMP].map((key) => SecureStore.deleteItemAsync(key).catch(() => undefined)));
  await forgetAccountKeys();
  // A delivered notification carries a few words of what was dumped.
  await Notifications.dismissAllNotificationsAsync().catch(() => undefined);
}

/** Launch, once the server has said who is signed in, before the shell.
 *
 *  The same account: nothing to forget. Another account's stamp: everything
 *  holding its copy hears it as a sign-out, the screens in memory with it. No
 *  stamp: the files and keys go and nothing in memory is touched, since
 *  nothing in memory can be older than this launch or the last sign-out, and
 *  a photo shared behind the gate is waiting in the draft. Never throws: a
 *  store that cannot be read is a reason to forget, not to hold launch. Every
 *  way, whoever listens then hears who the phone holds now. */
export async function claimDevice(accountId: string): Promise<void> {
  let stamp: string | null = null;
  try {
    stamp = SecureStore.getItem(STAMP);
  } catch {
    stamp = null;
  }
  if (stamp !== accountId) {
    if (stamp) await accountChanged().catch(() => undefined);
    else await forgetAccountData().catch(() => undefined);
    try {
      SecureStore.setItem(STAMP, accountId, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
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
