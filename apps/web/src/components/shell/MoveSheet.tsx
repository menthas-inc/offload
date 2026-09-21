"use client";

// Where a row goes, chosen by hand.
//
// The first move control the product has drawn. The shape is the kit's share
// sheet in ui_kits/mobile_app/Sharing.jsx: a list with search on top and a tap
// to choose. The threads are the person's own, from the same read the sidebar
// makes, minus the one the row is already in.

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";
import { fetchThreads, type ThreadRow } from "../../lib/threads";
import styles from "../../app/(shell)/viewer.module.css";

export function MoveSheet({
  exceptThreadId,
  onPick,
  onClose,
}: {
  exceptThreadId: string | null;
  onPick: (thread: ThreadRow) => void;
  onClose: () => void;
}) {
  const [threads, setThreads] = useState<ThreadRow[] | null>(null);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    void fetchThreads().then((groups) => {
      if (!live) return;
      setThreads(groups.flatMap((group) => group.threads));
    });
    input.current?.focus();
    return () => {
      live = false;
    };
  }, []);

  const others = useMemo(
    () => (threads ?? []).filter((thread) => thread.id !== exceptThreadId),
    [threads, exceptThreadId],
  );
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return others.filter((thread) => !needle || thread.name.toLowerCase().includes(needle));
  }, [others, query]);
  // Move can run out of destinations, which sharing never can.
  const nowhere = threads !== null && others.length === 0;

  return (
    <div
      className={styles.sheet}
      role="dialog"
      aria-modal="true"
      aria-label="Move to a thread"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      {nowhere ? (
        <p className={styles.sheetNowhere}>There is no other thread to move it to.</p>
      ) : (
        <>
          <div className={styles.sheetHead}>
            <Icon name="search" size={15} />
            <input
              ref={input}
              className={styles.sheetSearch}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Which thread?"
              aria-label="Which thread?"
            />
          </div>
          <ul className={styles.sheetList}>
            {threads === null ? null : shown.length === 0 ? (
              <li className={styles.sheetEmpty}>Nothing by that name.</li>
            ) : (
              shown.map((thread) => (
                <li key={thread.id}>
                  <button type="button" className={styles.sheetRow} onClick={() => onPick(thread)}>
                    <span className={styles.sheetRowLead} aria-hidden="true">
                      <Icon name="lasso" size={18} />
                    </span>
                    <span className={styles.sheetRowName}>{thread.name}</span>
                    <span className={styles.sheetRowMeta}>{thread.meta}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </>
      )}
      <div className={styles.sheetFooter}>
        <button type="button" className={styles.sheetCancel} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
