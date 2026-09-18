// Choosing a mailer.
//
// Resend in production, and locally only when MAIL_LIVE=1 is set for that
// shell; an in-memory recorder otherwise. The key on its own is not enough:
// development and tests must never be one .env away from mailing anybody, and
// a dev server's job runner drains the same jobs table the suite writes to.

import { env, isProduction } from "../env.js";
import { MemoryMailer, ResendMailer, type Mailer } from "./mailer.js";

export * from "./mailer.js";
export * from "./template.js";

export type MailChoice = Pick<typeof env, "RESEND_API_KEY" | "EMAIL_FROM" | "MAIL_LIVE"> & { production: boolean };

/** Which mailer the environment earns. Pure, so it can be tested with every
 *  combination rather than trusted. */
export function chooseMailer(choice: MailChoice): "resend" | "memory" {
  if (choice.production) {
    if (!choice.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is required in production: invites are undeliverable without it.");
    }
    return "resend";
  }
  return choice.MAIL_LIVE === "1" && choice.RESEND_API_KEY ? "resend" : "memory";
}

export function createMailer(
  choice: MailChoice = { RESEND_API_KEY: env.RESEND_API_KEY, EMAIL_FROM: env.EMAIL_FROM, MAIL_LIVE: env.MAIL_LIVE, production: isProduction }
): Mailer {
  return chooseMailer(choice) === "resend"
    ? new ResendMailer(choice.RESEND_API_KEY as string, choice.EMAIL_FROM)
    : new MemoryMailer();
}
