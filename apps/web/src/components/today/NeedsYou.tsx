"use client";

// 027 Needs you: interruptions only, one card at a time with the rest stacked
// under it.
//
// Each action does exactly what it does where it already lives, through the
// same route and with its own failure words: Accept is 022's accept, an option
// is 018's answer with 018's Undo, Reconnect is 019's sign-in, Use and Keep are
// 023's writes. The card goes as the action is drawn and the next comes up,
// and **the next card's actions take no press for 300ms**, so a second click
// meant for the first card cannot land on it. A write that fails puts the card
// back with that action's own line, and the action it failed becomes Try
// again. The clock puts a card off until tomorrow; the web has no swipe.
//
// A question with no values to tap, a date, span or time, is answered by
// typing, so it is drawn as any other card, one row: Answer makes the
// conversation that asked the current one and the composer opens on it with
// the question's invitation, and stays until that answer closes the question;
// Dismiss is 018's way out by its index.
//
// 2026-10-18. An answered card's Undo line takes the card's place and corner,
// above the next card: *Saturday, for Europe, October*.

import { useRef, useState } from "react";
import { zoneCity, stackView } from "@offload/widgets";
import { Icon } from "../Icon";
import { QuickReplies } from "../shell/QuickReplies";
import { ThreadPill } from "../shell/ThreadPill";
import { useToast } from "../shell/Toast";
import { Line } from "../shell/InPlace";
import { useUndoEntries } from "../../lib/undo";
import { useThreads } from "../shell/threads-context";
import { answerQuestion, resumeQuestion, undoTurn, RESUME_COMPOSER } from "../../lib/dump";
import { acceptInvitation, answerRequestOutcome, firstNameOf, nameOf } from "../../lib/people";
import { putOff, type NeedsCard } from "../../lib/today";
import { connectUrl } from "../../lib/use-calendars";
import { refreshMe, updateClock } from "../../lib/use-me";
import styles from "../../app/(shell)/today.module.css";

/** 023's strip, now a card: computed in the browser, so the server never
 *  sends it. */
export interface ZoneCard {
  key: "zone";
  kind: "zone";
  device: string;
  account: string;
}

export type Card = NeedsCard | ZoneCard;

/** How long the next card ignores a press after it arrives. */
export const INERT_MS = 300;

const DAY_MS = 24 * 60 * 60 * 1000;
/** 022's line, the one most of these routes already say. */
const FAILED = "That didn't go through.";

type Tone = "danger" | "attention" | "accent";

/** Landed; already settled somewhere else, so the card goes; or refused, so
 *  it comes back. */
type Outcome = "ok" | "gone" | "failed";

interface Action {
  label: string;
  run: () => Promise<Outcome>;
  /** Does it without settling the card: Copy address. */
  keeps?: boolean;
  /** A navigation rather than a write: Reconnect. */
  href?: string;
  /** The action's own failure line, when it is not 022's. */
  failed?: string;
  /** What a card settled elsewhere says as it goes; nothing when absent. */
  gone?: string;
}

const outcomeOf = (ok: boolean): Outcome => (ok ? "ok" : "failed");

/** "Waiting 2 days" once a day has passed, the kind's own words before. */
function waited(since: string, fresh: string): string {
  const days = Math.floor((Date.now() - new Date(since).getTime()) / DAY_MS);
  return days >= 1 ? `Waiting ${days} ${days === 1 ? "day" : "days"}` : fresh;
}

export function NeedsYou({ cards, load }: { cards: Card[]; load: number }) {
  const toast = useToast();
  const threads = useThreads();
  const [settled, setSettled] = useState<Set<string>>(new Set());
  // How many this read held: a card can leave by itself (the zone card once
  // Keep lands) and *N of M* goes on from where it was. A new read starts over.
  const [loaded, setLoaded] = useState(cards.length);
  const [seen, setSeen] = useState(load);
  if (seen !== load) {
    setSeen(load);
    setLoaded(cards.length);
    setSettled(new Set());
  }
  const [failed, setFailed] = useState<{ key: string; label: string; line: string } | null>(null);
  const inertUntil = useRef(0);
  const undos = useUndoEntries();

  // The answered cards' lines, where the card was, with a card's corner: the
  // nearest token to the stylesheet's own 18px.
  const answeredLines = [...settled].flatMap((key) => {
    const entry = undos.get(key);
    return entry ? [<Line key={key} entry={entry} radius="var(--radius-lg)" />] : [];
  });
  const view = stackView(cards, settled, loaded);
  const card = view.current;
  if (!card) return answeredLines.length > 0 ? <>{answeredLines}</> : null;
  const { position, slivers } = view;

  const arrive = () => {
    inertUntil.current = Date.now() + INERT_MS;
  };
  const settle = (key: string) => {
    setSettled((held) => new Set(held).add(key));
    arrive();
  };
  const unsettle = (key: string) => {
    setSettled((held) => {
      const next = new Set(held);
      next.delete(key);
      return next;
    });
    arrive();
  };

  async function press(on: Card, action: Action): Promise<void> {
    if (Date.now() < inertUntil.current) return;
    if (action.keeps) {
      await action.run();
      return;
    }
    setFailed(null);
    settle(on.key);
    const outcome = await action.run().catch((): Outcome => "failed");
    if (outcome === "ok") return;
    if (outcome === "gone") {
      if (action.gone) toast.show(action.gone);
      return;
    }
    unsettle(on.key);
    setFailed({ key: on.key, label: action.label, line: action.failed ?? FAILED });
  }

  const later: Action = { label: "Tomorrow", run: () => putOff(card.key) };

  const { icon, kind, tone, title, why, actions, clock } = shape(card);

  function shape(one: Card): {
    icon: string;
    kind: string;
    tone: Tone;
    title: string;
    why: React.ReactNode;
    actions: Action[];
    clock: boolean;
  } {
    switch (one.kind) {
      case "zone": {
        const here = zoneCity(one.device);
        const clockCity = zoneCity(one.account);
        const write = (patch: { timeZone: string } | { keptTimeZone: string }) => async () => outcomeOf((await updateClock(patch)) !== null);
        return {
          icon: "compass",
          kind: "Time zone",
          tone: "danger",
          title: `This browser says ${here}`,
          why: `Showing times in ${clockCity}.`,
          actions: [
            { label: `Use ${here}`, run: write({ timeZone: one.device }), failed: "Couldn't save that." },
            { label: `Keep ${clockCity}`, run: write({ keptTimeZone: one.device }), failed: "Couldn't save that." },
          ],
          // Keep is 023's once-per-zone answer, so there is nothing to put off.
          clock: false,
        };
      }
      case "calendar":
        return {
          icon: "cloud-off",
          kind: "Calendar",
          tone: "danger",
          title: "Google Calendar stopped syncing",
          // The account first when there are two, then the way forward.
          why: one.email ? `${one.email}. Sign in again to see its events here.` : "Sign in again to see its events here.",
          actions: [{ label: "Reconnect", run: async () => "ok", href: connectUrl("settings") }],
          clock: true,
        };
      case "request":
        return {
          icon: "users",
          kind: waited(one.since, "Wants to connect"),
          tone: "attention",
          title: `${nameOf(one.person)} wants to connect`,
          why: null,
          actions: [
            { label: "Accept", run: () => answered(one.requestId, "accept"), gone: FAILED },
            { label: "Not now", run: () => answered(one.requestId, "dismiss"), gone: FAILED },
          ],
          clock: true,
        };
      case "invitation": {
        const first = firstNameOf(one.from);
        return {
          icon: "users",
          kind: waited(one.since, "Shared a thread"),
          tone: "attention",
          title: `${nameOf(one.from)} shared ${one.threadName}`,
          why: `${one.preview.count > 0 ? `${one.preview.count} in it. ` : ""}You can add to it, and you cannot delete anything of ${first}'s.`,
          actions: [
            {
              label: "Add it to my threads",
              run: async () => {
                const result = await acceptInvitation(one.memberId).catch(() => null);
                if (result === null) return "failed";
                if (result === "gone") return "gone";
                threads.reload();
                return "ok";
              },
              gone: FAILED,
            },
            // Out of Needs you for good; it stays on My threads' strip.
            { label: "Not now", run: () => putOff(one.key, true) },
          ],
          clock: true,
        };
      }
      case "question":
        return {
          icon: "message-circle",
          kind: one.fromEmail ? "About an email" : "offload asked",
          tone: "attention",
          title: one.question.text,
          why: one.threadId && one.threadName ? <ThreadPill id={one.threadId} name={one.threadName} icon={one.threadIcon ?? "lasso"} hue={one.threadHue ?? 1} size={24} /> : null,
          actions: typedOnly(one)
            ? [
                {
                  label: "Answer",
                  keeps: true,
                  run: async () => {
                    await typeAnswer(one);
                    return "ok";
                  },
                },
                { ...answer(one, one.question.options.findIndex((option) => option.kind === "plain")), label: "Dismiss" },
              ]
            : [],
          clock: true,
        };
      case "tip":
        return {
          icon: "mail",
          kind: "Tip",
          tone: "accent",
          title: "Forward emails to offload",
          why: `Send them to ${one.address} from ${one.from}.`,
          actions: [
            {
              label: "Copy address",
              keeps: true,
              run: async () => {
                // A browser that refuses the clipboard leaves the address in
                // the line to select, as the Mail block does.
                try {
                  await navigator.clipboard.writeText(one.address);
                  toast.show("Copied");
                  return "ok";
                } catch {
                  return "failed";
                }
              },
            },
            { label: "Got it", run: () => putOff(one.key, true) },
          ],
          clock: true,
        };
    }
  }

  /** 022's answer, and the dots that count what is waiting. */
  async function answered(requestId: string, which: "accept" | "dismiss"): Promise<Outcome> {
    const outcome = await answerRequestOutcome(requestId, which);
    if (outcome !== "failed") void refreshMe();
    return outcome;
  }

  /** 018's answer by option, with 018's words. A 404 or 409 is a question
   *  already closed, which goes with nothing to retry; a value that landed
   *  offers 018's Undo. */
  function answer(on: Extract<Card, { kind: "question" }>, index: number): Action {
    const option = on.question.options[index]!;
    return {
      label: option.label,
      // 018's own words on the web, as the conversation's chips say them.
      failed: "That did not go through.",
      gone: "That did not go through.",
      run: async () => {
        const { status, sent } = await answerQuestion(on.question.id, index);
        if (!sent) return status === 404 || status === 409 ? "gone" : "failed";
        if (option.kind === "value") {
          const place = { id: on.key, icon: "check", form: "slot" } as const;
          toast.show(
            on.threadName ? `${option.label}, for ${on.threadName}` : option.label,
            {
              label: "Undo",
              onPress: async () => {
                if (!(await undoTurn(sent.turnId).catch(() => false))) toast.show("Couldn't undo that", undefined, place);
              },
            },
            place,
          );
        }
        return "ok";
      },
    };
  }

  /** No option is a value: the conversation answers it by typing. */
  function typedOnly(on: Extract<Card, { kind: "question" }>): boolean {
    return on.question.options.every((option) => option.kind === "plain");
  }

  /** Answer, for a question only typing answers. Not a settle: the card stays
   *  until the typed answer closes the question, and goes now only if the
   *  question already closed somewhere else. */
  async function typeAnswer(on: Extract<Card, { kind: "question" }>): Promise<void> {
    if (Date.now() < inertUntil.current) return;
    setFailed(null);
    const outcome = await resumeQuestion(on.question.id);
    if (outcome === "ok") {
      window.dispatchEvent(new CustomEvent(RESUME_COMPOSER));
      return;
    }
    if (outcome === "gone") {
      settle(on.key);
      return;
    }
    setFailed({ key: on.key, label: "Answer", line: FAILED });
  }

  const failure = failed?.key === card.key ? failed : null;
  const labelOf = (action: Action) => (failure?.label === action.label ? "Try again" : action.label);

  const clockButton = clock ? (
    <button type="button" className={styles.later} aria-label="Tomorrow" title="Tomorrow" onClick={() => void press(card, later)}>
      <span className={styles.laterDisc}>
        <Icon name="clock" size={14} />
      </span>
    </button>
  ) : null;

  return (
    <>
    {answeredLines}
    <section className={styles.needs} aria-label="Needs you" data-slivers={slivers}>
      {slivers >= 2 ? <div className={`${styles.sliver} ${styles.sliverBack}`} aria-hidden="true" /> : null}
      {slivers >= 1 ? <div className={`${styles.sliver} ${styles.sliverFront}`} aria-hidden="true" /> : null}
      <article className={styles.card} key={card.key}>
        <div className={styles.kind} data-tone={tone}>
          <Icon name={icon} size={14} />
          <span className={styles.kindName}>{kind}</span>
          <span className={styles.kindCount}>
            {position} of {view.total}
          </span>
        </div>
        <p className={styles.cardTitle} data-alone={why ? undefined : true}>
          {title}
        </p>
        {why ? <p className={styles.cardWhy}>{why}</p> : null}
        {failure ? (
          <p className={styles.cardFailed} role="alert">
            {failure.line}
          </p>
        ) : null}
        {card.kind === "question" && !typedOnly(card) ? (
          <div className={styles.cardReplies}>
            <QuickReplies
              options={card.question.options}
              label={card.question.text}
              onPick={(index) => void press(card, answer(card, index))}
              trailing={clockButton}
            />
          </div>
        ) : (
          <div className={styles.cardActions}>
            {actions.map((action, index) =>
              action.href ? (
                <a key={action.label} href={action.href} className={styles.act} data-filled={index === 0 || undefined}>
                  <span className={styles.actPill}>{action.label}</span>
                </a>
              ) : (
                <button
                  key={action.label}
                  type="button"
                  className={styles.act}
                  data-filled={index === 0 || undefined}
                  onClick={() => void press(card, action)}
                >
                  <span className={styles.actPill}>{labelOf(action)}</span>
                </button>
              ),
            )}
            {clockButton}
          </div>
        )}
      </article>
    </section>
    </>
  );
}
