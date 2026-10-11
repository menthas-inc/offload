// 041. Opening a PDF on a phone: its clean copy comes down into a private
// folder in the app's cache, which neither platform backs up, is handed to
// the platform's own viewer for reading only, and is deleted when the viewer
// closes (iOS), when offload comes forward again (Android, which has no
// "closed"), on sign-out and on the next launch.
//
// The outcomes are the failure table's: a PDF with no clean copy yet is "not
// yet", one that could not be made safe is "never", a copy that did not come
// down is "failed", and a phone with no app that opens a PDF is "no_viewer".
// The caller turns each into its line and its way forward.

import { useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import PdfOpen from "../modules/pdf-open";
import { API_URL, authHeaders } from "./api";
import { copyGeneration, onSignedOut } from "./session-end";

export type Opened = "opened" | "not_yet" | "never" | "failed" | "no_viewer";

export function pdfDirectory(): Directory {
  return new Directory(Paths.cache, "pdfs");
}

/** A name the viewer can show in its title bar: the row's title made safe for
 *  a file system, as the server makes it for a header. */
function fileName(title: string | null | undefined): string {
  const base = (title ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff"\\/:;*?<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/\.pdf$/i, "")
    .slice(0, 80)
    .trim();
  return `${base || "PDF"}.pdf`;
}

/** Which PDF is coming down right now, for its tile's spinner. */
let opening: string | null = null;
const listeners = new Set<(blobId: string | null) => void>();

function setOpening(blobId: string | null): void {
  opening = blobId;
  for (const listener of listeners) listener(blobId);
}

export function onOpening(listener: (blobId: string | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function openingNow(): string | null {
  return opening;
}

/** Whether this PDF is the one coming down, for its tile's one spinner. */
export function usePdfOpening(blobId: string): boolean {
  return useSyncExternalStore(onOpening, openingNow) === blobId;
}

// No spinner names a PDF of an account that has gone.
onSignedOut(() => setOpening(null));

function remove(dir: Directory): void {
  try {
    if (dir.exists) dir.delete();
  } catch {
    // A cache folder that cannot be cleared now is cleared on the next launch.
  }
}

/** Android: the viewer is another app, so the copy goes when offload is
 *  forward again, after the grant is taken back. */
function whenBack(file: File, dir: Directory): void {
  const sub = AppState.addEventListener("change", (state) => {
    if (state !== "active") return;
    sub.remove();
    try {
      PdfOpen?.revoke?.(file.uri);
    } catch {
      // Revoked or never granted; the delete below is what matters.
    }
    remove(dir);
  });
}

/** Bring the clean copy down and open it. Never throws. */
export async function openPdf(
  pdf: { blobId: string; openable?: boolean | undefined; unreadable?: boolean | undefined },
  title: string | null | undefined,
): Promise<Opened> {
  if (!pdf.openable) return pdf.unreadable ? "never" : "not_yet";
  if (!PdfOpen) return "failed";
  const dir = new Directory(pdfDirectory(), pdf.blobId);
  const file = new File(dir, fileName(title));
  const generation = copyGeneration();
  setOpening(pdf.blobId);
  try {
    remove(dir);
    dir.create({ intermediates: true });
    await File.downloadFileAsync(`${API_URL}/v1/blobs/${pdf.blobId}/pdf`, file, {
      headers: await authHeaders(),
      idempotent: true,
    });
    // The session ended while it came down: the copy is no longer the phone's.
    if (copyGeneration() !== generation) throw new Error("forgotten");
  } catch {
    remove(dir);
    setOpening(null);
    return "failed";
  }
  try {
    // The spinner holds until the viewer is up. On Android the chooser can
    // take a beat; on iOS `open` resolves when Quick Look closes, and the
    // spinner sits under it until then.
    const outcome = await PdfOpen.open(file.uri);
    if (outcome === "opened" && Platform.OS === "android") {
      whenBack(file, dir);
      return "opened";
    }
    remove(dir);
    return outcome;
  } catch {
    remove(dir);
    return "failed";
  } finally {
    setOpening(null);
  }
}

/** The way forward on a phone with no PDF app: the platform's share sheet,
 *  from a copy deleted once the app it went to has had it. */
export async function sharePdf(blobId: string, title: string | null | undefined): Promise<void> {
  const Sharing = await import("expo-sharing");
  const dir = new Directory(pdfDirectory(), `${blobId}-share`);
  const file = new File(dir, fileName(title));
  const generation = copyGeneration();
  try {
    remove(dir);
    dir.create({ intermediates: true });
    await File.downloadFileAsync(`${API_URL}/v1/blobs/${blobId}/pdf`, file, { headers: await authHeaders(), idempotent: true });
    if (copyGeneration() !== generation) throw new Error("forgotten");
    await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
  } catch {
    // Backing out of the sheet, or a copy that did not come down: nothing to say.
    remove(dir);
    return;
  }
  // Android's sheet resolves on dismissal, which can come before the app it
  // went to has read the file; the copy goes when offload is forward again.
  if (Platform.OS === "android") whenBack(file, dir);
  else remove(dir);
}

/** Whatever a kill or a viewer left behind. Called on launch and on sign-out. */
export function sweepPdfs(): void {
  remove(pdfDirectory());
}
