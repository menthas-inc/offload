// What the gate screens say, shared by both platforms.
//
// The copy is identical on iOS and Android; only the chrome forks. Keeping the
// strings here rather than in each screen is what makes that true and keeps it
// true: a copy change that reaches one platform and not the other is the exact
// drift the fork risks.

export const GATE = {
  signIn: {
    title: "One place for everything you would otherwise forget.",
    sub: "Sign in to start.",
    // 035. In place of the line above, once, for whoever just deleted their
    // account. Not a refusal: nothing went wrong.
    deleted: "Your account is deleted.",
    apple: "Continue with Apple",
    google: "Continue with Google",
    // Split because the kits emphasise the second half in the accent colour
    // inside the sentence. It is emphasis, not a link: there is no public
    // waitlist page, and joining needs an identity you only have after a
    // sign-in attempt, which is what the no-invite screen is for.
    // The lead-in went with "Invite only for now": two sentences saying the
    // same thing on one screen, and the link says what it does on its own.
    terms: "",
    termsAccent: "Join the waitlist",
    // "Terms · Privacy", as the kits draw it and as the web gate's footer
    // says it. Two words because each is its own link to its own page.
    legal: { terms: "Terms", privacy: "Privacy" },
  },
  refused: "That did not go through. Nothing was sent, try again.",
  notInvited: {
    title: "You are not on the list yet",
    sub: (email: string) => `We checked ${email} and found no invite.`,
    subNoEmail: "We found no invite for that account.",
    join: "Join the waitlist",
    switch: "Use a different account",
    terms: "Invited on another address? Sign in with that one.",
  },
  // Reaching the waitlist without a refused sign-in, which the kits do not
  // draw: their no-invite screen always knows the address, because the only
  // way in was an OAuth attempt that failed. Tapping "Join the waitlist" on
  // the gate has no address, so it has to ask for one. The copy follows the
  // marketing page's form, which is the same waitlist and the same voice.
  waitlist: {
    title: "Join the waitlist",
    sub: "Invite only for now. We will email you when your account is ready to use.",
    placeholder: "you@example.com",
    join: "Join the waitlist",
    back: "Back to sign in",
    invalid: "That does not look like an email address.",
  },
  joined: {
    title: "You are on the list",
    sub: (email: string) =>
      `We will email ${email} when your account is ready to use.`,
    subNoEmail: "We will email you when your account is ready to use.",
    toast: "Added to the waitlist",
  },
} as const;

/** The last screen of first run, which offers rather than asks.
 *
 *  From `ConnectScreen` in `ui_kits/mobile_app/FirstRun.jsx` and its Material
 *  twin, option A of `explorations/connect-apps.html`. One provider and one
 *  screen: the mark large enough to be read before the words, two sentences,
 *  one button and Not now.
 *
 *  **Not now, never Skip.** Skip belongs to the tutorial and means skip the
 *  tutorial. Turning down a connection is a different answer to a different
 *  question, so the word changes while the position does not.
 *
 *  **The design system marks all of this copy provisional**, and the two facts
 *  most of all: they commit the product to something about another service's
 *  data, which is the app's call rather than the design system's. What is not
 *  provisional is the shape: what offload reads, and what it does back, both as
 *  sentences rather than switches, per the 5 September privacy refusal, because
 *  a switch implies somebody could have set it the other way. */
export const CONNECT_STEP = {
  title: "Bring in your calendar",
  sub: "So \u201cbefore the trip\u201d and \u201cafter the dentist\u201d mean something.",
  facts: [
    [
      "calendar",
      "offload reads your days.",
      "Times, titles and who is on them.",
    ],
    [
      "plus",
      "And it can add to them.",
      "Anything you dump with a time on it can land back on your calendar.",
    ],
  ] as const,
  connect: "Connect Google Calendar",
} as const;

/** 026. Forwarding email to offload: the address, the card that adds it to
 *  contacts, and the words of the Mail page and first run's Mail step. The
 *  web repeats them in `components/MailBlock.tsx`; the three have to match. */
export const MAIL_ADDRESS = "over@to.offload.club";
/** A static card on the marketing site, opened in the system browser, which
 *  offers to add it to contacts: no native module and no permission. */
export const MAIL_CARD_PATH = "/offload.vcf";
export const MAIL_CARD_URL = `${process.env["EXPO_PUBLIC_WEB_URL"] ?? "https://offload.club"}${MAIL_CARD_PATH}`;
export const MAIL_RELAY_NOTE =
  "You signed in with an address Apple keeps private, so mail you forward can't be matched to you.";

export function mailLines(email: string): [string, string][] {
  return [
    [
      `From ${email}`,
      `Forward an email from ${email} and it's filed like anything else you dump. Mail from any other address isn't accepted.`,
    ],
    ["Forward by hand", "Automatic forwarding rules don't work yet."],
  ];
}

/** The name, on Before you start and on its own for the name-only path.
 *
 *  Here with the rest of the gate copy for the reason at the top of this file:
 *  the screen forks by platform and the words must not. */
export const NAME_STEP = {
  title: "What should we call you?",
  sub: "This is the name people you share a thread with will see.",
  placeholder: "Your name",
} as const;

/** The consent, on Before you start.
 *
 *  Two ticks and not one. A single "I agree to the privacy policy" is bundled
 *  consent, which is treated as no consent at all, and the second of these is
 *  the only lawful basis offload has for the private things people dump in.
 *  The wording is deliberately about what offload will hold rather than about
 *  a document, because that is the thing being agreed to.
 *
 *  Kept here with the rest of the gate copy so the two platforms cannot drift.
 *  The web app repeats it in its own welcome screen; the three have to match. */
export const CONSENT = {
  policyBefore: "I have read the ",
  policyLink: "privacy policy",
  policyAfter: ".",
  processing:
    "I understand offload will hold whatever I dump in, which can include health, money and other private matters, and I agree to it being processed to run offload.",
  // Not a consent and not a warning about us. It is the one piece of advice on
  // the screen and it applies to every assistant, not only this one.
  note: "We do not recommend sharing passwords, card numbers or government IDs in any AI tool.",
} as const;

/** 033. The intro: one screen, three scenes that play themselves. Each title
 *  and line is read as one live announcement, so they are written to stand
 *  alone. The web repeats them in `components/firstrun/copy.ts`. */
export const INTRO = [
  {
    title: "offload keeps track for you",
    line: "Dump what you would otherwise forget. offload remembers it and puts it in order.",
  },
  {
    title: "Everything lands in threads",
    line: "What belongs together gathers in one thread. Share it, and plan it with the people in it.",
  },
  {
    title: "Send it any way",
    line: "Type it, say it, snap a photo, or forward the email.",
  },
] as const;

/** Scene one's loose dumps and which of the two threads each is filed in. */
export const INTRO_DUMPS = [
  ["Ana can only travel the 14th to the 17th", 0],
  ["matte black, 30cm", 1],
  ["€214 for the flights", 0],
  ["4 more shelf brackets", 1],
] as const;

/** The two threads, with the count they start at. The count carries no unit:
 *  a bare number beside a thread is unambiguous and names nothing. */
export const INTRO_THREADS = [
  ["lasso", "Lisbon trip", 2],
  ["bookmark", "Bookshelf build", 1],
] as const;

/** Scene two, a shared thread. */
export const INTRO_SHARED = {
  thread: "Lisbon trip",
  rows: [
    ["calendar", "Alfama flat, 14 to 17 Oct"],
    ["tag", "Flights, €214"],
    ["text-quote", "Ana can only travel the 14th to the 17th"],
  ],
  people: [
    ["Jo Martins", "JM"],
    ["Ana Duarte", "AD"],
    ["Tom Reis", "TR"],
  ],
  shared: "Shared with Ana and Tom",
  addedBy: "Tom",
  added: "added Pastéis de Belém",
} as const;

/** Scene three, any way in. */
export const INTRO_WAYS = {
  photo: "Photo",
  voice: "Voice note, 0:12",
  email: ["Email", "Fwd: Your booking is confirmed", "Alfama, 14 to 17 Oct"],
  link: ["Link", "airbnb.com/rooms/4471", "Read and filed"],
  filed: "All four filed in Lisbon trip",
} as const;

/** 033. Before you start: the name and the consent, the only two things first
 *  run asks. The consent's own words are `CONSENT`, below. */
export const BEFORE = {
  title: "Before you start",
  name: "What should we call you?",
  agree: "What you are agreeing to",
  next: "Continue",
} as const;

/** 033. Bring it all in: optional, after the account is active. The design
 *  says *Bring things in*; *thing* is a retired word (owner, 2026-10-03). */
export const BRING = {
  title: "Bring it all in",
  lead: "All optional. Each one is in Settings if you would rather wait.",
  mail: {
    title: "Forward emails to offload",
    line: (email: string) => [`Send anything to `, MAIL_ADDRESS, ` from ${email} and it is filed.`] as const,
    copy: "Copy address",
    copied: "Copied",
    contacts: "Add to contacts",
  },
  calendar: {
    title: "Bring in your calendar",
    connect: "Connect Google Calendar",
    connected: "Connected",
  },
  notifications: {
    title: "Hear about what is due",
    line: "We will reach you at the right time with the right reminders and information.",
    allow: "Allow notifications",
    allowed: "Allowed",
    settings: "Open settings",
  },
  skip: "Skip for now",
  done: "Done",
} as const;

/** Day one on Today. Real sentences from one trip and one build, not "Buy
 *  milk": the point is to show what a dump looks like, and a placeholder
 *  chore shows nothing. */
export const EXAMPLES = [
  "Book the Alfama flat for the 14th",
  "Ana can only travel the 14th to the 17th",
  "Oak brackets, 30cm, matte black",
] as const;

export const DAY_ONE_INVITATION =
  "Dump anything and offload will sort it. You do not need to pick a place for it, or name it, or come back and tidy it up.";
