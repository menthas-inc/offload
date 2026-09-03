"use client";

// My threads. From ui_kits/web_app/WApp.jsx's WThings.
//
// Three groups, and only one of them is stored: `always_on` is a column, and
// "older" is derived from activity, because a thread does not become old, it
// stops being used. The server derives it so all three clients agree.

import Link from "next/link";
import styles from "../../app/(shell)/shell.module.css";
import type { ThreadGroup } from "../../lib/threads";

const HEADINGS: Record<string, string> = {
  now: "For now",
  always: "Always on",
  older: "Older threads",
};

interface Props {
  groups: ThreadGroup[];
  loading: boolean;
}

export function MyThreads({ groups, loading }: Props) {
  const total = groups.reduce((n, group) => n + group.threads.length, 0);
  const live = groups.find((group) => group.key === "now")?.threads.length ?? 0;

  return (
    <>
      <div className={styles.paneHead}>
        <div>
          <h1 className={`${styles.paneTitle} ${styles.paneTitleBig}`}>My threads</h1>
          {loading ? null : (
            <p className={styles.paneSub}>
              {total} in here, {live} live
            </p>
          )}
        </div>
      </div>

      <div className={styles.paneBody}>
        {loading ? null : total === 0 ? (
          // An invitation, not a zero. The kit's own line, and it is true:
          // nobody makes a thread, they appear once enough has landed in one
          // place to be one.
          <p className={styles.empty}>
            Threads appear here on their own, once there is enough in one place
            to be one. Dump something on Today and offload will start filing.
          </p>
        ) : (
          groups.map((group) =>
            group.threads.length === 0 ? null : (
              <section key={group.key}>
                <h2 className={styles.section}>
                  {HEADINGS[group.key]}
                  <em className={styles.sectionCount}>{group.threads.length}</em>
                </h2>
                {group.threads.map((thread) => (
                  <Link
                    key={thread.id}
                    href={`/threads/${thread.id}`}
                    className={styles.row}
                  >
                    <span className={styles.rowIcon} aria-hidden="true">
                      ◦
                    </span>
                    <span className={styles.rowText}>
                      <span className={styles.rowTitle}>{thread.name}</span>
                      <span className={styles.rowMeta}>{thread.meta}</span>
                    </span>
                    <span className={styles.rowCount}>{thread.count}</span>
                  </Link>
                ))}
              </section>
            )
          )
        )}
      </div>
    </>
  );
}
