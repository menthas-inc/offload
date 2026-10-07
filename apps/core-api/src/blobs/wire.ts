// The file a row or a message carries, as a client draws it: a photo with its
// dimensions, or a PDF (041) with its pages and whether its clean copy exists
// to be opened. `ready` is whether the renditions a tile draws exist yet.
// Never a coordinate, never the original, and the name only on a message the
// reader dumped.

import { z } from "zod";

const image = { blobId: z.string(), kind: z.literal("image"), width: z.number(), height: z.number(), ready: z.boolean() };
const pdf = {
  blobId: z.string(),
  kind: z.literal("pdf"),
  pages: z.number(),
  ready: z.boolean(),
  openable: z.boolean(),
  /** The worker could not make it safe: it will never open, which is not the
   *  same as not yet. */
  unreadable: z.boolean(),
};

export const fileOnRow = z.discriminatedUnion("kind", [z.object(image), z.object(pdf)]);
export type FileOnRow = z.infer<typeof fileOnRow>;

const name = { name: z.string().nullable() };
export const fileOnMessage = z.discriminatedUnion("kind", [z.object({ ...image, ...name }), z.object({ ...pdf, ...name })]);
export type FileOnMessage = z.infer<typeof fileOnMessage>;

export interface BlobForWire {
  id: string;
  kind: "image" | "audio" | "pdf";
  width: number | null;
  height: number | null;
  pages: number | null;
  renditions_at: Date | null;
  clean_at: Date | null;
  unreadable_at: Date | null;
}

/** A blob as a row carries it. A photo's dimensions and a PDF's pages are
 *  not null by the kind constraint. */
export function fileToWire(blob: BlobForWire): FileOnRow {
  const ready = blob.renditions_at !== null;
  return blob.kind === "pdf"
    ? {
        blobId: blob.id,
        kind: "pdf",
        pages: blob.pages!,
        ready,
        openable: blob.clean_at !== null,
        unreadable: blob.unreadable_at !== null,
      }
    : { blobId: blob.id, kind: "image", width: blob.width!, height: blob.height!, ready };
}
