"use client";

// A pane's own head: title, subtitle, whoever is in it, and its tools.
//
// From `W.jsx`'s `WPaneHead`, whose signature is the thing to read rather than
// infer: `{title, sub, tools, aside, big, wide}`. `aside` is the faces and the
// share control; `tools` is a list of quiet icon buttons at the end, and in
// `WThing.jsx` that list is `[["maximize-2","Open full"],["ellipsis","More"]]`.
//
// **Open full belongs here**, beside More, not in the crumb bar. It is a thing
// you do to this pane, so it sits on the pane, next to the other things you do
// to it. Putting it in the trail made it read as navigation.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "../Icon";
import styles from "../../app/(shell)/shell.module.css";

export const FULL = "full";

/** Whether this pane is being shown on its own. */
export function useFull(): boolean {
  return useSearchParams().get(FULL) === "1";
}

interface Props {
  /** Absent on Today, whose stepper names the day. */
  title?: React.ReactNode;
  sub?: React.ReactNode;
  big?: boolean;
  /** Faces, share: whatever belongs to the thing rather than to the pane. */
  aside?: React.ReactNode;
  /** Extra quiet tools, before Open full. Up to two, and they have a
   *  criterion (design log, 17 September 2026): a tool earns a head slot only
   *  if it changes what offload reads or shows. The thread's calendars, and
   *  its labels' way in while it has none (29 September); anything that acts
   *  on the thread goes in More. */
  tools?: React.ReactNode;
  /** What the More menu holds. Open full, then `ellipsis`, and everything a
   *  pane gains after that goes in here rather than growing the head every
   *  time a thread learns to do something else. */
  more?: MoreAction[];
  /** 037. What stands before the title: a thread's icon, and the popover it
   *  opens, which hangs under it. */
  lead?: React.ReactNode;
  /** Where Open full returns to. Omitted on a pane that cannot be full. */
  fullHref?: string | undefined;
}

export interface MoreAction {
  label: string;
  icon: string;
  onSelect: () => void;
}

export function PaneHead({ title, sub, big, lead, aside, tools, more, fullHref }: Props) {
  const search = useSearchParams();
  const full = search.get(FULL) === "1";

  const query = new URLSearchParams(search.toString());
  if (full) query.delete(FULL);
  else query.set(FULL, "1");

  const toggle =
    fullHref === undefined
      ? null
      : `${fullHref}${query.toString() ? `?${query.toString()}` : ""}`;

  return (
    <div className={styles.paneHead}>
      {lead ? <span className={styles.paneLead}>{lead}</span> : null}
      <div style={{ minWidth: 0, flex: 1 }}>
        {title !== undefined ? <h1 className={`${styles.paneTitle} ${big ? styles.paneTitleBig : ""}`}>{title}</h1> : null}
        {sub ? <p className={styles.paneSub}>{sub}</p> : null}
      </div>

      {aside ? <span className={styles.paneAside}>{aside}</span> : null}

      <span className={styles.paneTools}>
        {tools}
        {toggle ? (
          <Link
            href={toggle}
            className={styles.tool}
            aria-label={full ? "Show the pane beside this" : "Open full"}
            title={full ? "Back to two panes" : "Open full"}
          >
            {/* The same glyph both ways. The design system vendors no `minimize-2`,
                and inventing one would be adding to the icon set from a
                component, which is how a set stops being a set. The label and
                title carry the direction. */}
            <Icon name="maximize-2" size={16} />
          </Link>
        ) : null}
        {more && more.length > 0 ? <More actions={more} /> : null}
      </span>
    </div>
  );
}

/** The second of the pane's two tools.
 *
 *  A menu rather than another row of glyphs, because the head stops growing
 *  every time the thread gains a capability, which is what it had started to
 *  do: rename was a pencil, archive was a toggle, and Leave would have been a
 *  third. */
function More({ actions }: { actions: MoreAction[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent): void => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <span className={styles.moreWrap} ref={box}>
      <button
        type="button"
        className={styles.tool}
        aria-label="More"
        aria-expanded={open}
        aria-haspopup="menu"
        title="More"
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="ellipsis" size={16} />
      </button>

      {open ? (
        <span className={styles.moreMenu} role="menu">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className={styles.moreItem}
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
            >
              <Icon name={action.icon} size={15} />
              {action.label}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}
