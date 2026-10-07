// 033. First run's words on the web. The phones hold the same in
// `apps/mobile/lib/gate.ts`; the two have to match, and test/consent.test.tsx
// checks the consent's and the failure line's.

import { MAIL_ADDRESS } from "../MailBlock";

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

/** The two threads, with the count they start at. No unit on the count. */
export const INTRO_THREADS = [
  ["lasso", "Lisbon trip", 2],
  ["bookmark", "Bookshelf build", 1],
] as const;

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

export const INTRO_WAYS = {
  photo: "Photo",
  voice: "Voice note, 0:12",
  email: ["Email", "Fwd: Your booking is confirmed", "Alfama, 14 to 17 Oct"],
  link: ["Link", "airbnb.com/rooms/4471", "Read and filed"],
  filed: "All four filed in Lisbon trip",
} as const;

export const BEFORE = {
  title: "Before you start",
  /** Asked again: an account that has used offload for weeks is not starting.
   *  One title whether the name is asked with the ticks or not. */
  again: "Before you go on",
  name: "What should we call you?",
  nameSub: "This is the name people you share a thread with will see.",
  agree: "What you are agreeing to",
  next: "Continue",
} as const;

/** The two ticks, verbatim on all three surfaces. */
export const CONSENT = {
  termsBefore: "I agree to the ",
  termsLink: "terms",
  policyBefore: " and have read the ",
  policyLink: "privacy policy",
  policyAfter: ".",
  processing:
    "I understand offload will hold whatever I dump in, which can include health, money and other private matters, and I agree to it being processed to run offload, including by AI services from other companies.",
  note: "We do not recommend sharing passwords, card numbers or government IDs in any AI tool.",
} as const;

/** The design says *Bring things in*; *thing* is a retired word (owner,
 *  2026-10-03). */
export const BRING = {
  title: "Bring it all in",
  lead: "All optional. Each one is in Settings if you would rather wait.",
  mail: {
    title: "Forward emails to offload",
    line: (email: string) => ["Send anything to ", MAIL_ADDRESS, ` from ${email} and it is filed.`] as const,
    copy: "Copy address",
    copied: "Copied",
    contacts: "Add to contacts",
  },
  calendar: {
    title: "Bring in your calendar",
    line: "So “before the trip” and “after the dentist” mean something.",
    connect: "Connect Google Calendar",
    connected: "Connected",
  },
  skip: "Skip for now",
  done: "Done",
} as const;

/** What happened, never why: offload cannot see whether it was the network or
 *  the server, and Continue beside it is the way forward. The phones hold it
 *  as `GATE.failed` in `apps/mobile/lib/gate.ts`. */
export const FAILED = "That did not go through. Try again.";

/** Above the two ticks when an active account is asked again, because the
 *  privacy policy or the terms moved. Both words link. The phones hold the
 *  same in `apps/mobile/lib/gate.ts`. */
export const RECONSENT = {
  before: "We have changed the ",
  terms: "terms",
  middle: " or the ",
  policy: "privacy policy",
  after: ".",
} as const;

/** Under the ticks when asked again, and only then: the terms say whoever does
 *  not agree can take a copy and delete their account, so the screen offers
 *  the way to both without agreeing first. The phones hold the same in
 *  `apps/mobile/lib/gate.ts`. */
export const WAY_OUT = "Take a copy or delete your account";
