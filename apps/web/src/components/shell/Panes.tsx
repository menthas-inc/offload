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
import { Icon } from "../Icon";
import styles from "../../app/(shell)/shell.module.css";

export interface Crumb {
  label: string;
  href: string;
  /** Lucide slug. The kit draws a crumb as a chip with its own glyph, so a
   *  trail reads as places rather than as a path. */
  icon?: string;
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
            <Icon name="chevron-left" size={14} />
            {back.label}
          </Link>
        ) : null}

        <span className={styles.crumbTrail}>
          {crumbs.map((crumb, index) => (
            <span key={crumb.href} className={styles.crumbItem}>
              {index > 0 ? (
                <Icon name="chevron-right" size={13} className={styles.crumbSep} />
              ) : null}
              <Link
                href={crumb.href}
                className={styles.crumb}
                data-on={index === crumbs.length - 1}
              >
                {crumb.icon ? <Icon name={crumb.icon} size={13} /> : null}
                {crumb.label}
              </Link>
            </span>
          ))}
        </span>

        {/* Closing the rightmost pane, which the kit puts at the far end of the
            trail. Only when there is one to close. */}
        {back ? (
          <Link href={back.href} className={styles.closePane}>
            <Icon name="x" size={14} />
            Close pane
          </Link>
        ) : null}
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
