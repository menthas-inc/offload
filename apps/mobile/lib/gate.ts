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
    // The kits say "Terms · Privacy". There is no terms page yet, and a line
    // naming a document that does not exist is worse than a shorter line, so
    // this is Privacy alone until there is a second thing to name.
    legal: "Privacy",
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
  notNow: "Not now",
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

/** First run's Mail step, in the calendar step's shape. */
export function mailStep(email: string) {
  return {
    title: "Forward what matters",
    facts: [
      ["mail", "Send it an email.", `Forward anything to ${MAIL_ADDRESS} and it's filed.`],
      ["lock", "Only from your address.", `Mail from ${email} is the only mail it accepts.`],
    ] as [string, string, string][],
    button: "Add to contacts",
  };
}

export type Offer = "mail" | "calendar";

/** The optional steps after first run, in order. Mail comes first: connecting
 *  a calendar ends first run on the calendar page, so nothing after it would
 *  ever be seen by somebody who connects. An Apple hidden email is not offered
 *  Mail, which could not work for it. */
export function offersFor(account: { mailAvailable: boolean; calendarOffer: boolean }): Offer[] {
  return [...(account.mailAvailable ? (["mail"] as const) : []), ...(account.calendarOffer ? (["calendar"] as const) : [])];
}

/** The dots over an offer: the tutorial plus the offers this account is
 *  shown, never a constant, with the current offer's dot the bar. */
export function dotsFor(offers: Offer[], current: Offer): { steps: number; active: number } {
  return { steps: TUTORIAL.length + offers.length, active: TUTORIAL.length + offers.indexOf(current) };
}

/** The fifth screen of first run, which asks the one thing it needs.
 *
 *  Here with the rest of the gate copy for the reason at the top of this file:
 *  the screen forks by platform and the words must not. */
export const NAME_STEP = {
  title: "What should we call you?",
  sub: "This is the name people you share a thread with will see.",
  placeholder: "Your name",
} as const;

/** The fifth screen of first run, which is the one that asks for consent.
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
  title: "Before you start",
  sub: "offload holds what you put in it, so it is worth knowing what that means before you put anything in.",
  policyBefore: "I have read the ",
  policyLink: "privacy policy",
  policyAfter: ".",
  processing:
    "I understand offload will hold whatever I dump in, which can include health, money and other private matters, and I agree to it being processed to run offload.",
  // Not a consent and not a warning about us. It is the one piece of advice on
  // the screen and it applies to every assistant, not only this one.
  note: "We do not recommend sharing passwords, card numbers or government IDs in any AI tool.",
} as const;

export const TUTORIAL = [
  {
    title: "Dump anything",
    sub: "Half a thought, a photo, a voice note. No folders, no tidying.",
    art: "bubbles",
  },
  {
    title: "offload sorts it",
    sub: "Related bits end up together, with the dates and the money attached.",
    art: "threads",
  },
  {
    title: "It only interrupts when it matters",
    sub: "Deadlines and answers you are waiting on. Nothing else.",
    art: "notification",
  },
] as const;

export const DUMPS = [
  "Ana can only travel the 14th to the 17th",
  "€214 for the flights",
  "matte black, 30cm",
  "dentist after the 20th",
] as const;

/** Threads with a count, for the tutorial's second screen.
 *
 *  The count carries no unit. It used to read "4 things", and "thing" is not a
 *  word the product says any more: it named the unit vaguely on a screen whose
 *  whole job is to show that you never have to name anything. A bare number
 *  beside a thread is unambiguous in context and says less, which is the
 *  point. */
export const THREADS = [
  ["lasso", "Lisbon trip", "4"],
  ["bookmark", "Bookshelf build", "2"],
  ["cloudy", "Read later", "23"],
] as const;

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
