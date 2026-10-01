"use client";

// 028. Not in a thread, the whole list.
//
// The screen *All 14* opens: `p1` in explorations/loose-items.html, a pane on
// the web beside My threads. Titled *Not in a thread*, with *Put down without
// a thread, newest first.*, the chips over the whole list with their counts,
// then every row with its suggestion, a page at a time with the thread page's
// Show more. At the end, the thread page's archived foot row opens the
// default thread's archived rows with Put back.
//
// One spinner while it loads, *Couldn't load these* with Try again when the
// read fails or a next page does (under the last row), and the empty state
// when there is nothing.

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { PaneHead } from "../shell/PaneHead";
import { useToast } from "../shell/Toast";
import { ContentRowView } from "../panes/ContentRowView";
import { rowIcon } from "../panes/Thread";
import { LooseRow } from "./LooseRow";
import { TypeChips } from "./TypeChips";
import { useLooseRows } from "./useLooseRows";
import { perform } from "../../lib/optimistic";
import { setArchived, type ContentRow } from "../../lib/threads";
import { fetchLoose, fetchLooseArchived, itemKey, type ChipKey, type LoosePage } from "../../lib/loose";
import pane from "../../app/(shell)/shell.module.css";
import quiet from "../../app/(shell)/today.module.css";
import people from "../people/people.module.css";
import styles from "./loose.module.css";

const EMPTY: LoosePage = { rows: [], nextCursor: null, count: 0, byType: {}, archived: 0 };

export function LoosePane({ type: initial, onChanged }: { type: ChipKey | null; onChanged?: () => void }) {
  const toast = useToast();
  const [type, setType] = useState<ChipKey | null>(initial);
  const [state, setState] = useState<"loading" | "failed" | "ready">("loading");
  const [page, setPage] = useState<LoosePage>(EMPTY);
  const [nextFailed, setNextFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // The archived rows, read when the foot row is opened.
  const [archived, setArchivedRows] = useState<{ rows: ContentRow[]; nextCursor: string | null } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const rows = useLooseRows(page, setPage, async () => {
    await load(type);
    onChanged?.();
  });

  /** The first page, for the chip that is on. A reload that lands while a
   *  write is in flight is dropped, as the thread page drops it. */
  async function load(which: ChipKey | null): Promise<void> {
    const read = await fetchLoose({ type: which });
    if (!rows.writes.idle()) return;
    if (!read) {
      setState("failed");
      return;
    }
    // The picked type has emptied: back to All.
    if (which && (read.byType[which] ?? 0) === 0) {
      setType(null);
      return;
    }
    setPage(read);
    setNextFailed(false);
    setState("ready");
    if (showArchived) await openArchived();
  }

  useEffect(() => {
    let live = true;
    void fetchLoose({ type }).then((read) => {
      if (!live) return;
      if (!read) return setState("failed");
      setPage(read);
      setNextFailed(false);
      setState("ready");
    });
    return () => {
      live = false;
    };
  }, [type, attempt]);

  async function more(): Promise<void> {
    if (!page.nextCursor) return;
    setNextFailed(false);
    const read = await fetchLoose({ type, cursor: page.nextCursor });
    if (!read) {
      setNextFailed(true);
      return;
    }
    setPage((current) => ({ ...read, rows: [...current.rows, ...read.rows.filter((one) => !current.rows.some((had) => itemKey(had) === itemKey(one)))] }));
  }

  async function openArchived(cursor?: string): Promise<void> {
    const read = await fetchLooseArchived(cursor);
    if (!read) {
      toast.show("Couldn't load these", { label: "Try again", onPress: () => openArchived(cursor) });
      return;
    }
    setArchivedRows((current) => ({
      rows: cursor && current ? [...current.rows, ...read.rows] : read.rows,
      nextCursor: read.nextCursor,
    }));
    setShowArchived(true);
  }

  /** Put back, as the thread page's archived rows offer it: out of this list
   *  and into the live one. */
  function putBack(row: ContentRow): void {
    const at = archived?.rows.findIndex((one) => one.id === row.id) ?? -1;
    void perform(
      {
        apply: () => {
          setArchivedRows((current) => (current ? { ...current, rows: current.rows.filter((one) => one.id !== row.id) } : current));
          setPage((current) => ({ ...current, archived: Math.max(0, current.archived - 1) }));
        },
        revert: () => {
          setArchivedRows((current) =>
            current && !current.rows.some((one) => one.id === row.id)
              ? { ...current, rows: [...current.rows.slice(0, at), row, ...current.rows.slice(at)] }
              : current,
          );
          setPage((current) => ({ ...current, archived: current.archived + 1 }));
        },
        write: () => setArchived(row.id, false),
        unwrite: () => setArchived(row.id, true),
        did: "Put back",
        failed: "Couldn't put that back",
        unfailed: "Couldn't archive that",
      },
      toast,
      rows.writes,
    );
  }

  const retry = (
    <button
      type="button"
      className={people.ghost}
      onClick={() => {
        setState("loading");
        setAttempt((n) => n + 1);
      }}
    >
      Try again
    </button>
  );

  const foot = showArchived ? (
    <button type="button" className={pane.archivedRow} onClick={() => setShowArchived(false)}>
      <Icon name="chevron-left" size={15} />
      Back to the list
    </button>
  ) : page.archived > 0 ? (
    <button type="button" className={pane.archivedRow} onClick={() => void openArchived()}>
      {page.archived} archived
      <span className={pane.archivedChevron}>
        <Icon name="chevron-right" size={15} />
      </span>
    </button>
  ) : null;

  function body() {
    if (state === "loading") return <span className={pane.paneSpinner} role="status" aria-label="loading" />;
    if (state === "failed") {
      return (
        <p className={styles.state} role="alert">
          Couldn&apos;t load these
          {retry}
        </p>
      );
    }
    if (showArchived && archived) {
      return (
        <>
          <h2 className={pane.section}>Archived</h2>
          {archived.rows.length === 0 ? <p className={pane.empty}>Nothing archived here.</p> : null}
          {archived.rows.map((row) => (
            <ContentRowView
              key={row.id}
              row={row}
              handlers={{ ...rows.handlers, onArchive: putBack }}
              lead={
                <span className={pane.rowIcon}>
                  <Icon name={rowIcon(row.type)} size={18} />
                </span>
              }
              meta={
                row.archivedAt ? (
                  <span className={pane.rowMeta}>
                    archived{" "}
                    {new Date(row.archivedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </span>
                ) : null
              }
            />
          ))}
          {archived.nextCursor ? (
            <button type="button" className={pane.showMore} onClick={() => void openArchived(archived.nextCursor!)}>
              Show more
            </button>
          ) : null}
        </>
      );
    }
    if (page.count === 0 && page.rows.length === 0) {
      // The design system's empty state, as `QuietEmpty` draws it under a
      // head that is already on screen.
      return (
        <div className={quiet.quiet}>
          <Icon name="lasso" size={34} className={quiet.quietMark} />
          <p className={quiet.quietLine}>Nothing in here yet</p>
        </div>
      );
    }
    return (
      <>
        <TypeChips sticky count={page.count} byType={page.byType} picked={type} onPick={setType} />
        {page.rows.map((item) => (
          <LooseRow key={itemKey(item)} item={item} rows={rows} />
        ))}
        {nextFailed ? (
          <p className={styles.state} role="alert">
            Couldn&apos;t load these
            <button type="button" className={people.ghost} onClick={() => void more()}>
              Try again
            </button>
          </p>
        ) : page.nextCursor ? (
          <button type="button" className={pane.showMore} onClick={() => void more()}>
            Show more
          </button>
        ) : null}
      </>
    );
  }

  return (
    <>
      <PaneHead title="Not in a thread" sub="Put down without a thread, newest first." fullHref="/threads/loose" />
      <div className={pane.paneBody}>
        {body()}
        {state === "ready" ? foot : null}
        {rows.overlays}
      </div>
    </>
  );
}
