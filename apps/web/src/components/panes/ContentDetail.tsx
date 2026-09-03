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

import styles from "../../app/(app)/shell.module.css";
import type { Open } from "../shell/Shell";
import type { ContentDetail as Detail } from "../../lib/threads";

interface Props {
  detail: Detail;
  open: Open;
}

export function ContentDetail({ detail, open }: Props) {
  return (
    <>
      <div className={styles.paneHead}>
        <div style={{ minWidth: 0 }}>
          <h1 className={styles.paneTitle}>{detail.title}</h1>
          <p className={styles.paneSub}>
            {detail.author.isYou ? "you" : detail.author.displayName} ·{" "}
            {new Date(detail.createdAt).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            {detail.archivedAt ? " · archived" : ""}
          </p>
        </div>
      </div>

      <div className={styles.paneBody}>
        <button
          type="button"
          className={styles.chip}
          onClick={() => open({ kind: "thread", id: detail.threadId, name: detail.threadName })}
        >
          ◦ {detail.threadName}
        </button>

        {detail.body ? (
          <>
            <h2 className={styles.section}>Note</h2>
            <p className={styles.standing}>{detail.body}</p>
          </>
        ) : null}

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
