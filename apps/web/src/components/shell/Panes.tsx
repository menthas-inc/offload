"use client";

// The pane row and the crumb trail above it.
//
// Two panes on screen. The stack is not accumulated, it is **derived from the
// route**, and each page states its own: `/threads/:id` is My threads beside
// that thread, `/content/:id` is its thread beside that piece. That makes every
// pane linkable, which is what sharing a thread and what offload pointing at
// where it filed something both need, and it means there is no stack to get out
// of step with the URL.

import { createContext } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "../Icon";
import { ThreadIcon } from "../ThreadIcon";
import { FULL } from "./PaneHead";
import styles from "../../app/(shell)/shell.module.css";

export interface Crumb {
  label: string;
  href: string;
  /** Lucide slug. The kit draws a crumb as a chip with its own glyph, so a
   *  trail reads as places rather than as a path. */
  icon?: string;
  /** 037. A crumb that is a particular thread wears its icon in place of a
   *  glyph. */
  thread?: { id: string; icon: string; hue: number };
}

interface Props {
  crumbs: Crumb[];
  /** Left to right. The last is the top pane and gets the remaining width; the
   *  one before it is fixed, which is what makes a third push the first out
   *  rather than squeezing all three. */
  panes: React.ReactNode[];
  /** 027. What the crumb bar holds at its right: Today's date. */
  aside?: React.ReactNode;
  /** 027. Every pane, whichever way you came: Customize Today is opened from
   *  the pane beside it, not walked into. */
  together?: boolean;
}

/** Where a navigation came from.
 *
 *  **The stack is not purely route-derived any more, and that is deliberate.**
 *  Opening `/threads/:id` cold shows that thread alone: a link somebody sends
 *  should open the thing it names, not the thing plus a list. Two panes are
 *  what you get by walking from one screen into another, which is a fact about
 *  the journey rather than about the destination, so the journey carries it.
 *
 *  A query rather than router state, so a reload keeps the view you were
 *  looking at rather than collapsing it under you. */
export const FROM = "from";

/** 030. Whether a pane is the top one. A thread behind another pane draws no
 *  map and no switch, since it is 520px of context for the pane beside it. */
export const PaneTop = createContext(true);

export function Panes({ crumbs, panes, aside, together = false }: Props) {
  const search = useSearchParams();
  const full = search.get(FULL) === "1";
  const arrived = search.get(FROM) !== null;

  const back = crumbs.length > 1 ? crumbs[crumbs.length - 2]! : null;

  // One pane unless you walked here, and one pane when you asked for full.
  // The trail stays in both cases: it is what says where this sits, and losing
  // it would make a direct link a dead end.
  const shown = together ? panes : full || !arrived ? panes.slice(-1) : panes;
  const offset = panes.length - shown.length;

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
                {crumb.thread ? (
                  <ThreadIcon icon={crumb.thread.icon} hue={crumb.thread.hue} seed={crumb.thread.id} size={18} round />
                ) : crumb.icon ? (
                  <Icon name={crumb.icon} size={13} />
                ) : null}
                {crumb.label}
              </Link>
            </span>
          ))}
        </span>

        {aside ? <span className={styles.crumbTools}>{aside}</span> : null}
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
              <PaneTop.Provider value={top}>{pane}</PaneTop.Provider>
            </div>
          );
        })}
      </div>
    </>
  );
}
