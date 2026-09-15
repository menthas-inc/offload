// The list of countries somebody can say they are in.
//
// **The server owns it so the two clients cannot disagree.** A list this long
// duplicated in three places is three lists, and the one that matters is the one
// the validator checks against: a client offering a code the server refuses is a
// setting that silently fails to save.
//
// Built from `Intl.DisplayNames` at module load rather than checked in. Node has
// full ICU, the names come from the same data every browser uses, and a
// hand-maintained list of 250 rows is a file nobody will ever update.

/** ISO 3166-1 alpha-2, and the English name for it. */
export interface Country {
  code: string;
  name: string;
}

/** Codes `Intl` answers for that are not places somebody lives.
 *
 *  **ICU's region list is wider than ISO 3166-1**, and the generated list
 *  offered "Unknown Region", "European Union" and two pseudo-locales used for
 *  testing translations. Caught by a test asserting `isCountry("ZZ")` is false,
 *  which it was not.
 *
 *  `CQ` (Sark) and `UM` (U.S. Outlying Islands) stay: both are real places with
 *  people in them, and a list that refuses where somebody actually lives is
 *  worse than one carrying two rows nobody picks. */
const NOT_A_COUNTRY = new Set([
  "EU", // a union of them
  "EZ", // the eurozone, likewise
  "UN", // an organisation
  "QO", // a CLDR grouping, not a place
  "XA", // pseudo-locale, for testing translations
  "XB", // pseudo-locale
  "ZZ", // "Unknown Region"
]);

function build(): Country[] {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const out: Country[] = [];

  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = String.fromCharCode(first) + String.fromCharCode(second);
      const name = names.of(code);
      // `of` echoes the input back for a code it does not know, which is how a
      // reserved or user-assigned pair is told from a real one.
      if (name && name !== code && !NOT_A_COUNTRY.has(code)) out.push({ code, name });
    }
  }

  return out.sort((a, b) => a.name.localeCompare(b.name, "en"));
}

export const COUNTRIES: Country[] = build();

// **A generated list that fails by being empty is the worst kind.**
//
// `Intl.DisplayNames` needs full ICU. A Node built with the small one answers
// nothing for every code, `build()` returns `[]`, the endpoint serves an empty
// list and the settings screen draws a picker with one row in it saying "Not
// set". Nothing raises, nothing logs, and the feature is simply absent.
//
// So it raises here, at import, which means the process does not start rather
// than starting wrong. The number is a floor rather than an exact count,
// because ICU's register moves and an exact assertion would fail on an upgrade
// that is not a fault.
if (COUNTRIES.length < 200) {
  throw new Error(
    `country list came out with ${COUNTRIES.length} entries: this Node has no full ICU`
  );
}

const CODES = new Set(COUNTRIES.map((country) => country.code));

/** Whether this is a country somebody could have picked.
 *
 *  The same set the list is built from, so anything the clients can offer is
 *  something this accepts, and anything else is refused rather than stored. */
export function isCountry(code: string): boolean {
  return CODES.has(code);
}
