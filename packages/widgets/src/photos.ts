// What a photo row shows of its details (2026-09-29).
//
// The filing prompt writes a photo's details as three lines: why it was kept,
// what is in it, then `Text:` and every word read out of the picture. The
// first two are its caption. The words stay stored and searchable, and are
// never shown as details: a whole document or a message thread is not a
// caption, and the picture is one tap away.

/** The caption, or null when there is nothing before the `Text:` line. */
export function photoCaption(body: string | null | undefined): string | null {
  if (!body) return null;
  const at = body.search(/(^|\n)Text:/);
  const caption = (at < 0 ? body : body.slice(0, at)).trim();
  return caption.length > 0 ? caption : null;
}

/** 2026-11-02. The body with its caption replaced and the `Text:` words kept,
 *  for the row sheet's details field. Null when nothing is left. */
export function withCaption(body: string | null | undefined, caption: string): string | null {
  const at = body ? body.search(/(^|\n)Text:/) : -1;
  const words = at < 0 || !body ? "" : body.slice(at).replace(/^\n/, "");
  const next = [caption.trim(), words].filter((part) => part.length > 0).join("\n");
  return next.length > 0 ? next : null;
}

// A US number in any of its usual spellings, whole: not inside a longer run of
// digits, so a date, an id or a price is not read as one. offload is offered in
// the United States only, so ten digits are a US number.
const US_NUMBER = /(?<![\w+.,-])(?:\+?1[ .-]?)?\(?([2-9]\d{2})\)?[ .-]?([2-9]\d{2})[ .-]?(\d{4})(?![\w-])/;
// Any other country's, which must say so with its +.
const OTHER_NUMBER = /(?<![\w+])\+(?!1)\d[\d ().-]{6,}\d(?![\w-])/;

/** 2026-11-02. The first phone number in a row's details, as the pill shows it
 *  and as the platform dials it, or null. Read from what the row already
 *  shows, so the number on the pill is the one on the screen. */
export function phoneIn(text: string | null | undefined): { shown: string; tel: string } | null {
  if (!text) return null;
  const us = US_NUMBER.exec(text);
  const other = OTHER_NUMBER.exec(text);
  if (us && (!other || us.index <= other.index)) {
    const [, area, exchange, line] = us;
    return { shown: `+1 ${area} ${exchange} ${line}`, tel: `tel:+1${area}${exchange}${line}` };
  }
  const digits = other?.[0].replace(/\D/g, "") ?? "";
  return other && digits.length >= 8 && digits.length <= 15 ? { shown: other[0], tel: `tel:+${digits}` } : null;
}

/** Per message, photos and PDFs together, and the server holds the same
 *  number. */
export const MAX_PHOTOS = 10;
/** 041. Per message, inside the ten. */
export const MAX_PDFS = 2;
/** Per photo. The server holds the same number and refuses by bytes. */
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

/** 041. A PDF by its type, or by its name when the browser or the picker
 *  gives no type. The server reads the bytes; this only spares a request. */
export function isPdf(file: { type: string | null; name: string | null }): boolean {
  const type = (file.type ?? "").toLowerCase();
  // Mail, several Android providers and some desktops hand a .pdf over as
  // bytes of no type; the server reads the bytes either way.
  return type === "application/pdf" || ((type === "" || type === "application/octet-stream") && /\.pdf$/i.test(file.name ?? ""));
}

/** 041. Which of the incoming files a draft holding `current` takes: ten in
 *  all, two of them PDFs, in the order given, and the line for what it left. */
export function takeFiles<T extends { type: string | null; name: string | null }>(
  current: { kind: "image" | "pdf" }[],
  incoming: T[],
): { taken: T[]; line: "Ten at a time." | "Two PDFs at a time." | null } {
  let room = MAX_PHOTOS - current.length;
  let pdfRoom = MAX_PDFS - current.filter((one) => one.kind === "pdf").length;
  const taken: T[] = [];
  let line: "Ten at a time." | "Two PDFs at a time." | null = null;
  for (const one of incoming) {
    if (room <= 0) {
      line ??= "Ten at a time.";
      continue;
    }
    if (isPdf(one)) {
      if (pdfRoom <= 0) {
        line ??= "Two PDFs at a time.";
        continue;
      }
      pdfRoom--;
    }
    room--;
    taken.push(one);
  }
  return { taken, line };
}

/** 041. A long name clipped in the middle, so its end, which is usually what
 *  tells two PDFs apart, survives. */
export function clipMiddle(name: string, max = 20): string {
  if (name.length <= max) return name;
  const tail = Math.ceil((max - 1) / 2);
  return `${name.slice(0, max - 1 - tail)}…${name.slice(name.length - tail)}`;
}
