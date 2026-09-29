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
