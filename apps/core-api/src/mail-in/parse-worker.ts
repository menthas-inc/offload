/** 026. The parse itself, run in a worker thread with a memory and a time
 *  limit by `parse.ts`, and imported directly by the tests.
 *
 *  Standalone on purpose: it imports nothing from the app, and uses only
 *  syntax Node's type stripping can erase, so the same file runs as a worker
 *  under `tsx` in development, under vitest, and compiled in production.
 *
 *  Nothing here fetches. mailparser does not resolve remote references, and
 *  the HTML is turned into text without loading anything it names. */

import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { simpleParser } from "mailparser";
import { convert } from "html-to-text";

export const MAX_PARTS = 100;
export const MAX_DEPTH = 10;
export const MAX_HTML_CHARS = 2 * 1024 * 1024;
export const MAX_PART_BYTES = 25 * 1024 * 1024;

export type LeftOutKind = "pdf" | "spreadsheet" | "document" | "calendar" | "archive" | "other";

export type ParsedImage = {
  bytes: Uint8Array;
  contentType: string;
  /** The HTML's own size for an inline image, when it states one. */
  drawn: { width: number | null; height: number | null } | null;
};

export type Parsed = {
  text: string;
  subject: string;
  fromName: string | null;
  fromAddress: string;
  sentAt: string | null;
  /** The first `noteLength` characters of `text` are the person's own words. */
  noteLength: number;
  /** Where reply history begins below the forwarded message, or null. The
   *  turn's copy stops here; the stored text does not. */
  historyAt: number | null;
  messageId: string | null;
  cc: boolean;
  images: ParsedImage[];
  leftOut: Partial<Record<LeftOutKind, number>>;
};

export type ParseResult = Parsed | { refused: "unparseable" };

/** The MIME structure's size, read before anything is decoded: the number of
 *  parts and how deep multiparts nest, from the headers and the boundaries
 *  alone. An over-count only ever refuses. */
function structureTooBig(raw: string): boolean {
  const parts = (raw.match(/^content-type:/gim) ?? []).length;
  if (parts > MAX_PARTS + 1) return true;
  const boundaries = [...raw.matchAll(/boundary="?([^";\r\n]+)"?/gi)].map((m) => m[1]);
  // Depth: walk the delimiter lines and track which boundaries are open.
  const open: string[] = [];
  let deepest = 0;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("--")) continue;
    const name = line.slice(2).replace(/--\s*$/, "").trim();
    if (!boundaries.includes(name)) continue;
    const closing = /--\s*$/.test(line.slice(2 + name.length));
    if (closing) {
      const at = open.lastIndexOf(name);
      if (at !== -1) open.length = at;
    } else if (!open.includes(name)) {
      open.push(name);
      deepest = Math.max(deepest, open.length);
    }
  }
  return deepest > MAX_DEPTH;
}

const FORWARD_MARKERS = [
  /^-{5,}\s*Forwarded message\s*-{5,}\s*$/im,
  /^Begin forwarded message:\s*$/im,
  /^_{10,}\s*$/m,
  /^-{3,}\s*Original Message\s*-{3,}\s*$/im,
];

/** The person's note, the forwarded block's own sender, date and subject, and
 *  where reply history below it starts. */
function forwarded(text: string) {
  let at = -1;
  for (const marker of FORWARD_MARKERS) {
    const m = marker.exec(text);
    if (m && (at === -1 || m.index < at)) at = m.index;
  }
  if (at === -1) return null;
  const after = text.slice(at).split(/\r?\n/).slice(1);
  const fields: Record<string, string> = {};
  let started = false;
  for (const line of after) {
    if (!line.trim()) {
      if (started) break;
      continue;
    }
    const m = /^(From|Date|Sent|Subject|To|Cc):\s*(.*)$/i.exec(line.trim());
    if (!m) break;
    started = true;
    fields[m[1]!.toLowerCase()] = m[2]!.trim();
  }
  if (!fields.from) return null;
  const body = text.slice(at);
  const history = /^(On .{4,200} wrote:|-{3,}\s*Original Message\s*-{3,})\s*$/im.exec(body.slice(1));
  return { at, fields, historyAt: history ? at + 1 + history.index : null };
}

function address(value: string): { name: string | null; address: string } | null {
  const angled = /^\s*"?([^"<]*?)"?\s*<([^>]+@[^>]+)>\s*$/.exec(value);
  if (angled) return { name: angled[1]!.trim() || null, address: angled[2]!.trim() };
  const bare = /([^\s<>]+@[^\s<>]+)/.exec(value);
  return bare ? { name: null, address: bare[1]! } : null;
}

function date(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\s+at\s+/i, " ").replace(/GMT([+-]\d+)/, "GMT$1:00");
  const t = Date.parse(cleaned);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function kindOf(contentType: string, filename: string): LeftOutKind {
  const t = contentType.toLowerCase();
  const f = filename.toLowerCase();
  if (t === "application/pdf" || f.endsWith(".pdf")) return "pdf";
  if (/spreadsheet|excel|csv/.test(t) || /\.(csv|xlsx?|ods|numbers)$/.test(f)) return "spreadsheet";
  if (/calendar/.test(t) || f.endsWith(".ics")) return "calendar";
  if (/zip|compressed|x-7z|x-rar|gzip|x-tar/.test(t) || /\.(zip|7z|rar|gz|tar)$/.test(f)) return "archive";
  if (/msword|wordprocessing|opendocument\.text|rtf|presentation|powerpoint/.test(t) || /\.(docx?|odt|rtf|pptx?|key|pages)$/.test(f))
    return "document";
  return "other";
}

/** The size the HTML draws an inline image at, from its `<img>` attributes. */
function drawnSize(html: string, cid: string | undefined): ParsedImage["drawn"] {
  if (!cid || !html) return null;
  const escaped = cid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tag = new RegExp(`<img[^>]*src=["']cid:${escaped}["'][^>]*>`, "i").exec(html)?.[0];
  if (!tag) return null;
  const num = (attr: string) => {
    const m = new RegExp(`${attr}\\s*=\\s*["']?(\\d+)`, "i").exec(tag) ?? new RegExp(`${attr}\\s*:\\s*(\\d+)px`, "i").exec(tag);
    return m ? Number(m[1]) : null;
  };
  return { width: num("width"), height: num("height") };
}

export async function extract(raw: Uint8Array): Promise<ParseResult> {
  const buffer = Buffer.from(raw);
  if (structureTooBig(buffer.toString("latin1"))) return { refused: "unparseable" };
  const mail = await simpleParser(buffer, {
    skipImageLinks: true,
    skipTextToHtml: true,
    skipTextLinks: true,
    maxHtmlLengthToParse: MAX_HTML_CHARS,
  });
  const html = typeof mail.html === "string" ? mail.html : "";
  if (html.length > MAX_HTML_CHARS) return { refused: "unparseable" };
  if (mail.attachments.some((a) => a.size > MAX_PART_BYTES)) return { refused: "unparseable" };

  // Images and links become nothing and text respectively: nothing is loaded.
  const plain = mail.text?.trim()
    ? mail.text
    : convert(html, { selectors: [{ selector: "img", format: "skip" }, { selector: "a", options: { ignoreHref: true } }] });
  const text = plain.replace(/\r\n/g, "\n").trim();
  const own = mail.from?.value[0];
  const fwd = forwarded(text);
  const fwdFrom = fwd?.fields.from ? address(fwd.fields.from) : null;

  const images: ParsedImage[] = [];
  const leftOut: Partial<Record<LeftOutKind, number>> = {};
  for (const a of mail.attachments) {
    const type = (a.contentType ?? "").toLowerCase();
    if (type.startsWith("image/")) {
      images.push({ bytes: new Uint8Array(a.content), contentType: type, drawn: drawnSize(html, a.cid) });
    } else {
      const kind = kindOf(type, a.filename ?? "");
      leftOut[kind] = (leftOut[kind] ?? 0) + 1;
    }
  }

  const ccValues = [mail.cc].flat().filter(Boolean) as { value: { address?: string }[] }[];
  const cc = ccValues.some((c) => c.value.some((v) => (v.address ?? "").toLowerCase() === "over@to.offload.club"));

  return {
    text,
    subject: (fwd?.fields.subject ?? mail.subject ?? "").trim(),
    fromName: fwdFrom ? fwdFrom.name : (own?.name || null),
    fromAddress: fwdFrom ? fwdFrom.address : (own?.address ?? ""),
    sentAt: fwd ? date(fwd.fields.date ?? fwd.fields.sent) : (mail.date ? mail.date.toISOString() : null),
    noteLength: fwd ? text.slice(0, fwd.at).trimEnd().length : text.length,
    historyAt: fwd ? fwd.historyAt : null,
    messageId: mail.messageId ?? null,
    cc,
    images,
    leftOut,
  };
}

if (!isMainThread && parentPort && workerData?.raw) {
  extract(workerData.raw as Uint8Array).then(
    (result) => parentPort!.postMessage(result),
    () => parentPort!.postMessage({ refused: "unparseable" }),
  );
}
