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
import { useSearchParams } from "next/navigation";
import { Icon } from "../Icon";
import styles from "../../app/(shell)/shell.module.css";

export const FULL = "full";

/** Whether this pane is being shown on its own. */
export function useFull(): boolean {
  return useSearchParams().get(FULL) === "1";
}

interface Props {
  title: React.ReactNode;
  sub?: React.ReactNode;
  big?: boolean;
  /** Faces, share: whatever belongs to the thing rather than to the pane. */
  aside?: React.ReactNode;
  /** Extra quiet tools, before Open full. */
  tools?: React.ReactNode;
  /** Where Open full returns to. Omitted on a pane that cannot be full. */
  fullHref?: string | undefined;
}

export function PaneHead({ title, sub, big, aside, tools, fullHref }: Props) {
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
      <div style={{ minWidth: 0, flex: 1 }}>
        <h1 className={`${styles.paneTitle} ${big ? styles.paneTitleBig : ""}`}>{title}</h1>
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
      </span>
    </div>
  );
}
