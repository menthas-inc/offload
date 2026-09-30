// 026. What an email becomes before it is a dump (AC-5, AC-6, AC-7, AC-10).

import http from "node:http";
import https from "node:https";
import net from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseMail } from "../src/mail-in/parse.js";
import { extract } from "../src/mail-in/parse-worker.js";

const CRLF = "\r\n";
const mime = (headers: string[], body: string) => [...headers, "", body].join(CRLF);

function multipart(parts: string[], type = "mixed", boundary = "b1"): string {
  return mime(
    [
      "From: Jo <jo@mail.test>",
      "To: over@to.offload.club",
      "Subject: Fwd: Your booking",
      "Date: Tue, 29 Sep 2026 09:41:00 +0000",
      "MIME-Version: 1.0",
      `Content-Type: multipart/${type}; boundary="${boundary}"`,
    ],
    parts.map((p) => `--${boundary}${CRLF}${p}`).join(CRLF) + `${CRLF}--${boundary}--${CRLF}`,
  );
}
const part = (type: string, body: string, extra: string[] = []) => mime([`Content-Type: ${type}`, ...extra], body);
const b64 = (bytes: Buffer) => bytes.toString("base64").replace(/.{76}/g, `$&${CRLF}`);

const GMAIL = [
  "Put this with the trip",
  "",
  "---------- Forwarded message ---------",
  "From: Iberia <no-reply@iberia.test>",
  "Date: Mon, Sep 28, 2026 at 6:02 PM",
  "Subject: Booking LX3K9",
  "To: <jo@mail.test>",
  "",
  "Your flight out is on 3 October and back on 10 October.",
  "",
  "On Mon, Sep 28, 2026 at 5:00 PM Jo <jo@mail.test> wrote:",
  "> earlier message",
].join("\n");

describe("the text (AC-5, AC-6)", () => {
  it("keeps a plain part whole and finds Gmail's forwarded block", async () => {
    const out = await extract(Buffer.from(multipart([part("text/plain; charset=utf-8", GMAIL)])));
    if ("refused" in out) throw new Error(out.refused);
    expect(out.text).toContain("> earlier message");
    expect(out.text.slice(0, out.noteLength).trim()).toBe("Put this with the trip");
    expect(out).toMatchObject({ subject: "Booking LX3K9", fromName: "Iberia", fromAddress: "no-reply@iberia.test" });
    expect(out.sentAt?.slice(0, 10)).toBe("2026-09-28");
    expect(out.text.slice(out.historyAt!)).toMatch(/^On Mon, Sep 28/);
  });

  it("finds Apple Mail's and Outlook's", async () => {
    const apple = "fyi\n\nBegin forwarded message:\n\nFrom: School <office@school.test>\nSubject: Parents' evening\nDate: September 28, 2026 at 6:02:00 PM GMT+1\nTo: Jo <jo@mail.test>\n\nThursday at 6.";
    const outlook = "fyi\n\n________________________________\nFrom: School <office@school.test>\nSent: Monday, September 28, 2026 6:02 PM\nTo: Jo\nSubject: Parents' evening\n\nThursday at 6.";
    for (const body of [apple, outlook]) {
      const out = await extract(Buffer.from(multipart([part("text/plain", body)])));
      if ("refused" in out) throw new Error(out.refused);
      expect(out).toMatchObject({ subject: "Parents' evening", fromAddress: "office@school.test" });
      expect(out.text.slice(0, out.noteLength).trim()).toBe("fyi");
    }
  });

  it("treats a direct email as the person's own words", async () => {
    const out = await extract(Buffer.from(multipart([part("text/plain", "Dinner at Nopi on Friday at 8")])));
    if ("refused" in out) throw new Error(out.refused);
    expect(out.noteLength).toBe(out.text.length);
    expect(out).toMatchObject({ subject: "Fwd: Your booking", fromAddress: "jo@mail.test", historyAt: null });
  });

  it("turns an HTML-only email into text", async () => {
    const out = await extract(Buffer.from(multipart([part("text/html", "<p>Check-in <b>opens</b> at 14:00</p>")])));
    if ("refused" in out) throw new Error(out.refused);
    expect(out.text).toMatch(/Check-in opens at 14:00/i);
  });

  it("fetches nothing an email links to or embeds", async () => {
    const calls: string[] = [];
    const deny = (name: string) => () => {
      calls.push(name);
      throw new Error(`network: ${name}`);
    };
    vi.spyOn(http, "request").mockImplementation(deny("http") as never);
    vi.spyOn(https, "request").mockImplementation(deny("https") as never);
    vi.spyOn(net, "connect").mockImplementation(deny("net") as never);
    vi.spyOn(globalThis, "fetch").mockImplementation(deny("fetch") as never);
    const html = '<p>Hi</p><img src="https://tracker.test/pixel.gif"><a href="https://airline.test/cancel">Cancel</a>';
    const out = await extract(Buffer.from(multipart([part("text/html", html)])));
    expect("refused" in out).toBe(false);
    expect(calls).toEqual([]);
  });
});

afterEach(() => vi.restoreAllMocks());

describe("attachments (AC-10)", () => {
  it("counts what is not an image by kind", async () => {
    const out = await extract(
      Buffer.from(
        multipart([
          part("text/plain", "see attached"),
          part("application/pdf", b64(Buffer.from("%PDF-1.4")), ["Content-Transfer-Encoding: base64", 'Content-Disposition: attachment; filename="itinerary.pdf"']),
          part("text/csv", "a,b", ['Content-Disposition: attachment; filename="a.csv"']),
          part("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", b64(Buffer.from("x")), ["Content-Transfer-Encoding: base64", 'Content-Disposition: attachment; filename="b.xlsx"']),
          part("text/calendar", "BEGIN:VCALENDAR", ['Content-Disposition: attachment; filename="invite.ics"']),
          part("application/zip", b64(Buffer.from("PK")), ["Content-Transfer-Encoding: base64", 'Content-Disposition: attachment; filename="c.zip"']),
        ]),
      ),
    );
    if ("refused" in out) throw new Error(out.refused);
    expect(out.leftOut).toEqual({ pdf: 1, spreadsheet: 2, calendar: 1, archive: 1 });
  });
});

describe("bounds (AC-7)", () => {
  it("refuses more than a hundred parts", async () => {
    const parts = Array.from({ length: 101 }, (_, i) => part("text/plain", `p${i}`));
    expect(await parseMail(Buffer.from(multipart(parts)))).toEqual({ refused: "unparseable" });
  });

  it("refuses nesting deeper than ten", async () => {
    let inner = part("text/plain", "deep");
    for (let i = 0; i < 11; i++) {
      inner = mime([`Content-Type: multipart/mixed; boundary="n${i}"`], `--n${i}${CRLF}${inner}${CRLF}--n${i}--${CRLF}`);
    }
    const message = mime(["From: jo@mail.test", "To: over@to.offload.club", "Subject: deep", "MIME-Version: 1.0"], "") + inner;
    expect(await parseMail(Buffer.from(message.replace(`MIME-Version: 1.0${CRLF}${CRLF}`, `MIME-Version: 1.0${CRLF}`)))).toEqual({
      refused: "unparseable",
    });
  });

  it("refuses an HTML part over 2MB", async () => {
    const html = `<p>${"a".repeat(2 * 1024 * 1024 + 10)}</p>`;
    expect(await parseMail(Buffer.from(multipart([part("text/html", html)])))).toEqual({ refused: "unparseable" });
  });

  it("refuses a parse that runs past its time", async () => {
    const out = await parseMail(Buffer.from(multipart([part("text/plain", "hi")])), { timeoutMs: 1 });
    expect(out).toEqual({ refused: "unparseable" });
  });

  it("parses an ordinary email in the worker", async () => {
    const out = await parseMail(Buffer.from(multipart([part("text/plain", GMAIL)])));
    expect(out).toMatchObject({ subject: "Booking LX3K9" });
  });
});
