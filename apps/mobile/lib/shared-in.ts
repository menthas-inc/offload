// A file shared in from another app, taken out of the library's hands.
//
// expo-share-intent copies what was shared to the top of the app's cache on
// Android and to the top of the app group's container on iOS, and its clear
// forgets only the record of the share, never the files (8.0.1, read in its
// native code on 2026-10-11). Left there, they outlive the session and every
// wipe. So each one moves into a folder of ours before the draft takes it,
// one folder per file so two shares of `IMG_0042.jpg` never meet, and
// `device-data.ts` forgets that folder with the rest of the account.

import { Directory, File, Paths } from "expo-file-system";

/** Where shared files wait while the draft holds them. */
export const SHARED = "shared";

/** Move a shared file into our folder and say where it is now. The library's
 *  own file when it cannot be moved: a share is never dropped for this, and
 *  the session's end clears the library's folders too.
 *
 *  The library hands over a bare path on Android, and the runtime's FormData
 *  wants a uri with a scheme: a path with none fails the upload as a network
 *  error, which is what the first share on a Pixel did. */
export function takeShared(path: string): string {
  const uri = /^[a-z]+:/.test(path) ? path : `file://${path}`;
  try {
    const from = new File(uri);
    const dir = new Directory(Paths.cache, SHARED, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    dir.create({ intermediates: true, idempotent: true });
    const to = new File(dir, from.name);
    from.move(to);
    return to.uri;
  } catch {
    return uri;
  }
}
