/** A name or a sentence as it is compared: Unicode-folded, lower case, every
 *  run of anything that is not a letter or a digit one space. Calendars and
 *  memories match names this way, so "Meera", "MEERA" and "meera!" agree. */
export const flat = (text: string): string =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
