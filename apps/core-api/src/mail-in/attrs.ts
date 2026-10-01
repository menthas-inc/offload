/** 026. What a mail message carries in `attrs.mail`, and the only shape the
 *  turn reads it in. Clamped on the way in: every string here was written by
 *  somebody other than offload. */

import { z } from "zod";

export const mailAttrs = z.object({
  subject: z.string().max(300),
  fromName: z.string().max(120).nullable(),
  fromAddress: z.string().max(320),
  sentAt: z.string().nullable(),
  /** The first `noteLength` characters of the message's text are the
   *  person's own words; the rest somebody else wrote. */
  noteLength: z.number().int().min(0),
  /** Where reply history below the forwarded message starts, for the turn's
   *  copy to stop at. The stored text keeps it. */
  historyAt: z.number().int().min(0).nullable(),
  leftOut: z.partialRecord(z.enum(["pdf", "spreadsheet", "document", "calendar", "archive", "other"]), z.number().int().min(1)),
  cc: z.boolean(),
});

export type MailAttrs = z.infer<typeof mailAttrs>;

/** The words the person wrote in a message: all of them, or for a forwarded
 *  email the note above the forwarded part alone. What a label may be made
 *  from, and what a `#word` may pick: somebody else's email is not the person
 *  naming anything. */
export function ownWords(message: { text: string | null; source?: string | null; attrs?: unknown }): string {
  const text = message.text ?? "";
  if (message.source !== "mail") return text;
  const noteLength = (message.attrs as { mail?: { noteLength?: number } } | null)?.mail?.noteLength ?? 0;
  return text.slice(0, noteLength);
}
