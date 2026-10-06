// 038. The words that keep the nightly pass off the sensitive list.
//
// The pass may never learn health, religion, politics, sexuality or gender,
// ethnicity, criminal record or money: those are kept only when the person
// asks. The prompt says so; this drops a candidate that touches one anyway.
// Lossy on purpose: a false drop costs one memory, a false keep is the harm
// the research found (passing remarks becoming stored diagnoses).

const WORDS = [
  // health
  "diabetes", "diabetic", "cancer", "anxiety", "depression", "depressed", "adhd", "autism", "autistic",
  "pregnant", "pregnancy", "miscarriage", "ivf", "fertility", "therapy", "medication", "diagnosed",
  "diagnosis", "disorder", "illness", "disease", "allergy", "allergic", "surgery", "hiv", "std",
  "mental health", "bipolar", "ocd", "ptsd", "addiction", "sober", "rehab", "disability", "disabled",
  // religion
  "muslim", "christian", "catholic", "jewish", "hindu", "buddhist", "sikh", "atheist", "religion",
  "religious", "church", "mosque", "synagogue", "temple", "pray", "prayer",
  // politics
  "conservative", "liberal", "ndp", "democrat", "republican", "labour", "tory", "vote", "votes",
  "voted", "political", "politics",
  // sexuality and gender
  "gay", "lesbian", "bisexual", "queer", "transgender", "trans", "nonbinary", "non-binary",
  "sexuality", "sexual",
  // ethnicity
  "ethnicity", "race", "racial",
  // criminal record
  "criminal", "arrested", "convicted", "conviction", "prison", "jail", "probation",
  // money
  "salary", "income", "debt", "debts", "owe", "owes", "loan", "mortgage balance", "credit score",
  "bankrupt", "bankruptcy", "net worth", "savings",
];

const PATTERN = new RegExp(`\\b(?:${WORDS.map((w) => w.replace(/[-]/g, "\\-")).join("|")})\\b`, "i");

export function touchesSensitive(text: string): boolean {
  return PATTERN.test(text.normalize("NFKC"));
}
