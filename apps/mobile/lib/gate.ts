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

/** The fourth screen of first run, which asks the one thing it needs.
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
