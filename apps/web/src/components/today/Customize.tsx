"use client";

// 027 Customize Today, as the web's second pane beside Today.
//
// Needs you, with a grip and no switch of its own, and its four kinds under
// it, each with a switch; Your day, with a grip and a switch. The two sections
// drag to reorder, or move with the arrow keys on a focused grip. A drag or a
// switch applies at once, Today beside it changing, and is written as it
// settles, one write a gesture; a write that fails puts the pane back with
// "Couldn't save that" and Try again. The last switch on is drawn disabled, so
// Today is never blank. Reset returns the defaults; Done closes the pane.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../Icon";
import { Switch } from "../Switch";
import { currentMe, onMe, updateTodayLayout } from "../../lib/use-me";
import {
  DEFAULT_LAYOUT,
  layoutOf,
  moved,
  switchesOn,
  withDay,
  withPart,
  type LayoutSection,
  type NeedsPart,
  type TodayLayout,
} from "../../lib/today";
import pane from "../../app/(shell)/shell.module.css";
import styles from "../../app/(shell)/today.module.css";

const KINDS: Record<NeedsPart, { name: string; line: string }> = {
  account: { name: "Account issues", line: "Calendar, time zone, notifications" },
  people: { name: "People", line: "Requests and shared threads" },
  questions: { name: "Questions", line: "What offload asked you" },
  tips: { name: "Tips", line: "Ways to use offload" },
};

const SECTION_NAME: Record<LayoutSection["kind"], string> = { needs_you: "Needs you", day: "Your day" };

export interface LayoutState {
  layout: TodayLayout;
  /** Draw it now, write it once. */
  change: (next: TodayLayout) => void;
  /** A write that failed, waiting for Try again. */
  failed: boolean;
  retry: () => void;
}

/** The layout both panes draw: the server's, with a change drawn ahead of
 *  the write and put back when the write is refused. */
export function useTodayLayout(): LayoutState {
  const [layout, setLayout] = useState<TodayLayout>(() => layoutOf(currentMe()?.todayLayout));
  const [failed, setFailed] = useState<TodayLayout | null>(null);
  useEffect(() => onMe((me) => setLayout(layoutOf(me.todayLayout))), []);

  const change = useCallback(
    (next: TodayLayout) => {
      const before = layout;
      setLayout(next);
      setFailed(null);
      void updateTodayLayout(next).then((me) => {
        if (me) return;
        setLayout(before);
        setFailed(next);
      });
    },
    [layout],
  );

  const retry = useCallback(() => {
    if (failed) change(failed);
  }, [failed, change]);

  return { layout, change, failed: failed !== null, retry };
}

export function CustomizePane({ state }: { state: LayoutState }) {
  const { layout, change, failed, retry } = state;
  const [dragging, setDragging] = useState<LayoutSection["kind"] | null>(null);
  const [over, setOver] = useState<LayoutSection["kind"] | null>(null);
  const last = switchesOn(layout) === 1;

  const moveTo = (kind: LayoutSection["kind"], to: number) => {
    const from = layout.sections.findIndex((one) => one.kind === kind);
    if (from === to || to < 0 || to >= layout.sections.length) return;
    change(moved(layout, kind, to));
  };

  const grip = (kind: LayoutSection["kind"], index: number) => (
    <button
      type="button"
      className={styles.grip}
      aria-label={`Move ${SECTION_NAME[kind]}`}
      title={`Move ${SECTION_NAME[kind]}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer?.setData("text/plain", kind);
        setDragging(kind);
      }}
      onDragEnd={() => {
        setDragging(null);
        setOver(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          moveTo(kind, index + (event.key === "ArrowUp" ? -1 : 1));
        }
      }}
    >
      <Icon name="grip-vertical" size={17} />
    </button>
  );

  return (
    <>
      <div className={pane.paneHead}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 className={pane.paneTitle}>Customize Today</h1>
          <p className={pane.paneSub}>Drag to reorder. Switch off to hide.</p>
        </div>
      </div>
      <div className={pane.paneBody}>
        <div className={styles.custom}>
          {layout.sections.map((section, index) => (
            <div
              key={section.kind}
              className={styles.customSection}
              data-section={section.kind}
              data-dragging={dragging === section.kind || undefined}
              data-over={over === section.kind && dragging !== section.kind ? true : undefined}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                setOver(section.kind);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging && dragging !== section.kind) moveTo(dragging, index);
                setDragging(null);
                setOver(null);
              }}
            >
              {section.kind === "needs_you" ? (
                <>
                  <div className={styles.customRow}>
                    {grip(section.kind, index)}
                    <span className={styles.customName}>{SECTION_NAME.needs_you}</span>
                  </div>
                  {section.parts.map((part) => (
                    <label key={part.kind} className={`${styles.customRow} ${styles.customKind}`}>
                      <span className={styles.customName}>
                        {KINDS[part.kind].name}
                        <em className={styles.customLine}>{KINDS[part.kind].line}</em>
                      </span>
                      <Switch
                        checked={part.on}
                        disabled={part.on && last}
                        onChange={(on) => change(withPart(layout, part.kind, on))}
                      />
                    </label>
                  ))}
                </>
              ) : (
                <div className={styles.customRow}>
                  {grip(section.kind, index)}
                  <label className={styles.customLabel}>
                    <span className={styles.customName}>
                      {SECTION_NAME.day}
                      <em className={styles.customLine}>Events and to-dos, a day at a time</em>
                    </span>
                    <Switch checked={section.on} disabled={section.on && last} onChange={(on) => change(withDay(layout, on))} />
                  </label>
                </div>
              )}
            </div>
          ))}

          {failed ? (
            <p className={styles.customFailed} role="alert">
              Couldn&apos;t save that{" "}
              <button type="button" className={styles.customRetry} onClick={retry}>
                Try again
              </button>
            </p>
          ) : null}

          <div className={styles.customFoot}>
            <button type="button" className={styles.footPill} onClick={() => change(DEFAULT_LAYOUT)}>
              Reset
            </button>
            <Link href="/today" className={`${styles.footPill} ${styles.footDone}`}>
              Done
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
