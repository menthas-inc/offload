// The marks on this device. 022.
//
// Fetched once per account into the app's cache directory, the way a photo
// is, since `Image` with `source.headers` sends nothing on Android, and
// never expired, since the picture never changes. A mark the lookup handed
// over inline is written here as if it had been fetched: the bytes are the
// same ones.

import { Directory, File, Paths } from "expo-file-system";
import { API_URL } from "./auth";
import { authHeaders } from "./api";
import { copyGeneration } from "./session-end";

/** Where a mark is served from. */
export function avatarUrl(accountId: string): string {
  return `${API_URL}/v1/avatars/${accountId}.png`;
}

function cached(accountId: string): File {
  return new File(Paths.cache, "avatars", `${accountId}.png`);
}

/** The cached file's uri, or null. */
export function cachedMark(accountId: string): string | null {
  const file = cached(accountId);
  return file.exists ? file.uri : null;
}

export function rememberMark(accountId: string, base64Png: string): void {
  const file = cached(accountId);
  if (file.exists) return;
  try {
    new Directory(Paths.cache, "avatars").create({ idempotent: true, intermediates: true });
    file.write(Uint8Array.from(atob(base64Png), (c) => c.charCodeAt(0)));
  } catch {
    // The row draws initials, and the next fetch may still succeed.
  }
}

const inFlight = new Map<string, Promise<string | null>>();

/** Fetch the mark into the cache once. Only a 200 is written, and only while
 *  the copy it was fetched for is still the phone's. */
export function fetchMark(accountId: string): Promise<string | null> {
  const file = cached(accountId);
  if (file.exists) return Promise.resolve(file.uri);
  const running = inFlight.get(accountId);
  if (running) return running;
  const started = (async () => {
    try {
      const generation = copyGeneration();
      const headers = await authHeaders();
      const response = await fetch(avatarUrl(accountId), { headers });
      if (!response.ok) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (copyGeneration() !== generation) return null;
      new Directory(Paths.cache, "avatars").create({ idempotent: true, intermediates: true });
      file.write(bytes);
      return file.uri;
    } catch {
      return null;
    } finally {
      inFlight.delete(accountId);
    }
  })();
  inFlight.set(accountId, started);
  return started;
}
