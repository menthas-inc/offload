// 035. A copy of everything the account can read, from a phone.
//
// The row's state is the server's. The file is the one thing a phone does
// that the web does not: a browser saves a download itself, and here it is
// fetched with the session into the cache and then put where the person can
// find it after the app is closed. On iOS that is the system's share sheet,
// which has Save to Files. On Android it is the system's folder picker. The
// cache copy is removed afterwards: it is the whole account in one unsealed
// file.

import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
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

/** Download the copy and put it where the person can find it. True unless
 *  it could not be done; backing out of the system's own sheet is not that. */
export async function saveCopy(): Promise<boolean> {
  const android = Platform.OS === "android";
  if (!android && !(await Sharing.isAvailableAsync().catch(() => false))) return false;
  const file = cached();
  try {
    await File.downloadFileAsync(`${API_URL}/api/me/export/file`, file, {
      headers: await authHeaders(),
      idempotent: true,
    });
    if (!android) {
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/zip",
        UTI: "public.zip-archive",
        dialogTitle: "Save your copy",
      });
      return true;
    }
    // Android's share sheet offers people and apps to send to, and no plain
    // "keep it on this phone" unless a file manager adds one. The system's own
    // folder picker is the save: the file is written where the person chose.
    let folder: Directory;
    try {
      folder = await Directory.pickDirectoryAsync();
    } catch {
      return true;
    }
    // Streamed, so a large copy is never held in memory whole.
    await file.readableStream().pipeTo(folder.createFile("offload.zip", "application/zip").writableStream());
    return true;
  } catch {
    return false;
  } finally {
    clearSavedCopy();
  }
}
