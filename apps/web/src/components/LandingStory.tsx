"use client";

// The landing page's story: four steps in one panel, held in place over the
// atmosphere while the window scrolls past (handoff/APPLY-2026-10-04-landing.md).
//
// **Every word is in the markup the server sends.** Google's OAuth review
// reads this page signed out, and so does a crawler and a screen reader. A step
// out of view is opacity 0 and takes no pointer, nothing more: never
// `display: none`, never `aria-hidden`, never rendered on scroll.
//
// **Without JavaScript it is four sections in a column.** The pinned layout is
// six windows of empty scroll unless something is driving it, so the stylesheet
// draws the plain column and this file switches the choreography on by setting
// `data-live` once it is running.
//
// The drawings are decoration: a thread, a card, a calendar, made of the
// product's own parts. They are hidden from a screen reader, which would read
// them as a list of somebody else's notes.

import { useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { ThreadIcon } from "./ThreadIcon";
import styles from "./landing-story.module.css";

const STEPS = [
  {
    kicker: "What it is",
    heading: "Send it. offload files it.",
    body: "offload is a place to put down what is on your mind: notes, links, photos and voice notes. It reads each one and files it into a thread, one for each thing you are keeping track of.",
  },
  {
    kicker: "Getting things in",
    heading: "Send it as is",
    body: "Type it, say it, snap it, or forward it.",
  },
  {
    kicker: "Threads",
    heading: "Everything lands in threads",
    body: "Related things gather in one thread. Share it, and plan it with the people in it.",
  },
  {
    kicker: "Google Calendar",
    heading: "Works with your Google Calendar",
    body: "Connect your Google Calendar and offload can show what is on it and add or change events when you ask.",
  },
] as const;

/** The two threads the drawings file into, with the glyphs the product itself
 *  picks from those names (`THREAD_ICONS` in @offload/widgets). The kit drew
 *  lasso and bookmark; bookmark is not one of the seventy. The seeds only
 *  place the wash. */
const LISBON = { icon: "luggage", name: "Lisbon trip", hue: 1, seed: "00000000-0000-0000-0000-00004c697362" };
const SHELF = { icon: "hammer", name: "Bookshelf build", hue: 5, seed: "00000000-0000-0000-0000-00005368656c" };

const DUMPS = ["Ana can only travel the 14th to the 17th", "matte black, 30cm", "€214 for the flights", "4 more shelf brackets"];
const BARS = [6, 14, 22, 12, 26, 18, 9, 20, 28, 14, 8, 16, 22, 10];
const FACES = ["JM", "AD", "TR"];

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Step j holds across [j, j+1] with a 0.1 crossfade at each edge. The first
 *  is already full at the start and the last holds to the end. */
function visible(pos: number, j: number): number {
  if (j === 0 && pos < 0.5) return 1;
  if (j === STEPS.length - 1 && pos > j + 0.5) return 1;
  return clamp(1 - Math.max(0, Math.abs(pos - (j + 0.5)) - 0.4) / 0.1);
}

function ThreadRow({ thread, count }: { thread: typeof LISBON; count: number }) {
  return (
    <div className={styles.threadRow} data-part>
      <ThreadIcon icon={thread.icon} hue={thread.hue} seed={thread.seed} size={40} />
      <span className={styles.grow}>{thread.name}</span>
      <span className={styles.count}>{count}</span>
    </div>
  );
}

function Filing() {
  return (
    <div className={styles.filing}>
      <div className={styles.bubbles}>
        {DUMPS.map((dump) => (
          <span key={dump} className={styles.bubble} data-part>
            {dump}
          </span>
        ))}
      </div>
      <span className={styles.falls} />
      <ThreadRow thread={LISBON} count={4} />
      <ThreadRow thread={SHELF} count={3} />
    </div>
  );
}

function Ways() {
  return (
    <div className={styles.ways}>
      <div className={styles.way} data-part>
        <span className={styles.wayLabel}>
          <Icon name="type" size={14} />
          Typed
        </span>
        <span className={`${styles.mine} ${styles.mineStart}`}>4 more shelf brackets</span>
      </div>
      <div className={styles.way} data-part>
        <span className={styles.wayLabel}>
          <Icon name="mic" size={14} />
          Said
        </span>
        <span className={styles.bars}>
          {BARS.map((bar, index) => (
            <i key={index} style={{ blockSize: bar }} />
          ))}
        </span>
        <span className={styles.strong}>“Remind me to call the landlord”</span>
      </div>
      <div className={styles.way} data-part>
        <span className={styles.wayLabel}>
          <Icon name="camera" size={14} />
          Snapped
        </span>
        <span className={styles.photo}>
          <Icon name="image" size={18} />
        </span>
      </div>
      <div className={styles.way} data-part>
        <span className={styles.wayLabel}>
          <Icon name="mail" size={14} />
          Forwarded
        </span>
        <span className={styles.strong}>Your booking at Alfama Flats</span>
        <span className={styles.quiet}>Confirmed for 14 to 17 October, two guests.</span>
      </div>
    </div>
  );
}

function Thread() {
  const rows = [
    ["calendar", "Alfama flat, 14 to 17 Oct"],
    ["plane", "€214 for the flights"],
    ["type", "Ana can only travel the 14th to the 17th"],
    ["link", "Tram 28 timetable"],
  ] as const;
  return (
    <div className={styles.thread}>
      <div className={styles.threadHead}>
        <ThreadIcon icon={LISBON.icon} hue={LISBON.hue} seed={LISBON.seed} size={40} />
        <span className={styles.grow}>{LISBON.name}</span>
        <span className={styles.faces}>
          {FACES.map((face, index) => (
            <span key={face} className={styles.face} data-face={index + 1}>
              {face}
            </span>
          ))}
        </span>
      </div>
      {rows.map(([icon, text]) => (
        <div key={text} className={styles.threadLine} data-part>
          <Icon name={icon} size={18} className={styles.lineIcon} />
          <span className={styles.grow}>{text}</span>
        </div>
      ))}
    </div>
  );
}

function Calendar() {
  return (
    <div className={styles.calendar}>
      <span className={styles.mine} data-part>
        Put the flights on my calendar
      </span>
      <p className={styles.reply} data-part>
        Added <span className={styles.strong}>Flights to Lisbon</span> to your calendar for Tuesday 14 October at 07:40.
      </p>
      <div className={styles.agenda} data-part>
        <div className={styles.agendaHead}>
          <Icon name="calendar" size={16} />
          <span className={styles.grow}>Tuesday 14 October</span>
          <span className={styles.agendaSource}>Google Calendar</span>
        </div>
        <div className={`${styles.agendaRow} ${styles.agendaNew}`}>
          <span className={styles.time}>07:40</span>
          <span className={styles.grow}>Flights to Lisbon</span>
          <Icon name="check" size={16} className={styles.added} />
        </div>
        <div className={styles.agendaRow}>
          <span className={styles.time}>15:00</span>
          <span className={styles.grow}>Check in, Alfama flat</span>
        </div>
        <div className={`${styles.agendaRow} ${styles.agendaThird}`}>
          <span className={styles.time}>20:30</span>
          <span className={styles.grow}>Dinner with Ana</span>
        </div>
      </div>
    </div>
  );
}

const DRAWINGS = [Filing, Ways, Thread, Calendar];

export function LandingStory() {
  const storyRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const story = storyRef.current;
    const pin = story?.querySelector<HTMLElement>("[data-pin]");
    const panel = story?.querySelector<HTMLElement>("[data-panel]");
    if (!story || !pin || !panel) return;

    // Reduced motion keeps the panel and swaps its steps by opacity alone.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const steps = [...story.querySelectorAll<HTMLElement>("[data-step]")].map((el) => ({
      el,
      words: el.querySelector<HTMLElement>("[data-words]"),
      parts: [...el.querySelectorAll<HTMLElement>("[data-part]")],
    }));

    story.setAttribute("data-live", "");

    let frame = 0;
    let band = 0;
    let length = 1;
    const measure = () => {
      band = parseFloat(getComputedStyle(pin).top) || 0;
      length = story.offsetHeight;
    };

    /** Where the story's travel starts, and how long it is, in px of scroll. */
    const travel = () => {
      const height = window.innerHeight || 1;
      const from = height * 0.95;
      return { from, span: Math.max(1, length - height + band - from) };
    };

    const write = () => {
      frame = 0;
      const y = window.scrollY;
      const k = clamp(y / (window.innerHeight || 1));
      const { from, span } = travel();
      const pos = clamp((y - from) / span) * STEPS.length;

      const arrived = smooth(clamp((k - 0.55) / 0.4));
      const left = smooth(clamp((pos - 3.82) / 0.18));
      const shown = arrived * (1 - left);
      panel.style.opacity = shown.toFixed(3);
      panel.style.transform = reduced ? "" : `scale(${(0.95 + 0.05 * shown).toFixed(4)})`;
      panel.style.pointerEvents = shown > 0.5 ? "" : "none";

      steps.forEach((step, j) => {
        const o = visible(pos, j);
        step.el.style.opacity = o.toFixed(3);
        step.el.style.pointerEvents = o > 0.5 ? "" : "none";
        if (reduced) return;

        // The outgoing words move with the scroll and blur as they go.
        if (step.words) {
          const direction = pos < j + 0.5 ? 1 : -1;
          step.words.style.transform = `translateY(${((1 - o) * direction * 22).toFixed(1)}px)`;
          step.words.style.filter = o < 1 ? `blur(${((1 - o) * 10).toFixed(1)}px)` : "";
        }
        // The drawing assembles over the first 60% of its step.
        const u = j === 0 ? Math.max(arrived, clamp(pos / 0.6)) : clamp((pos - j + 0.1) / 0.6);
        step.parts.forEach((part, index) => {
          const e = smooth(clamp(u * 1.6 - index * 0.12));
          part.style.opacity = e.toFixed(3);
          part.style.transform = `translateY(${((1 - e) * 18).toFixed(1)}px) scale(${(0.97 + 0.03 * e).toFixed(3)})`;
        });
      });
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(write);
    };
    const onResize = () => {
      measure();
      wake();
    };

    // A link inside a step that is not showing can still take focus from the
    // keyboard. Bring its step in, or the focus ring is on nothing.
    const onFocus = (event: FocusEvent) => {
      const index = steps.findIndex((step) => step.el.contains(event.target as Node));
      if (index < 0 || Number(steps[index]!.el.style.opacity) > 0.5) return;
      const { from, span } = travel();
      window.scrollTo({ top: from + ((index + 0.5) / STEPS.length) * span });
    };

    measure();
    write();
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", onResize);
    story.addEventListener("focusin", onFocus);
    return () => {
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", onResize);
      story.removeEventListener("focusin", onFocus);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section ref={storyRef} className={styles.story} data-landing-story>
      <div className={styles.pin} data-pin>
        <div className={styles.panel} data-panel>
          <div className={styles.steps}>
            {STEPS.map((step, index) => {
              const Drawing = DRAWINGS[index]!;
              return (
                <div key={step.kicker} className={styles.step} data-step={index + 1}>
                  <div className={styles.words} data-words>
                    <p className={styles.kicker}>
                      <span className={styles.number}>0{index + 1}</span>
                      <span>{step.kicker}</span>
                    </p>
                    <h2 className={styles.heading}>{step.heading}</h2>
                    <p className={styles.body}>{step.body}</p>
                    {index === 3 ? (
                      <p className={styles.fine}>
                        You select which calendars offload may use, and you can disconnect in Settings at any time.{" "}
                        <a href="/privacy">How offload handles your calendar</a>
                      </p>
                    ) : null}
                  </div>
                  <div className={styles.drawing} data-drawing aria-hidden="true">
                    <Drawing />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
