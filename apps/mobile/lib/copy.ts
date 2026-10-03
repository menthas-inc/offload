// 035. A copy of everything the account can read, from a phone.
//
// The row's state is the server's. The file is the one thing a phone does
// that the web does not: a browser saves a download itself, and here it is
// fetched with the session into the cache and handed to the system's own
// share or save sheet, which is what puts it where the person can find it
// after the app is closed. The cache copy is removed afterwards: it is the
// whole account in one unsealed file. On iOS that is when the sheet closes.
// Android answers as soon as the other app has been started, while it may
// still be reading, so there the file is left and cleared on the next visit.

import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { CopyState } from "@offload/widgets";
import { authHeaders, request, send } from "./api";
import { API_URL } from "./auth";

export type { CopyState };

export async function loadCopy(): Promise<CopyState | null> {
  return request<CopyState>("/api/me/export");
}

/** The row after asking, or null when the press did not go through. Too soon
 *  is the server's to say, so the row is read again and says when. */
export async function askForCopy(): Promise<CopyState | null> {
  try {
    const sent = await send<CopyState>("/api/me/export", { method: "POST" });
    if (sent.status === 409) return loadCopy();
    return sent.status === 202 ? sent.data : null;
  } catch {
    return null;
  }
}

export async function deleteCopy(): Promise<CopyState | null> {
  try {
    const sent = await send<null>("/api/me/export", { method: "DELETE" });
    if (sent.status !== 204) return null;
    // The delete went through. A read that then fails is not a failed delete:
    // the row says there is none, and the next press or read corrects it.
    return (await loadCopy()) ?? { state: "idle", readyAt: null, expiresAt: null, nextAt: null };
  } catch {
    return null;
  }
}

const cached = (): File => new File(Paths.cache, "offload.zip");

/** Take a copy left in the cache out of it. */
export function clearSavedCopy(): void {
  try {
    const file = cached();
    if (file.exists) file.delete();
  } catch {
    // The cache is the system's to clear; the next download overwrites it.
  }
}

/** Download the copy and hand it to the system's sheet. True once the sheet
 *  has been shown; what the person did in it is theirs. */
export async function saveCopy(): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync().catch(() => false))) return false;
  const file = cached();
  let handed = false;
  try {
    await File.downloadFileAsync(`${API_URL}/api/me/export/file`, file, {
      headers: await authHeaders(),
      idempotent: true,
    });
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/zip",
      UTI: "public.zip-archive",
      dialogTitle: "Save your copy",
    });
    handed = true;
    return true;
  } catch {
    return false;
  } finally {
    if (!handed || Platform.OS !== "android") clearSavedCopy();
  }
}
