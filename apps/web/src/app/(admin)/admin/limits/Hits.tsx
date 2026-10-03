"use client";

// What has been hit: the last 30 days of refusals (034, section D, AC-35).
//
// The kit's table, narrowed as the spec says: "What we did" is gone, because
// stop is all a cap does, and a count and whose cap it was are in
// its place. One row per cap, person and UTC day.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "../../admin.module.css";
import { Empty, Failed, Lines, Row, Table, clock, count, day, useAdminRead, type Col } from "../../ui";
import { capLabel } from "./labels";

interface Hit {
  cap: string;
  scope: "account" | "platform";
  /** The UTC day, as `2026-10-03`. */
  day: string;
  count: number;
  lastAt: string;
  account: { id: string; name: string | null; email: string };
}

interface HitsPage {
  rows: Hit[];
  nextCursor: string | null;
}

export interface HitsRead {
  rows: Hit[];
  state: "loading" | "failed" | "ready";
  /** Whether there is another page to ask for. */
  more: boolean;
  loadMore: () => void;
  /** Start again from the newest. */
  reload: () => void;
  retry: () => void;
}

/** The refusals, a page at a time. Each page is kept under the cursor that
 *  asked for it, so a page that arrives twice is one page. */
export function useHits(): HitsRead {
  const [cursor, setCursor] = useState<string | null>(null);
  const read = useAdminRead<HitsPage>(`/limits/hits${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
  const [pages, setPages] = useState<Array<{ cursor: string | null; page: HitsPage }>>([]);
  // The read only ever delivers the answer to its newest path, so an answer
  // belongs to the cursor that is current when it lands. Each answer is filed
  // once: the cursor moving on its own files nothing.
  const filed = useRef<HitsPage | null>(null);

  const { data, reload: again } = read;
  useEffect(() => {
    if (!data || data === filed.current) return;
    filed.current = data;
    setPages((current) => (cursor === null ? [{ cursor: null, page: data }] : [...current.filter((one) => one.cursor !== cursor), { cursor, page: data }]));
  }, [data, cursor]);

  const last = pages[pages.length - 1];
  const next = last?.page.nextCursor ?? null;
  const reload = useCallback(() => {
    if (cursor === null) again();
    else setCursor(null);
  }, [cursor, again]);

  return {
    rows: pages.flatMap((one) => one.page.rows),
    state: read.state,
    more: next !== null,
    loadMore: () => {
      if (next) setCursor(next);
    },
    reload,
    retry: again,
  };
}

const COLS: Col[] = [{ label: "What" }, { label: "Who", w: 260 }, { label: "When", w: 120 }, { label: "How many", w: 90, right: true }, { label: "Whose cap", w: 130 }];

const WHOSE: Record<Hit["scope"], string> = { account: "Their own", platform: "The platform's" };

export function Hits({ hits }: { hits: HitsRead }) {
  const { rows } = hits;

  // A failed read is never drawn as an empty list.
  if (rows.length === 0) {
    if (hits.state === "failed") return <Failed what="what has been hit" onRetry={hits.retry} />;
    // The page has its one spinner; this section waits without a second.
    if (hits.state === "loading") return null;
    return <Empty>Nothing has been refused in 30 days.</Empty>;
  }

  return (
    <>
      <Table cols={COLS}>
        {rows.map((hit, index) => (
          <Row
            key={`${hit.account.id} ${hit.cap} ${hit.scope} ${hit.day}`}
            cols={COLS}
            last={index === rows.length - 1}
            cells={[
              <Lines key="what" main={capLabel(hit.cap)} />,
              <Lines
                key="who"
                main={
                  <Link href={`/admin/people/${hit.account.id}`} className={styles.limitsLink}>
                    {hit.account.name ?? hit.account.email}
                  </Link>
                }
                sub={hit.account.name ? hit.account.email : undefined}
              />,
              // The day is a UTC day, as the count is; the moment under it is
              // the reader's own clock.
              <span key="when">
                {day(hit.day)}
                <span className={styles.note}>last at {clock(new Date(hit.lastAt))}</span>
              </span>,
              count(hit.count),
              <span key="whose" className={styles.quiet}>
                {WHOSE[hit.scope]}
              </span>,
            ]}
          />
        ))}
      </Table>

      {/* More was asked for and did not come: said here, and the rows stay. */}
      {hits.state === "failed" ? <Failed what="more" onRetry={hits.retry} /> : null}

      {hits.more && hits.state !== "failed" ? (
        <div className={styles.more}>
          <button type="button" className={styles.ghost} onClick={hits.loadMore} disabled={hits.state === "loading"}>
            Load more
          </button>
        </div>
      ) : null}
    </>
  );
}
