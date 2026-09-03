"use client";

// The pane row and the crumb trail above it.
//
// Two panes on screen. The stack is not accumulated, it is **derived from the
// route**, and each page states its own: `/threads/:id` is My threads beside
// that thread, `/content/:id` is its thread beside that piece. That makes every
// pane linkable, which is what sharing a thread and what offload pointing at
// where it filed something both need, and it also means there is no stack to
// get out of step with the URL.

import Link from "next/link";
import styles from "../../app/(shell)/shell.module.css";

export interface Crumb {
  label: string;
  href: string;
}

interface Props {
  crumbs: Crumb[];
  /** Left to right. The last is the top pane and gets the remaining width; the
   *  one before it is fixed, which is what makes a third push the first out
   *  rather than squeezing all three. */
  panes: React.ReactNode[];
}

export function Panes({ crumbs, panes }: Props) {
  const back = crumbs.length > 1 ? crumbs[crumbs.length - 2]! : null;

  return (
    <>
      <div className={styles.crumbs}>
        {/* Both render and the stylesheet picks one. Measuring the window in
            JavaScript would put the breakpoint in two places, and the design
            system has no breakpoint token to hold it in one. */}
        {back ? (
          <Link href={back.href} className={styles.crumbBack}>
            ‹ {back.label}
          </Link>
        ) : null}

        <span className={styles.crumbTrail}>
          {crumbs.map((crumb, index) => (
            <span key={crumb.href}>
              {index > 0 ? <span className={styles.crumbSep}> / </span> : null}
              <Link href={crumb.href} className={styles.crumb}>
                {crumb.label}
              </Link>
            </span>
          ))}
        </span>
      </div>

      <div className={styles.paneRow}>
        {panes.map((pane, index) => (
          <div
            key={crumbs[index]?.href ?? index}
            className={`${styles.pane} ${index < panes.length - 1 ? styles.paneLeft : ""}`}
          >
            {pane}
          </div>
        ))}
      </div>
    </>
  );
}
