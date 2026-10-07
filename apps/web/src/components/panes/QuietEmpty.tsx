"use client";

// The empty state, from ui_kits/web_app's WQuietEmpty.
//
// Centred, with the mark at 22% opacity above one quiet line. Deliberately not
// an illustration and deliberately not a call to action: the composer is
// already on screen under every pane, so an empty screen needs to say what will
// appear here rather than tell somebody to do something.

import { Icon } from "../Icon";
import pane from "../../app/(shell)/shell.module.css";
import styles from "../../app/(shell)/today.module.css";

interface Props {
  title: string;
  line: string;
  /** 040. A pane whose empty state still adds: Memories keeps its plus. */
  tools?: React.ReactNode;
}

export function QuietEmpty({ title, line, tools }: Props) {
  return (
    <>
      <div className={pane.paneHead}>
        <div style={{ minWidth: 0 }}>
          <h1 className={`${pane.paneTitle} ${pane.paneTitleBig}`}>{title}</h1>
          <p className={pane.paneSub}>Nothing in here yet</p>
        </div>
        {tools ? <span className={pane.paneTools}>{tools}</span> : null}
      </div>

      <div className={styles.quiet}>
        <Icon name="lasso" size={34} className={styles.quietMark} />
        <p className={styles.quietLine}>{line}</p>
      </div>
    </>
  );
}
