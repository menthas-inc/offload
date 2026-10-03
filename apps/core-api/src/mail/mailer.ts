// Sending mail, behind one interface.
//
// Resend is the choice; the interface is the point. Swapping to a specialist if
// deliverability ever needs one is a class, not a refactor.

import { renderHtml, renderText, type EmailSlots } from "./template.js";
import { JobError } from "../jobs/errors.js";

export interface Message {
  to: string;
  subject: string;
  slots: EmailSlots;
}

export interface Mailer {
  send(message: Message): Promise<void>;
}

export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string
  ) {}

  async send(message: Message): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        html: renderHtml(message.slots),
        text: renderText(message.slots),
      }),
    });

    if (!response.ok) {
      // Status only. The body quotes the recipient address, and that must not
      // reach jobs.last_error or a log line (OFF-1).
      // 034. With its code, so a dead email job says the mail company refused
      // it rather than that a handler threw.
      throw new JobError("mail_failed", `Resend rejected the send with status ${response.status}`);
    }
  }
}

/** Development and tests. Records what would have been sent so a test can
 *  assert on it without a network call or a real inbox. */
export class MemoryMailer implements Mailer {
  readonly sent: Message[] = [];
  async send(message: Message): Promise<void> {
    this.sent.push(message);
  }
}
