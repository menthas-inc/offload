// Choosing a mailer.
//
// Resend when a key is configured, an in-memory recorder otherwise. That
// default is deliberate: development and tests should never be one typo away
// from mailing a real person.

import { env, isProduction } from "../env.js";
import { MemoryMailer, ResendMailer, type Mailer } from "./mailer.js";

export * from "./mailer.js";
export * from "./template.js";

export function createMailer(): Mailer {
  if (env.RESEND_API_KEY) {
    return new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM);
  }
  if (isProduction) {
    throw new Error("RESEND_API_KEY is required in production: invites are undeliverable without it.");
  }
  return new MemoryMailer();
}
