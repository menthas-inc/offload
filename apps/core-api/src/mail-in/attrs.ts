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
