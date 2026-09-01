// What the gate screens say, shared by both platforms.
//
// The copy is identical on iOS and Android; only the chrome forks. Keeping the
// strings here rather than in each screen is what makes that true and keeps it
// true: a copy change that reaches one platform and not the other is the exact
// drift the fork risks.

export const GATE = {
  signIn: {
    title: "One place for everything you would otherwise forget.",
    sub: "Sign in to start. Invite only for now.",
    apple: "Continue with Apple",
    google: "Continue with Google",
    terms: "No invite yet? Join the waitlist",
    legal: "Terms · Privacy",
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
  joined: {
    title: "You are on the list",
    sub: (email: string) => `We will email ${email} when your account is ready to use.`,
    subNoEmail: "We will email you when your account is ready to use.",
    toast: "Added to the waitlist",
  },
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
    art: "things",
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

export const THINGS = [
  ["lasso", "Lisbon trip", "4 things"],
  ["bookmark", "Bookshelf build", "2 things"],
  ["cloudy", "Read later", "23 things"],
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
  "Dump the first thing and offload will sort it. You do not need to pick a place for it, or name it, or come back and tidy it up.";
