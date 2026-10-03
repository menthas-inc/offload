// 033. The decisions first run makes, kept out of the screens so they can be
// tested without rendering one. The web repeats them in `lib/first-run.ts`.

export type Step = "intro" | "you" | "bring";
export type Card = "mail" | "calendar" | "notifications";
/** `ask` only while the system has never asked. A permission already granted
 *  or refused has nothing for the card to do. */
export type NotificationOffer = "ask" | "decided" | "unsupported";

/** Each scene of the intro, start to the next. */
export const SCENE_MS = 9600;

/** The name-only path is an account that finished first run before names:
 *  it has read the intro and consented, so it gets the name and nothing else. */
export function firstStep({ nameOnly }: { replay: boolean; nameOnly: boolean }): Step {
  return nameOnly ? "you" : "intro";
}

/** Bring things in draws only what can apply, in this order. */
export function bringCards(account: {
  mailAvailable: boolean;
  calendarOffer: boolean;
  notifications: NotificationOffer;
}): Card[] {
  return [
    ...(account.mailAvailable ? (["mail"] as const) : []),
    ...(account.calendarOffer ? (["calendar"] as const) : []),
    ...(account.notifications === "ask" ? (["notifications"] as const) : []),
  ];
}

/** With nothing to offer, Before you start goes straight to Today. */
export function afterYou(cards: readonly Card[]): "bring" | "today" {
  return cards.length > 0 ? "bring" : "today";
}

export function introNext(scene: number): number {
  return (scene + 1) % 3;
}

/** Scenes move on their own only when nobody has asked for less motion and no
 *  screen reader is reading them: one would be read over by the next. */
export function autoAdvance({ reduceMotion, screenReader }: { reduceMotion: boolean; screenReader: boolean }): boolean {
  return !reduceMotion && !screenReader;
}
