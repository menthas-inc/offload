// The push transport. 024.
//
// Expo's push service in production, behind the project's access token,
// because enhanced push security is on and a third party holding a token
// cannot send in offload's voice. Locally the memory transport stands in,
// for the same reason the mailer's does: a local process reaching a paid
// third party is an opt-in per shell, PUSH_LIVE=1, and nothing else turns it
// on. A failure surfaces a status and an error code, never the provider's
// body, so no token and no words reach `jobs.last_error` or a log line.

import { Expo } from "expo-server-sdk";
import { emit } from "../analytics.js";
import { db } from "../db.js";
import { env, isProduction } from "../env.js";

/** One message to one token. `data` is the closed payload the app maps to a
 *  screen; it is never a path, a route or a URL. */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  /** The verbs category, on a one-task digest. */
  categoryId?: string;
  /** Android's channel, one of the four fixed ids. */
  channelId?: string;
}

export type PushTicket = { token: string; ok: true; id: string } | { token: string; ok: false; code: string };

export type Receipt = { ok: true } | { ok: false; code: string };

/** What the service says about a token it will never reach again. */
export const GONE = "DeviceNotRegistered";

export class PushFailed extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`push failed: ${status} ${code}`);
  }
}

export interface PushTransport {
  send(messages: PushMessage[]): Promise<PushTicket[]>;
  receipts(ids: string[]): Promise<Record<string, Receipt>>;
}

/** The slice of the SDK this module uses, so a test can stand in at the wire. */
export interface ExpoClient {
  chunkPushNotifications(messages: PushMessage[]): PushMessage[][];
  sendPushNotificationsAsync(chunk: PushMessage[]): Promise<ExpoTicket[]>;
  getPushNotificationReceiptsAsync(ids: string[]): Promise<Record<string, ExpoReceipt>>;
}

type ExpoTicket = { status: "ok"; id: string } | { status: "error"; message?: string; details?: { error?: string } };
type ExpoReceipt = { status: "ok" } | { status: "error"; message?: string; details?: { error?: string } };

/** Kept in memory: what a test reads, and what a local process sends to. */
export class MemoryPush implements PushTransport {
  readonly sent: PushMessage[] = [];

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    this.sent.push(...messages);
    return messages.map((message, i) => ({ token: message.to, ok: true, id: `memory:${this.sent.length - messages.length + i}` }));
  }

  async receipts(_ids: string[]): Promise<Record<string, Receipt>> {
    return {};
  }
}

export class ExpoPush implements PushTransport {
  constructor(private readonly client: ExpoClient) {}

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    const tickets: PushTicket[] = [];
    for (const chunk of this.client.chunkPushNotifications(messages)) {
      let answered: ExpoTicket[];
      try {
        answered = await this.client.sendPushNotificationsAsync(chunk);
      } catch (error) {
        throw failed(error);
      }
      answered.forEach((ticket, i) => {
        const token = chunk[i]!.to;
        tickets.push(ticket.status === "ok" ? { token, ok: true, id: ticket.id } : { token, ok: false, code: ticket.details?.error ?? "unknown" });
      });
    }
    return tickets;
  }

  async receipts(ids: string[]): Promise<Record<string, Receipt>> {
    let answered: Record<string, ExpoReceipt>;
    try {
      answered = await this.client.getPushNotificationReceiptsAsync(ids);
    } catch (error) {
      throw failed(error);
    }
    return Object.fromEntries(
      Object.entries(answered).map(([id, receipt]) => [
        id,
        receipt.status === "ok" ? { ok: true } : { ok: false, code: receipt.details?.error ?? "unknown" },
      ]),
    );
  }
}

/** The status and the code, and nothing from the body. */
function failed(error: unknown): PushFailed {
  const held = error as { statusCode?: unknown; code?: unknown };
  const status = typeof held.statusCode === "number" ? held.statusCode : 0;
  const code = typeof held.code === "string" && /^[A-Za-z_]{1,64}$/.test(held.code) ? held.code : "unknown";
  return new PushFailed(status, code);
}

export type PushChoice = Pick<typeof env, "EXPO_ACCESS_TOKEN" | "PUSH_LIVE"> & { production: boolean };

/** Which transport the environment earns. Pure, so every combination is tested. */
export function choosePush(choice: PushChoice): "expo" | "memory" {
  if (choice.production) {
    if (!choice.EXPO_ACCESS_TOKEN) {
      throw new Error("EXPO_ACCESS_TOKEN is required in production: nothing can be sent without it.");
    }
    return "expo";
  }
  return choice.PUSH_LIVE === "1" && choice.EXPO_ACCESS_TOKEN ? "expo" : "memory";
}

let shared: PushTransport | null = null;

export function createPush(
  choice: PushChoice = { EXPO_ACCESS_TOKEN: env.EXPO_ACCESS_TOKEN, PUSH_LIVE: env.PUSH_LIVE, production: isProduction },
): PushTransport {
  return choosePush(choice) === "expo"
    ? new ExpoPush(new Expo({ accessToken: choice.EXPO_ACCESS_TOKEN as string }) as unknown as ExpoClient)
    : new MemoryPush();
}

/** The one transport the jobs share, so a test can read the memory one. */
export function push(): PushTransport {
  shared ??= createPush();
  return shared;
}

/** The receipts are read this long after a send. */
export const RECEIPTS_AFTER_SECONDS = 15 * 60;

/** Send to an account's phones, one message per token row. A device the
 *  service says is gone loses its token, and any other refusal is emitted
 *  with its code. The job fails only when a refusal left no phone reached:
 *  a retry sends again to every phone, so failing after one took it would
 *  send that phone the same thing again. Returns what was accepted, by the
 *  token's row id, for the receipts. */
export async function deliver(
  tokens: readonly { id: string; token: string }[],
  messages: PushMessage[],
  subjectId: string | null,
  kind: string,
): Promise<{ id: string; tokenId: string }[]> {
  let tickets: PushTicket[];
  try {
    tickets = await push().send(messages);
  } catch (error) {
    if (error instanceof PushFailed) {
      await emit({ name: "notification_failed", subjectId, properties: { kind, status: error.status, code: error.code } });
    }
    throw error;
  }
  const gone = tickets.filter((ticket) => !ticket.ok && ticket.code === GONE).map((ticket) => ticket.token);
  if (gone.length > 0) await db.deleteFrom("push_tokens").where("token", "in", gone).execute();
  const idOf = new Map(tokens.map((one) => [one.token, one.id]));
  const delivered = tickets.flatMap((ticket) => (ticket.ok && idOf.has(ticket.token) ? [{ id: ticket.id, tokenId: idOf.get(ticket.token)! }] : []));
  const refused = tickets.find((ticket) => !ticket.ok && ticket.code !== GONE);
  if (refused && !refused.ok) {
    await emit({ name: "notification_failed", subjectId, properties: { kind, status: 200, code: refused.code } });
    if (delivered.length === 0) throw new PushFailed(200, refused.code);
  }
  return delivered;
}

export function isPushToken(token: string): boolean {
  return Expo.isExpoPushToken(token);
}
