"use client";

// A list read a page at a time, through the one way the panel reads.
//
// The first page is `base`; each later one is `base` with the cursor the
// server gave. Rows already on screen stay there while the next page is on
// its way, and a new `base` (a search, a filter, a sort) starts from the top.

import { useState } from "react";
import { useAdminRead, type AdminRead } from "../../ui";

interface Page<Row> {
  rows: Row[];
  nextCursor: string | null;
}

export interface Paged<Row, Extra> {
  rows: Row[];
  /** The newest page as the server sent it, for what rides beside the rows. */
  data: (Page<Row> & Extra) | null;
  state: AdminRead<unknown>["state"];
  asOf: Date | null;
  /** Null when there is no next page. */
  loadMore: (() => void) | null;
  /** Read again from the top. */
  reload: () => void;
}

export function usePaged<Row extends { id: string }, Extra = unknown>(base: string | null): Paged<Row, Extra> {
  const [at, setAt] = useState<{ base: string | null; cursor: string | null; earlier: Row[] }>({ base, cursor: null, earlier: [] });
  const here = at.base === base ? at : { base, cursor: null, earlier: [] as Row[] };
  const path = base === null || here.cursor === null ? base : `${base}${base.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(here.cursor)}`;
  const read = useAdminRead<Page<Row> & Extra>(path);

  const page = read.data?.rows ?? [];
  const seen = new Set(here.earlier.map((row) => row.id));
  // Until the next page lands the read still holds the one before it, whose
  // rows are already in `earlier`, and whose cursor has been used.
  const waiting = here.cursor !== null && page.length > 0 && page.every((row) => seen.has(row.id));
  const rows = waiting ? here.earlier : [...here.earlier, ...page.filter((row) => !seen.has(row.id))];
  const next = waiting ? null : (read.data?.nextCursor ?? null);

  return {
    rows,
    data: read.data,
    state: read.state,
    asOf: read.asOf,
    loadMore: next ? () => setAt({ base, cursor: next, earlier: rows }) : null,
    reload: () => {
      if (here.cursor === null) read.reload();
      else setAt({ base, cursor: null, earlier: [] });
    },
  };
}
