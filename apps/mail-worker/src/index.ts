/** 026. The mail Worker.
 *
 *  Email Routing on to.offload.club hands every message for over@ here, and
 *  this hands the bytes to core-api, signed with a secret of its own over a
 *  timestamp and the body's hash. It keeps nothing, decides nothing and logs
 *  an outcome and nothing else: no address, no subject, no size.
 *
 *  An Email Worker cannot ask the sending server to try again later: a thrown
 *  error is answered as a permanent failure. So it retries the POST itself,
 *  three attempts over about thirty seconds, and only then throws, which
 *  returns the email to its sender. That happens only while core-api is
 *  unreachable, and every refusal of the sender check is still a 200 there,
 *  so a bounce says nothing about whether an address has an account. */

export interface Env {
  INBOUND_URL: string;
  MAIL_INBOUND_SECRET: string;
}

interface EmailMessage {
  raw: ReadableStream<Uint8Array>;
}

const WAITS_MS = [10_000, 20_000];

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function sign(secret: string, timestamp: string, body: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = hex(await crypto.subtle.digest("SHA-256", body));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${digest}`)));
}

export async function forward(
  body: Uint8Array<ArrayBuffer>,
  env: Env,
  opts: { sleep?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let last = "unreachable";
  for (let attempt = 0; attempt <= WAITS_MS.length; attempt++) {
    if (attempt > 0) await sleep(WAITS_MS[attempt - 1]!);
    const timestamp = String(Date.now());
    try {
      const response = await fetch(env.INBOUND_URL, {
        method: "POST",
        body: body.slice().buffer,
        headers: {
          "content-type": "message/rfc822",
          "x-mail-timestamp": timestamp,
          "x-mail-signature": await sign(env.MAIL_INBOUND_SECRET, timestamp, body),
        },
      });
      if (response.ok) return;
      last = String(response.status);
    } catch {
      last = "unreachable";
    }
  }
  throw new Error(`inbound ${last}`);
}

export default {
  async email(message: EmailMessage, env: Env): Promise<void> {
    const body = new Uint8Array(await new Response(message.raw).arrayBuffer());
    try {
      await forward(body, env);
      console.log(JSON.stringify({ outcome: "delivered" }));
    } catch (error) {
      console.log(JSON.stringify({ outcome: "refused_upstream" }));
      throw error;
    }
  },
};
