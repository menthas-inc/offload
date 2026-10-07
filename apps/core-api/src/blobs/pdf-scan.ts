/** 041. The Core API's own check of a clean copy before it is sealed, so a
 *  buggy or compromised worker cannot store a PDF that members then open.
 *
 *  The worker saves the clean copy as one revision with no object streams,
 *  which puts every dictionary in plain bytes. This walks the file as a
 *  lexer would: comments, literal and hex strings are skipped, a stream's
 *  data is skipped by the direct `/Length` of its dictionary, and every name
 *  outside them is decoded (`#xx`) and checked against the kill list. A file
 *  it cannot walk, a stream with an indirect length, an object stream, a
 *  second revision or anything on the list is refused. Stream data is
 *  drawing and images, never a dictionary, so a script's name inside a
 *  content stream is not a script. */

export const KILL = new Set([
  "JS",
  "JavaScript",
  "OpenAction",
  "AA",
  "Launch",
  "SubmitForm",
  "ImportData",
  "GoToR",
  "GoToE",
  "URI",
  "EmbeddedFile",
  "EmbeddedFiles",
  "FileAttachment",
  "RichMedia",
  "Movie",
  "Sound",
  "3D",
  "XFA",
  "AcroForm",
  "Metadata",
  "PieceInfo",
  "Info",
  "ObjStm",
  "Encrypt",
  "Rendition",
  "URL",
  "SetOCGState",
]);

const WHITE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

function decodeName(raw: string): string {
  return raw.replace(/#([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** True when the bytes are a clean copy the API may seal. */
export function cleanCopyPasses(bytes: Buffer): boolean {
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return false;
  const n = bytes.length;
  let i = 0;
  let startxrefs = 0;
  // Where the current indirect object began, to find a stream's /Length.
  let objectAt = 0;

  while (i < n) {
    const c = bytes[i]!;
    if (WHITE.has(c)) {
      i++;
      continue;
    }
    if (c === 0x25) {
      // A comment, to the end of the line.
      while (i < n && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i++;
      continue;
    }
    if (c === 0x28) {
      // A literal string: balanced parentheses, backslash escapes.
      let depth = 1;
      i++;
      while (i < n && depth > 0) {
        const d = bytes[i]!;
        if (d === 0x5c) i += 2;
        else {
          if (d === 0x28) depth++;
          else if (d === 0x29) depth--;
          i++;
        }
      }
      if (depth !== 0) return false;
      continue;
    }
    if (c === 0x3c && bytes[i + 1] === 0x3c) {
      i += 2;
      continue;
    }
    if (c === 0x3e && bytes[i + 1] === 0x3e) {
      i += 2;
      continue;
    }
    if (c === 0x3c) {
      // A hex string.
      const end = bytes.indexOf(0x3e, i);
      if (end < 0) return false;
      i = end + 1;
      continue;
    }
    if (c === 0x2f) {
      // A name.
      let j = i + 1;
      while (j < n && !WHITE.has(bytes[j]!) && !DELIM.has(bytes[j]!)) j++;
      const name = decodeName(bytes.subarray(i + 1, j).toString("latin1"));
      if (KILL.has(name)) return false;
      i = j;
      continue;
    }
    if (DELIM.has(c)) {
      i++;
      continue;
    }
    // A regular word: a number or a keyword.
    let j = i;
    while (j < n && !WHITE.has(bytes[j]!) && !DELIM.has(bytes[j]!)) j++;
    const word = bytes.subarray(i, j).toString("latin1");
    if (word === "obj") objectAt = j;
    if (word === "startxref") startxrefs++;
    if (word === "stream") {
      // The dictionary just before it, from its object's start, says how
      // long the data is; an indirect length cannot be walked here.
      const dict = bytes.subarray(objectAt, i).toString("latin1");
      const length = /\/Length\s+(\d+)(\s+\d+\s+R)?/.exec(dict);
      if (!length || length[2]) return false;
      // Two lengths: a viewer that takes the other one reads a different
      // span as data, and what this scan skipped as an object.
      if ((dict.match(/\/Length(?=[\s/<>[\]()%])/g) ?? []).length !== 1) return false;
      let k = j;
      if (bytes[k] === 0x0d) k++;
      if (bytes[k] === 0x0a) k++;
      const end = k + Number(length[1]);
      if (end > n) return false;
      // A viewer that finds a stream's end by searching stops at the first
      // `endstream`, so one inside the data would end it early.
      if (bytes.subarray(k, end).includes("endstream", 0, "latin1")) return false;
      // The data is skipped whole; `endstream` must follow it.
      let m = end;
      while (m < n && WHITE.has(bytes[m]!)) m++;
      if (bytes.subarray(m, m + 9).toString("latin1") !== "endstream") return false;
      i = m + 9;
      continue;
    }
    i = j;
  }
  return startxrefs === 1;
}
