// 024 C2: the push transport, stubbed at the wire. (AC-10, AC-11)

import { describe, expect, it } from "vitest";
import {
  ExpoPush,
  GONE,
  MemoryPush,
  PushFailed,
  choosePush,
  isPushToken,
  type ExpoClient,
  type PushMessage,
} from "../src/notifications/push.js";

function message(to: string): PushMessage {
  return { to, title: "Due today", body: "Pay the rent.", data: { kind: "digest", send: "morning" } };
}

describe("which transport the environment earns", () => {
  it("is Expo in production, and only with the token; memory otherwise unless opted in", () => {
    expect(choosePush({ EXPO_ACCESS_TOKEN: "tok", production: true })).toBe("expo");
    expect(() => choosePush({ production: true })).toThrow(/EXPO_ACCESS_TOKEN/);
    expect(choosePush({ EXPO_ACCESS_TOKEN: "tok", production: false })).toBe("memory");
    expect(choosePush({ EXPO_ACCESS_TOKEN: "tok", PUSH_LIVE: "1", production: false })).toBe("expo");
    expect(choosePush({ PUSH_LIVE: "1", production: false })).toBe("memory");
  });
});

describe("the memory transport", () => {
  it("keeps what it was given and answers a ticket per message", async () => {
    const push = new MemoryPush();
    const tickets = await push.send([message("ExponentPushToken[a]"), message("ExponentPushToken[b]")]);
    expect(push.sent).toHaveLength(2);
    expect(tickets.map((t) => t.ok)).toEqual([true, true]);
    expect(await push.receipts(tickets.map((t) => (t.ok ? t.id : "")))).toMatchObject({});
  });
});

function fakeExpo(over: Partial<ExpoClient> = {}): ExpoClient & { sent: PushMessage[][] } {
  const client = {
    sent: [] as PushMessage[][],
    chunkPushNotifications(messages: PushMessage[]) {
      const chunks: PushMessage[][] = [];
      for (let i = 0; i < messages.length; i += 100) chunks.push(messages.slice(i, i + 100));
      return chunks;
    },
    async sendPushNotificationsAsync(chunk: PushMessage[]) {
      client.sent.push(chunk);
      return chunk.map((one, i) => ({ status: "ok" as const, id: `${one.to}:${i}` }));
    },
    async getPushNotificationReceiptsAsync(ids: string[]) {
      return Object.fromEntries(ids.map((id) => [id, { status: "ok" as const }]));
    },
    ...over,
  };
  return client;
}

describe("the Expo transport", () => {
  it("chunks, and answers every ticket in order", async () => {
    const client = fakeExpo();
    const push = new ExpoPush(client);
    const messages = Array.from({ length: 150 }, (_, i) => message(`ExponentPushToken[${i}]`));
    const tickets = await push.send(messages);
    expect(client.sent.map((chunk) => chunk.length)).toEqual([100, 50]);
    expect(tickets).toHaveLength(150);
    expect(tickets[149]).toMatchObject({ ok: true, token: "ExponentPushToken[149]" });
  });

  it("names a token the service says is gone, by code and nothing else", async () => {
    const client = fakeExpo({
      async sendPushNotificationsAsync(chunk: PushMessage[]) {
        return chunk.map((one) =>
          one.to === "ExponentPushToken[gone]"
            ? {
                status: "error" as const,
                message: `"${one.to}" is not a registered push notification recipient`,
                details: { error: GONE },
              }
            : { status: "ok" as const, id: "t1" },
        );
      },
    });
    const tickets = await new ExpoPush(client).send([message("ExponentPushToken[gone]"), message("ExponentPushToken[here]")]);
    expect(tickets[0]).toEqual({ token: "ExponentPushToken[gone]", ok: false, code: GONE });
    expect(tickets[1]).toEqual({ token: "ExponentPushToken[here]", ok: true, id: "t1" });
  });

  it("reads receipts by ticket id and reports a gone device from them too", async () => {
    const client = fakeExpo({
      async getPushNotificationReceiptsAsync() {
        return { r1: { status: "ok" as const }, r2: { status: "error" as const, message: "gone", details: { error: GONE } } };
      },
    });
    expect(await new ExpoPush(client).receipts(["r1", "r2"])).toEqual({ r1: { ok: true }, r2: { ok: false, code: GONE } });
  });

  it("surfaces a failure as a status and a code, never the body or a token", async () => {
    const client = fakeExpo({
      async sendPushNotificationsAsync() {
        throw Object.assign(new Error("Invalid credentials for ExponentPushToken[secret]; body: {...}"), {
          statusCode: 401,
          code: "InvalidCredentials",
        });
      },
    });
    const attempt = new ExpoPush(client).send([message("ExponentPushToken[secret]")]);
    await expect(attempt).rejects.toBeInstanceOf(PushFailed);
    await attempt.catch((error: PushFailed) => {
      expect(error.status).toBe(401);
      expect(error.code).toBe("InvalidCredentials");
      expect(error.message).not.toContain("secret");
      expect(error.message).not.toContain("body");
    });
  });
});

describe("what a token looks like", () => {
  it("is Expo's own shape", () => {
    expect(isPushToken("ExponentPushToken[abc]")).toBe(true);
    expect(isPushToken("ExpoPushToken[abc]")).toBe(true);
    expect(isPushToken("abc")).toBe(false);
  });
});
