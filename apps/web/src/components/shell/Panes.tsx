"use client";

// The pane row and the crumb trail above it.
//
// Two panes on screen. The stack is not accumulated, it is **derived from the
// route**, and each page states its own: `/threads/:id` is My threads beside
// that thread, `/content/:id` is its thread beside that piece. That makes every
// pane linkable, which is what sharing a thread and what offload pointing at
// where it filed something both need, and it means there is no stack to get out
// of step with the URL.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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

/** The query that means "just this one, full width".
 *
 *  A query rather than a route, because full is a way of looking at a pane and
 *  not a different place: the URL still points at the same thread, so the link
 *  somebody sends still opens the thread, and the crumbs still say where it
 *  sits. */
export const FULL = "full";

export function Panes({ crumbs, panes }: Props) {
  const pathname = usePathname();
  const search = useSearchParams();
  const full = search.get(FULL) === "1";

  const back = crumbs.length > 1 ? crumbs[crumbs.length - 2]! : null;
  // Full shows the top pane alone. The trail stays: it is what says where this
  // is, and losing it would make full a dead end.
  const shown = full ? panes.slice(-1) : panes;
  const offset = panes.length - shown.length;

  const query = new URLSearchParams(search.toString());
  if (full) query.delete(FULL);
  else query.set(FULL, "1");
  const toggle = `${pathname}${query.toString() ? `?${query.toString()}` : ""}`;

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

        <span className={styles.crumbTools}>
          {panes.length > 1 || full ? (
            <Link
              href={toggle}
              className={styles.tool}
              aria-label={full ? "Show the pane beside this" : "Open full"}
              title={full ? "Back to two panes" : "Open full"}
            >
              <Icon name={full ? "chevron-left" : "maximize-2"} size={15} />
            </Link>
          ) : null}

          {back && !full ? (
            <Link href={back.href} className={styles.closePane}>
              <Icon name="x" size={14} />
              Close pane
            </Link>
          ) : null}
        </span>
      </div>

      <div className={styles.paneRow}>
        {shown.map((pane, index) => {
          const depth = offset + index;
          const top = index === shown.length - 1;
          return (
            <div
              key={crumbs[depth]?.href ?? depth}
              // Depth decides the paper: even is the page, odd is raised, which
              // is the kit's `paperAt`. A single pane is therefore the same
              // colour as the shell it sits in.
              data-depth={depth % 2 === 0 ? 0 : 1}
              // The seam goes on the pane that arrived, not the one that was
              // already there.
              data-edge={index > 0}
              className={[
                styles.pane,
                top ? "" : styles.paneLeft,
                // Both panes move. Animating only the arriving one made the
                // other snap from full width to 520px in a frame, which reads
                // as a jump rather than a reveal.
                top ? styles.paneTop : styles.paneShift,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {pane}
            </div>
          );
        })}
      </div>
    </>
  );
}
