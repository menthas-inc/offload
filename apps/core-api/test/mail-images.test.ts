// 026. Images, filtered hard by rules before any model looks (AC-9).

import { randomBytes } from "node:crypto";
import { PNG } from "pngjs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { candidatesOf, sealCandidates } from "../src/mail-in/images.js";
import type { ParsedImage } from "../src/mail-in/parse.js";
import { objectKey, objectStore, resetObjectStore } from "../src/blobs/store.js";
import { wipe } from "./labels-kit.js";
import { person } from "./mail-kit.js";

await migrate(() => {});
afterAll(closeDb);
beforeEach(async () => {
  resetObjectStore();
  await db.deleteFrom("blobs").execute();
  await wipe();
});

/** A PNG of noise, so its size on disk is roughly its pixels. */
function png(width: number, height: number): Uint8Array {
  const image = new PNG({ width, height });
  image.data = randomBytes(width * height * 4);
  return new Uint8Array(PNG.sync.write(image));
}
const image = (width: number, height: number, drawn: ParsedImage["drawn"] = null): ParsedImage => ({
  bytes: png(width, height),
  contentType: "image/png",
  drawn,
});

describe("the image rules (AC-9)", () => {
  it("leaves out a logo, an icon, a spacer, a banner and an image drawn small, and keeps a pass and a photo", () => {
    const logo = image(240, 90);
    const icon = image(48, 48);
    const spacer = image(1, 1);
    const banner = image(1400, 300);
    const drawnSmall = image(800, 800, { width: 120, height: 120 });
    const pass = image(700, 1100);
    const photo = image(1200, 900);
    const kept = candidatesOf([logo, icon, spacer, banner, drawnSmall, pass, photo]);
    expect(kept.map((c) => [c.width, c.height])).toEqual([
      [700, 1100],
      [1200, 900],
    ]);
  });

  it("leaves out anything under 20KB whatever its size", () => {
    const flat = new PNG({ width: 900, height: 900 });
    flat.data = Buffer.alloc(900 * 900 * 4, 255);
    const white = { bytes: new Uint8Array(PNG.sync.write(flat)), contentType: "image/png", drawn: null };
    expect(white.bytes.length).toBeLessThan(20 * 1024);
    expect(candidatesOf([white])).toEqual([]);
  });

  it("leaves out a type 020 does not take", () => {
    const gif = { bytes: new Uint8Array(Buffer.concat([Buffer.from("GIF89a"), randomBytes(40_000)])), contentType: "image/gif", drawn: null };
    expect(candidatesOf([gif])).toEqual([]);
  });

  it("sends at most twenty on to the look, in the email's order", () => {
    const many = Array.from({ length: 22 }, (_, i) => image(400 + i, 400));
    const kept = candidatesOf(many);
    expect(kept).toHaveLength(20);
    expect(kept[0]!.width).toBe(400);
    expect(kept[19]!.width).toBe(419);
  });
});

describe("sealing the candidates", () => {
  it("stores each as an unclaimed, encrypted image blob", async () => {
    const me = await person();
    const candidates = candidatesOf([image(700, 1100)]);
    const ids = await sealCandidates(me, "m1", candidates);
    const [row] = await db.selectFrom("blobs").selectAll().where("id", "in", ids).execute();
    expect(row).toMatchObject({ account_id: me, message_id: null, kind: "image", content_type: "image/png", width: 700, height: 1100 });
    const stored = await objectStore()!.get(objectKey(ids[0]!, "original"));
    expect(stored).not.toBeNull();
    expect(Buffer.compare(stored!, Buffer.from(candidates[0]!.bytes))).not.toBe(0);
  });

  it("counts toward 020's daily photo limit", async () => {
    const me = await person();
    const candidates = candidatesOf([image(700, 1100)]);
    await db
      .insertInto("blobs")
      .values(
        Array.from({ length: 200 }, (_, i) => ({
          account_id: me, message_id: null, client_key: `k${i}`, name: null, content_type: "image/jpeg",
          byte_size: 1, width: 1, height: 1, sha256: Buffer.alloc(32),
        })),
      )
      .execute();
    expect(await sealCandidates(me, "m2", candidates)).toEqual([]);
  });

  it("seals the same email's images once", async () => {
    const me = await person();
    const candidates = candidatesOf([image(700, 1100)]);
    const first = await sealCandidates(me, "m3", candidates);
    const second = await sealCandidates(me, "m3", candidates);
    expect(second).toEqual(first);
  });
});
