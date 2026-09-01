// The one transactional email shell.
//
// From the design system's marketing kit: a 600px table with inline styles, no
// images, no CSS block. Four slots fill it and it becomes any other message.
// Every send ships a plain-text alternative.
//
// Values are taken from the generated tokens rather than retyped, because a
// literal hex in application code is a bug (OFF-7). An email client cannot
// follow a var(), so the resolved set is what this uses.

import { token } from "@offload/tokens";

export interface EmailSlots {
  /** Sentence case, no full stop, one line. */
  headline: string;
  /** One or two sentences in offload's voice. */
  body: string;
  /** Omit both to send a message with no action. */
  buttonLabel?: string;
  buttonUrl?: string;
  footer: string;
}

const escape = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderHtml(slots: EmailSlots): string {
  const ink = token("text-primary");
  const secondary = token("text-secondary");
  const page = token("surface-page");
  const card = token("surface-raised");
  const hairline = token("border-hairline");
  const sans = token("font-core");
  const radius = token("radius-field");

  const button =
    slots.buttonLabel && slots.buttonUrl
      ? `<tr><td style="padding:0 32px 32px 32px;">
           <a href="${escape(slots.buttonUrl)}"
              style="display:inline-block;background:${ink};color:${page};text-decoration:none;
                     font:500 16px/1 ${sans};padding:14px 22px;border-radius:${radius};">
             ${escape(slots.buttonLabel)}
           </a>
         </td></tr>`
      : "";

  // Table layout and inline styles because email clients are not browsers.
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${page};">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0"
           style="width:600px;max-width:100%;background:${card};border:1px solid ${hairline};border-radius:14px;">
      <tr><td style="padding:32px 32px 8px 32px;font:600 21px/1.3 ${sans};color:${ink};letter-spacing:-0.02em;">
        offload
      </td></tr>
      <tr><td style="padding:16px 32px 0 32px;font:600 26px/1.25 ${sans};color:${ink};letter-spacing:-0.02em;">
        ${escape(slots.headline)}
      </td></tr>
      <tr><td style="padding:12px 32px 24px 32px;font:400 16px/1.45 ${sans};color:${secondary};">
        ${escape(slots.body)}
      </td></tr>
      ${button}
      <tr><td style="padding:0 32px 32px 32px;font:400 13px/1.4 ${sans};color:${secondary};border-top:1px solid ${hairline};padding-top:20px;">
        ${escape(slots.footer)}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/** The plain-text alternative that ships with every send. Not a courtesy: a
 *  message with no text part reads as spam to several providers. */
export function renderText(slots: EmailSlots): string {
  const action = slots.buttonLabel && slots.buttonUrl ? `\n\n${slots.buttonLabel}: ${slots.buttonUrl}` : "";
  return `offload\n\n${slots.headline}\n\n${slots.body}${action}\n\n${slots.footer}\n`;
}
