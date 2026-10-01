"use client";

// One piece of content, as its own pane. From ui_kits/web_app/WThing.jsx's
// WTask: "anything inside a thread opens as its own pane, so a task is a place
// too."
//
// The kit's second section is "Where this came from", which is the whole reason
// this pane exists: provenance is a foreign key, and being able to see the dump
// something was derived from is what makes a wrong filing explicable rather than
// mysterious.
//
// **It never names a thread this content used to be in.** Content that moved
// carries no history, and there is no column that could: a former thread's name
// belongs to its members, and showing it to the destination's members would
// leak it to people who were never there.

import Link from "next/link";
import { Icon } from "../Icon";
import { PaneHead } from "../shell/PaneHead";
import { PhotoThumb } from "../shell/PhotoThumb";
import styles from "../../app/(shell)/shell.module.css";
import type { ContentDetail as Detail } from "../../lib/threads";

interface Props {
  detail: Detail;
  /** Ticking from here, when this is a task. The pane is a place, so the
   *  action that belongs to the thing belongs on it. */
  onToggle?: (() => void) | undefined;
}

export function ContentDetail({ detail, onToggle }: Props) {
  const done = detail.doneAt !== null;

  return (
    <>
      <PaneHead
        title={detail.title}
        sub={
          <>
            {detail.author.isYou ? "you" : detail.author.displayName} ·{" "}
            {new Date(detail.createdAt).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            {detail.archivedAt ? " · archived" : ""}
            {done ? " · done" : ""}
          </>
        }
        fullHref={`/content/${detail.id}`}
        tools={
          detail.type === "task" && onToggle ? (
            <button
              type="button"
              className={styles.tool}
              aria-label={done ? "Put it back on the list" : "Mark done"}
              title={done ? "Put it back on the list" : "Mark done"}
              onClick={onToggle}
            >
              <Icon name={done ? "rewind" : "check"} size={16} />
            </button>
          ) : null
        }
      />

      <div className={styles.paneBody}>
        {/* 028. Not in a thread is a state, and the chip says so and opens the
            list rather than naming the default thread. */}
        {detail.threadName === null ? (
          <Link href="/threads/loose" className={styles.chip}>
            Not in a thread
          </Link>
        ) : (
          <Link href={`/threads/${detail.threadId}`} className={styles.chip}>
            ◦ {detail.threadName}
          </Link>
        )}

        {/* 020. A photo row opened as a row: the picture, then what offload
            wrote about it. The large rendition, since the pane is wide. */}
        {detail.photo ? (
          <PhotoThumb
            blobId={detail.photo.blobId}
            ready={detail.photo.ready}
            rendition="large"
            alt={detail.body ?? detail.title}
            className={styles.detailPicture}
            fallback={
              <span className={styles.detailPictureEmpty} aria-hidden="true">
                <Icon name="image" size={28} />
              </span>
            }
          />
        ) : null}

        {/* 2026-09-29. No details section: offload is for short things. */}
        <h2 className={styles.section}>Where this came from</h2>
        {detail.from ? (
          <>
            <p className={styles.provenance}>{detail.from.text}</p>
            <p className={styles.wrote}>
              you dumped this on{" "}
              {new Date(detail.from.at).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </>
        ) : (
          <p className={styles.empty}>
            offload has no record of where this came from. That happens to
            anything filed before it started keeping one.
          </p>
        )}
      </div>
    </>
  );
}
