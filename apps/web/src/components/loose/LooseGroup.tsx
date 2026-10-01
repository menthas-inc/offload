"use client";

// 028. Not in a thread, on My threads.
//
// From `LooseGroup` in ui_kits/mobile_app/LooseParts.jsx, which the web kit
// draws in `WThings` between the first list and Older threads. The heading
// with its count in the neutral pill, the type chips when two types are
// present, three rows, then *All 14* or *All 5 links*. Not drawn when there
// is nothing in it.
//
// **A chip filters the group in place**: the first page of that type, three
// drawn. The pick is not kept across visits, and when its type empties the
// group goes back to All.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "../Icon";
import { LooseRow } from "./LooseRow";
import { TypeChips } from "./TypeChips";
import { useLooseRows } from "./useLooseRows";
import { allLabel, chipOf, chipsShown, fetchLoose, entryKey, type ChipKey, type LooseSummary } from "../../lib/loose";
import pane from "../../app/(shell)/shell.module.css";
import styles from "./loose.module.css";

/** What My threads draws before *All N*. */
export const LOOSE_SHOWN = 3;

export function LooseGroup({ summary, onChanged }: { summary: LooseSummary; onChanged: () => void }) {
  const [picked, setPicked] = useState<ChipKey | null>(null);
  // The counts and the rows on screen: the summary's three under All, the
  // first page of a type under its chip. One list, so a row leaving takes
  // its counts with it either way.
  const [view, setView] = useState<LooseSummary>(summary);
  const rows = useLooseRows(view, setView, async () => onChanged());

  async function pick(next: ChipKey | null): Promise<void> {
    setPicked(next);
    if (next === null) {
      setView(summary);
      return;
    }
    // Drawn from what is in hand while the page is read.
    setView((current) => ({ ...current, rows: summary.rows.filter((entry) => chipOf(entry) === next) }));
    const page = await fetchLoose({ type: next });
    if (page) setView((current) => ({ ...current, rows: page.rows }));
  }

  // The server's copy, whenever the shell reads it again. A picked type that
  // has emptied, or chips that have gone, put the group back on All.
  useEffect(() => {
    const live = picked !== null && (summary.byType[picked] ?? 0) > 0 && chipsShown(summary.byType).length > 0;
    if (picked !== null && live) {
      setView((current) => ({ ...summary, rows: current.rows }));
      void pick(picked);
      return;
    }
    setPicked(null);
    setView(summary);
  }, [summary]);

  if (view.count === 0) return <>{rows.overlays}</>;

  const total = picked ? (view.byType[picked] ?? 0) : view.count;
  const shown = view.rows.slice(0, LOOSE_SHOWN);
  const query = new URLSearchParams({ from: "threads" });
  if (picked) query.set("type", picked);

  return (
    <section>
      <h2 className={pane.section}>
        Not in a thread
        <em className={pane.sectionCount} data-tone="neutral">
          {view.count}
        </em>
      </h2>
      <TypeChips count={view.count} byType={view.byType} picked={picked} onPick={(next) => void pick(next)} />
      {shown.map((entry) => (
        <LooseRow key={entryKey(entry)} entry={entry} rows={rows} />
      ))}
      {total > LOOSE_SHOWN ? (
        <Link href={`/threads/loose?${query.toString()}`} className={styles.all}>
          {allLabel(total, picked)}
          <Icon name="chevron-right" size={14} />
        </Link>
      ) : null}
      {rows.overlays}
    </section>
  );
}
