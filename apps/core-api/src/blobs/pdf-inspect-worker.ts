/** 041. The inspection itself, run in a worker thread with a memory and a
 *  time limit by `pdf-inspect.ts`.
 *
 *  Standalone on purpose, as 026's parse worker is: it imports nothing from
 *  the app and uses only syntax Node's type stripping can erase.
 *
 *  pdf.js reads the page tree and nothing else: no page is rendered and no
 *  font, script or link is loaded. Version 5 has no code-generating path at
 *  all (the font compiler that ran code before 4.2.67 is gone, and with it
 *  the `isEvalSupported` switch). Its own messages never leave this file: a
 *  parser's error can quote the document. */

import { isMainThread, parentPort, workerData } from "node:worker_threads";

export const MAX_PAGES = 1000;

export type Inspected = { pages: number } | { refused: "locked" | "too_many_pages" | "unreadable" };

export async function inspect(bytes: Uint8Array): Promise<Inspected> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: bytes,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: true,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    const pages = doc.numPages;
    if (!Number.isInteger(pages) || pages < 1) return { refused: "unreadable" };
    return pages > MAX_PAGES ? { refused: "too_many_pages" } : { pages };
  } catch (error) {
    return (error as { name?: string })?.name === "PasswordException" ? { refused: "locked" } : { refused: "unreadable" };
  } finally {
    await task.destroy().catch(() => undefined);
  }
}

if (!isMainThread && parentPort && workerData?.bytes) {
  inspect(workerData.bytes as Uint8Array).then(
    (result) => parentPort!.postMessage(result),
    () => parentPort!.postMessage({ refused: "unreadable" }),
  );
}
