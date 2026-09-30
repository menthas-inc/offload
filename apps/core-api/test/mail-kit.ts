// 026. Emails for the tests: built by hand, signed with a key made here, and
// verified against a resolver that answers for that key and nothing else.
//
// The real Gmail fixtures (T1.2) prove the library's output has the shape the
// code reads; these prove the rules, one altered respect at a time, without a
// network and without a signature that ages out of the seven-day window.

import { generateKeyPairSync } from "node:crypto";
import { dkimSign } from "mailauth/lib/dkim/sign.js";

export const DOMAIN = "mail.test";
export const SELECTOR = "t1";

const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = (k: typeof pair.privateKey) => k.export({ type: "pkcs8", format: "pem" }).toString();
const pub = (k: typeof pair.publicKey) => k.export({ type: "spki", format: "der" }).toString("base64");

/** Answers the key for `t1._domainkey.<domain>` for this domain and
 *  `other.test`; anything else does not exist. `down` answers as a resolver
 *  that timed out. */
export function resolver(opts: { down?: boolean } = {}) {
  return async (name: string, rrtype: string): Promise<string[][]> => {
    if (opts.down) throw Object.assign(new Error("timeout"), { code: "ETIMEOUT" });
    if (rrtype === "TXT" && name === `${SELECTOR}._domainkey.${DOMAIN}`) return [[`v=DKIM1; k=rsa; p=${pub(pair.publicKey)}`]];
    if (rrtype === "TXT" && name === `${SELECTOR}._domainkey.other.test`) return [[`v=DKIM1; k=rsa; p=${pub(other.publicKey)}`]];
    throw Object.assign(new Error("not found"), { code: "ENOTFOUND" });
  };
}

export type Mail = {
  from?: string;
  /** Extra header lines, written as given, before the body. */
  headers?: string[];
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
};

export function raw(m: Mail = {}): string {
  const lines = [
    `From: ${m.from ?? `Jo <jo@${DOMAIN}>`}`,
    `To: ${m.to ?? "over@to.offload.club"}`,
    ...(m.cc ? [`Cc: ${m.cc}`] : []),
    `Subject: ${m.subject ?? "Fwd: Your appointment is confirmed"}`,
    `Date: Tue, 29 Sep 2026 09:41:00 +0000`,
    `Message-ID: <${Math.random().toString(36).slice(2)}@${DOMAIN}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    ...(m.headers ?? []),
  ];
  return `${lines.join("\r\n")}\r\n\r\n${m.body ?? "Dentist, Tuesday 15:00.\r\n"}`;
}

export async function signed(
  message: string,
  opts: { domain?: string; headerList?: string[]; maxBodyLength?: number; signTime?: Date; key?: "own" | "other" } = {},
): Promise<Buffer> {
  const domain = opts.domain ?? DOMAIN;
  // The signer reads its keys from `signatureData` alone; the top-level
  // domain and key are ignored and it signs nothing, without an error.
  const result = await dkimSign(message, {
    ...(opts.headerList ? { headerList: opts.headerList } : {}),
    ...(opts.signTime ? { signTime: opts.signTime } : {}),
    signatureData: [
      {
        signingDomain: domain,
        selector: SELECTOR,
        privateKey: pem(opts.key === "other" || domain === "other.test" ? other.privateKey : pair.privateKey),
        ...(opts.maxBodyLength !== undefined ? { maxBodyLength: opts.maxBodyLength } : {}),
      },
    ],
  } as never);
  if (!result.signatures) throw new Error("the kit signed nothing");
  if (result.errors.length) throw new Error(JSON.stringify(result.errors));
  return Buffer.from(result.signatures + message);
}
