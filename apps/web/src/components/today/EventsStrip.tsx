"use client";

// 027 The next line and Where you will be.
//
// The next line is the person's own next timed event and its countdown, in
// the attention colour, computed here from the day already read. The strip is
// the day's events as 128px cards in a row that scrolls sideways past the
// gutter with no scrollbar. Each card is what it opens: a calendar's event
// with Google's own link is an anchor to it in a new tab, one with no link yet
// is not a control at all, and an offload event is a link to its thread.
// Nothing here edits an event.

import { firstNameOf } from "../../lib/people";
import Link from "next/link";
import { eventPast, eventRange } from "@offload/widgets";
import { ThreadPill } from "../shell/ThreadPill";
import { calendarHref, type TodayEvent } from "../../lib/today";
import styles from "../../app/(shell)/today.module.css";

export function NextLine({ title, tail }: { title: string; tail: string }) {
  return (
    <p className={styles.nextLine} data-next-line>
      {title}
      <span className={styles.nextTail}>{tail}</span>
    </p>
  );
}

function EventCard({ event, next, now, zone }: { event: TodayEvent; next: boolean; now: Date; zone: string | null }) {
  const past = eventPast(event, now);
  const body = (
    <>
      <span className={styles.eventWhen}>{eventRange(event, zone)}</span>
      <span className={styles.eventTitle}>{event.title}</span>
      {event.source === "offload" && event.threadId && event.threadName ? (
        <>
          {event.authorName ? <span className={styles.eventWhose}>{firstNameOf({ displayName: event.authorName })}&apos;s</span> : null}
          <span className={styles.eventPill}>
            <ThreadPill id={event.threadId} name={event.threadName} icon={event.threadIcon ?? "lasso"} hue={event.threadHue ?? 1} size={24} still />
          </span>
        </>
      ) : event.calendarName ? (
        <span className={styles.eventCalendar}>{event.calendarName}</span>
      ) : null}
    </>
  );
  const marks = {
    className: styles.event,
    "data-event": true,
    "data-past": past ? "true" : undefined,
    "data-next": next ? "true" : undefined,
  } as const;

  if (event.source === "offload" && event.threadId) {
    return (
      <Link href={`/threads/${event.threadId}`} {...marks}>
        {body}
      </Link>
    );
  }
  const href = calendarHref(event.link);
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" {...marks}>
        {body}
      </a>
    );
  }
  return <div {...marks}>{body}</div>;
}

export function EventsStrip({
  events,
  count,
  nextId,
  now,
  zone,
}: {
  events: TodayEvent[];
  count: number;
  nextId: string | null;
  now: Date;
  zone: string | null;
}) {
  return (
    <section className={styles.daySection}>
      <h3 className={styles.head}>
        Where you will be <em className={styles.headCount}>{count}</em>
      </h3>
      {/* A scrolling region the keyboard can reach even when no card in it is
          a control. */}
      <div className={styles.strip} tabIndex={0} role="group" aria-label="Where you will be">
        {events.map((event) => (
          <EventCard key={event.id} event={event} next={event.id === nextId} now={now} zone={zone} />
        ))}
      </div>
    </section>
  );
}
