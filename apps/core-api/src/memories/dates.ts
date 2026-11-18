// 051. A day that comes round every year, read out of words.
//
// Only a day with its month in words: "Feb 1st", "1 February", "the 1st of
// Feb". A day written in numbers ("1/2") is not read, because nothing says
// which order an account writes them in, and an ISO date is what the model
// writes, not what a person says. The unasked remember compares the day in a
// memory with the day in the person's own message, and this is the one
// reading of both.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const DAY = "(\\d{1,2})(?:st|nd|rd|th)?";
const DAY_MONTH = new RegExp(`(?<![\\d/.-])(?:the\\s+)?${DAY}\\s+(?:of\\s+)?${MONTH}(?![a-z])`, "gi");
const MONTH_DAY = new RegExp(`(?<![a-z])${MONTH}\\s+(?:the\\s+)?${DAY}(?![\\d:/a-z])`, "gi");
const LAST_DAY = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** `MM-DD` is a day some year has: 29 February is one. */
export function realDay(on: string): boolean {
  const m = /^(\d{2})-(\d{2})$/.exec(on);
  if (!m) return false;
  const month = Number(m[1]);
  const day = Number(m[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= LAST_DAY[month - 1]!;
}

function asDay(month: string, day: string): string | null {
  const index = MONTHS.indexOf(month.toLowerCase().slice(0, 3));
  const on = `${String(index + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
  return index >= 0 && realDay(on) ? on : null;
}

interface Found {
  on: string;
  at: number;
  end: number;
}

function found(text: string): Found[] {
  const out: Found[] = [];
  const flat = text.normalize("NFKC");
  for (const m of flat.matchAll(DAY_MONTH)) {
    const on = asDay(m[2]!, m[1]!);
    if (on) out.push({ on, at: m.index!, end: m.index! + m[0].length });
  }
  for (const m of flat.matchAll(MONTH_DAY)) {
    const at = m.index!;
    if (out.some((f) => at < f.end && f.at < at + m[0].length)) continue;
    const on = asDay(m[1]!, m[2]!);
    if (on) out.push({ on, at, end: at + m[0].length });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Every day in the words, as `MM-DD`, in the order they come. */
export function daysIn(text: string): string[] {
  return found(text).map((f) => f.on);
}

/** The words with each day taken out, so what is left can be held to the
 *  person's message word by word. A year stays: it is a number they said. */
export function withoutDays(text: string): string {
  const flat = text.normalize("NFKC");
  let out = "";
  let from = 0;
  for (const f of found(flat)) {
    out += `${flat.slice(from, f.at)} `;
    from = f.end;
  }
  return out + flat.slice(from);
}
