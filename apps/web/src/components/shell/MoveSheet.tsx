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

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (threads ?? [])
      .filter((thread) => thread.id !== exceptThreadId)
      .filter((thread) => !needle || thread.name.toLowerCase().includes(needle));
  }, [threads, query, exceptThreadId]);

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
        <button type="button" className={styles.tool} aria-label="Close" onClick={onClose}>
          <Icon name="x" size={16} />
        </button>
      </div>
      <ul className={styles.sheetList}>
        {threads === null ? null : shown.length === 0 ? (
          <li className={styles.sheetEmpty}>{query.trim() ? "Nothing by that name." : "No other thread."}</li>
        ) : (
          shown.map((thread) => (
            <li key={thread.id}>
              <button type="button" className={styles.sheetRow} onClick={() => onPick(thread)}>
                <span className={styles.sheetRowName}>{thread.name}</span>
                <span className={styles.sheetRowMeta}>{thread.meta}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
