"use client";

// One thread. From ui_kits/web_app/WThing.jsx.
//
// Head with the faces and the name, offload's standing read of the thread, then
// everything in it. The kit also draws a To do section, a map, a timeline and a
// file grid; none of them can exist until 006 produces tasks, dates and places,
// and a widget drawn over nothing is a widget drawn for nobody. They arrive
// in 007.
//
// **Three divergences from the kit, each logged in the design system's
// decisions.md:** the web kit renders nothing at all when a thread has no
// standing summary where the phones render an empty state, and since nothing
// writes summaries yet that empty state is what everybody sees; the kit draws
// `trash-2` on every row where delete is the author's alone; and no kit draws
// an archived state though every kit draws an archive control.

import { useEffect, useRef, useState } from "react";
import styles from "../../app/(app)/shell.module.css";
import type { Open } from "../shell/Shell";
import {
  deleteContent,
  editContent,
  fetchContent,
  fetchThread,
  renameThread,
  setArchived,
  type ContentRow,
  type ThreadBundle,
} from "../../lib/threads";

interface Props {
  id: string;
  open: Open;
  onChanged: () => void;
  onUndo: (message: string, undo: () => Promise<unknown>) => void;
}

export function Thread({ id, open, onChanged, onUndo }: Props) {
  const [thread, setThread] = useState<ThreadBundle | null>(null);
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function load(): Promise<void> {
    const [bundle, page] = await Promise.all([
      fetchThread(id),
      fetchContent(id, { archived: showArchived }),
    ]);
    setThread(bundle);
    setRows(page?.rows ?? []);
    setCursor(page?.nextCursor ?? null);
  }

  useEffect(() => {
    let live = true;
    void (async () => {
      const [bundle, page] = await Promise.all([
        fetchThread(id),
        fetchContent(id, { archived: showArchived }),
      ]);
      if (!live) return;
      setThread(bundle);
      setRows(page?.rows ?? []);
      setCursor(page?.nextCursor ?? null);
    })();
    return () => {
      live = false;
    };
  }, [id, showArchived]);

  async function more(): Promise<void> {
    if (!cursor) return;
    const page = await fetchContent(id, { cursor, archived: showArchived });
    if (!page) return;
    setRows((current) => [...current, ...page.rows]);
    setCursor(page.nextCursor);
  }

  async function saveTitle(row: ContentRow): Promise<void> {
    const title = draft.trim();
    setEditing(null);
    if (!title || title === row.title) return;

    const result = await editContent(row.id, { title });
    if (!result) return;
    await load();
    onChanged();
    // The value that was there, from the server rather than from what this
    // component happened to be holding.
    onUndo("Renamed", async () => {
      await editContent(row.id, { title: result.previous.title });
      await load();
      onChanged();
    });
  }

  async function archive(row: ContentRow): Promise<void> {
    const wasArchived = row.archivedAt !== null;
    if (!(await setArchived(row.id, !wasArchived))) return;
    await load();
    onChanged();
    onUndo(wasArchived ? "Back in the list" : "Archived", async () => {
      await setArchived(row.id, wasArchived);
      await load();
      onChanged();
    });
  }

  async function remove(row: ContentRow): Promise<void> {
    if (!(await deleteContent(row.id))) return;
    await load();
    onChanged();
    // Restore is the undo for delete as well as for archive: one endpoint
    // clears `deleted_at`, `purge_after` and `archived_at` together.
    onUndo("Deleted", async () => {
      await setArchived(row.id, false);
      await load();
      onChanged();
    });
  }

  async function saveName(): Promise<void> {
    const name = nameDraft.trim();
    setRenaming(false);
    if (!thread || !name || name === thread.name) return;

    const result = await renameThread(id, name);
    if (!result) return;
    await load();
    onChanged();
    onUndo("Renamed", async () => {
      await renameThread(id, result.previous.name);
      await load();
      onChanged();
    });
  }

  if (!thread) return <div className={styles.paneBody} />;

  const others = thread.members.filter((member) => !member.isYou);

  return (
    <>
      <div className={styles.paneHead}>
        <div style={{ minWidth: 0 }}>
          {renaming ? (
            <input
              ref={input}
              className={styles.titleInput}
              value={nameDraft}
              autoFocus
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={() => void saveName()}
              onKeyDown={(event) => {
                if (event.key === "Enter") void saveName();
                if (event.key === "Escape") setRenaming(false);
              }}
              aria-label="Thread name"
            />
          ) : (
            <h1
              className={styles.paneTitle}
              onDoubleClick={() => {
                setNameDraft(thread.name);
                setRenaming(true);
              }}
            >
              {thread.name}
            </h1>
          )}
          <p className={styles.paneSub}>
            {thread.counts.active}
            {others.length ? ` · ${others.map((m) => m.displayName).join(", ")}` : " · just you"}
            {thread.counts.archived ? ` · ${thread.counts.archived} archived` : ""}
          </p>
        </div>

        <div className={styles.paneTools}>
          <div className={styles.faces}>
            {thread.members.map((member) => (
              <span key={member.accountId} className={styles.face} title={member.displayName}>
                {member.initials}
              </span>
            ))}
          </div>
          <button
            type="button"
            className={styles.chip}
            onClick={() => {
              setNameDraft(thread.name);
              setRenaming(true);
            }}
          >
            Rename
          </button>
        </div>
      </div>

      <div className={styles.paneBody}>
        {/* offload writes no summaries yet, so this is what everybody sees. The
            phones already draw this exact line; the web kit draws nothing,
            which would leave a hole where the most prominent block should be. */}
        <p className={styles.standingEmpty}>offload has not summarised this one yet</p>

        <h2 className={styles.section}>
          {showArchived ? "Archived" : "Everything in here"}
          <em className={styles.sectionCount}>
            {showArchived ? thread.counts.archived : thread.counts.active}
          </em>
          {thread.counts.archived > 0 || showArchived ? (
            <button
              type="button"
              className={styles.sectionAction}
              onClick={() => setShowArchived((current) => !current)}
            >
              {showArchived ? "Back to the list" : `Archived ${thread.counts.archived}`}
            </button>
          ) : null}
        </h2>

        {rows.length === 0 ? (
          <p className={styles.empty}>
            {showArchived
              ? "Nothing archived here."
              : "Nothing in this one yet. Dump something on Today and offload will file it."}
          </p>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className={`${styles.row} ${row.archivedAt ? styles.archived : ""}`}
            >
              <span className={styles.rowIcon} aria-hidden="true">
                ◦
              </span>
              <span className={styles.rowText}>
                {editing === row.id ? (
                  <input
                    className={styles.titleInput}
                    value={draft}
                    autoFocus
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={() => void saveTitle(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void saveTitle(row);
                      if (event.key === "Escape") setEditing(null);
                    }}
                    aria-label="Title"
                  />
                ) : (
                  <button
                    type="button"
                    className={styles.rowTitle}
                    style={{ border: 0, background: "none", padding: 0, textAlign: "left" }}
                    onClick={() => open({ kind: "content", id: row.id, title: row.title })}
                  >
                    {row.title}
                  </button>
                )}
                <span className={styles.rowMeta}>
                  {row.author.isYou ? "you" : row.author.displayName} ·{" "}
                  {new Date(row.createdAt).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </span>

              <span className={styles.rowTools}>
                <button
                  type="button"
                  className={styles.tool}
                  aria-label="Edit"
                  onClick={() => {
                    setDraft(row.title);
                    setEditing(row.id);
                  }}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className={styles.tool}
                  aria-label={row.archivedAt ? "Put back in the list" : "Archive"}
                  onClick={() => void archive(row)}
                >
                  {row.archivedAt ? "↩" : "▤"}
                </button>
                {/* Only the author. The kit draws this unconditionally; OFF-3
                    says otherwise, and the server refuses either way. */}
                {row.canDelete ? (
                  <button
                    type="button"
                    className={styles.tool}
                    aria-label="Delete"
                    onClick={() => void remove(row)}
                  >
                    ✕
                  </button>
                ) : null}
              </span>
            </div>
          ))
        )}

        {cursor ? (
          <button type="button" className={styles.sectionAction} onClick={() => void more()}>
            Show more
          </button>
        ) : null}
      </div>
    </>
  );
}
