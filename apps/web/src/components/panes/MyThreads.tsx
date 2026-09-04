"use client";

// My threads. From ui_kits/web_app/WApp.jsx's WThings.
//
// Three groups, and only one of them is stored: `always_on` is a column, and
// "older" is derived from activity, because a thread does not become old, it
// stops being used. The server derives it so all three clients agree.

import Link from "next/link";
import { Icon } from "../Icon";
import { QuietEmpty } from "./QuietEmpty";
import { threadIcon } from "../shell/Sidebar";
import styles from "../../app/(shell)/shell.module.css";
import type { ThreadGroup } from "../../lib/threads";

const HEADINGS: Record<string, string> = {
  now: "For now",
  always: "Always on",
  older: "Older threads",
};

/** Which group gets which badge, and it is not a free choice: `WThings` gives
 *  "Always on" the accent and leaves "Older threads" on the default, so the
 *  solid blue lands on the group that is finished rather than the one that
 *  never closes. Written down because it reads backwards until you see it on
 *  screen. */
const TONE: Record<string, "solid" | "accent"> = {
  now: "solid",
  always: "accent",
  older: "solid",
};

interface Props {
  groups: ThreadGroup[];
  loading: boolean;
}

export function MyThreads({ groups, loading }: Props) {
  const total = groups.reduce((n, group) => n + group.threads.length, 0);
  const live = groups.find((group) => group.key === "now")?.threads.length ?? 0;

  if (!loading && total === 0) {
    // The kit's own line. True, and worth saying rather than showing a zero:
    // nobody makes a thread, they appear once enough has landed in one place
    // to be one.
    return (
      <QuietEmpty
        title="My threads"
        line="Threads appear here on their own, once there is enough in one place to be one."
      />
    );
  }

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
        {loading ? null : (
          groups.map((group) =>
            group.threads.length === 0 ? null : (
              <section key={group.key}>
                {/* The first group has no heading. The kit omits it, and it is
                    right: the page title already says My threads, and a
                    heading directly under it that says something else is a
                    label for a list nobody was confused about. */}
                {group.key === "now" ? null : (
                  <h2 className={styles.section}>
                    {HEADINGS[group.key]}
                    <em
                      className={styles.sectionCount}
                      data-tone={TONE[group.key]}
                    >
                      {group.threads.length}
                    </em>
                  </h2>
                )}
                {group.threads.map((thread) => (
                  <Link
                    key={thread.id}
                    // Says where this came from, which is what opens it beside the
                    // list rather than on its own. A link somebody sends carries
                    // no `from`, so it opens the thread alone.
                    href={`/threads/${thread.id}?from=threads`}
                    className={styles.row}
                  >
                    <span className={styles.rowIcon}>
                      <Icon name={threadIcon(thread.icon)} size={18} />
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
          ))}
      </div>
    </>
  );
}
