/** 041. The name a PDF opens under: the row's title for a member, the
 *  dumper's own name for it for the dumper. Made safe for a response header
 *  and for a file system, since a title is model-written and may quote the
 *  document: control characters, quotes and path and shell punctuation go,
 *  whitespace collapses, at most eighty characters, `.pdf` on the end. */

// C0 and C1 controls, zero-width and direction marks, line and paragraph
// separators, the byte order mark, and the punctuation a header or a path
// gives meaning to.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff"\\/:;*?<>|]/g;

export function pdfFileName(title: string | null | undefined): string {
  let base = (title ?? "")
    .replace(UNSAFE, " ")
    .replace(/\s+/g, " ")
    .trim()
    // No hidden files and no "..": a leading dot goes.
    .replace(/^\.+/, "")
    .trim();
  base = base.replace(/\.pdf$/i, "").trim().slice(0, 80).trim();
  return `${base || "PDF"}.pdf`;
}

/** `Content-Disposition` for a PDF: an ASCII fallback, and the name itself in
 *  RFC 5987's encoding for every client that reads it. */
export function pdfDisposition(title: string | null | undefined, how: "inline" | "attachment" = "inline"): string {
  const name = pdfFileName(title);
  const ascii = name
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const encoded = encodeURIComponent(name).replace(/['()*!]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${how}; filename="${ascii === ".pdf" ? "PDF.pdf" : ascii}"; filename*=UTF-8''${encoded}`;
}
