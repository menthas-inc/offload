"use client";

// One thread. From ui_kits/web_app/WThing.jsx.
//
// Head with the faces and the name, offload's standing read of the thread, then
// everything in it. The kit also draws a To do section, a map, a timeline and a
// file grid; none of them can exist until 006 produces tasks, dates and places,
// and a widget drawn over nothing is a widget drawn for nobody. They arrive
// in 007.
//
// **Two divergences from the kit, each logged in the design system's
// decisions.md:** the kit draws `trash-2` on every row where delete is the
// author's alone, and no kit draws an archived state though every kit draws an
// archive control.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "../Icon";
import styles from "../../app/(shell)/shell.module.css";
import { PaneHead } from "../shell/PaneHead";
import { Notes } from "./Notes";
import { Timeline } from "./Timeline";
import { ContentRowView, type RowHandlers } from "./ContentRowView";
import { useThreads } from "../shell/threads-context";
import { Widgets } from "./Widgets";
import { cadenceLabel, datedFor, splitRepeating, widgetsFor } from "../../lib/widgets";
import {
  completeContent,
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
  onChanged: () => void;
  onUndo: (message: string, undo: () => Promise<unknown>) => void;
}

export function Thread({ id, onChanged, onUndo }: Props) {
  const [thread, setThread] = useState<ThreadBundle | null>(null);
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  // Lifted out of `Notes` so the pane head's More menu can open the editor. It
  // is also the answer to a cost that section had accepted: a thread with no
  // notes drew nothing, so there was nowhere to type the first one.
  const [addingNote, setAddingNote] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  // Which row is asking to be deleted. The kit asks in the row's own place
  // rather than in a dialog, so the question never covers what it is about.
  const [asking, setAsking] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // What arrived while this screen was open, so it can be marked for a moment
  // rather than appearing silently in the middle of a list.
  const [arrived, setArrived] = useState<Set<string>>(new Set());
  const { filed } = useThreads();

  async function load(): Promise<void> {
    const [bundle, page] = await Promise.all([
      fetchThread(id),
      fetchContent(id, { archived: showArchived }),
    ]);
    setThread(bundle);
    setRows(page?.rows ?? []);
    setCursor(page?.nextCursor ?? null);
  }

  /** Reload, and mark whatever was not here before.
   *
   *  The diff is done here rather than asked of the server: the client already
   *  knows what it was showing, and a "what changed since" parameter would be a
   *  second source of truth about the same question. */
  async function catchUp(): Promise<void> {
    const before = new Set(rows.map((row) => row.id));
    const [bundle, page] = await Promise.all([
      fetchThread(id),
      fetchContent(id, { archived: showArchived }),
    ]);
    const next = page?.rows ?? [];
    setThread(bundle);
    setRows(next);
    setCursor(page?.nextCursor ?? null);

    const fresh = next.filter((row) => !before.has(row.id)).map((row) => row.id);
    if (fresh.length === 0) return;
    setArrived(new Set(fresh));
  }

  // offload filed into a thread while somebody was looking at it. The composer
  // floats over every tab, so this is the ordinary case rather than an edge
  // one, and before this the page went on showing what it held a moment ago
  // while the reply said otherwise.
  //
  // `filed.at` is in the dependency list on purpose: filing into the same
  // thread twice running produces an identical id list, and without the
  // timestamp the second one would not re-run this.
  const lastFiled = useRef(0);
  useEffect(() => {
    if (!filed || filed.at === lastFiled.current) return;
    // Guarded by the timestamp rather than by a narrowed dependency list, so
    // the effect can depend on the whole value and still run exactly once per
    // turn. Filing into the same thread twice running produces an identical id
    // list, which is why the guard is a clock and not the ids.
    lastFiled.current = filed.at;
    // An empty list means "something changed, work out what", which is what
    // Undo sends because it does not carry the threads it reversed.
    if (filed.threadIds.length > 0 && !filed.threadIds.includes(id)) return;
    void catchUp();
  }, [filed, id]);

  // The mark is a moment, not a state. Cleared on a timer rather than on the
  // next render, so it survives the reload that produced it.
  useEffect(() => {
    if (arrived.size === 0) return;
    const timer = setTimeout(() => setArrived(new Set()), 1400);
    return () => clearTimeout(timer);
  }, [arrived]);

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
    setAsking(null);
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

  /** Tick, or put it back. Any member: a thread's contents belong to everybody
   *  in it and neither direction destroys anything. */
  async function toggle(row: ContentRow): Promise<void> {
    const wasDone = row.doneAt !== null;
    if (!(await completeContent(row.id, !wasDone))) return;
    await load();
    onUndo(wasDone ? "Back on the list" : "Ticked off", async () => {
      await completeContent(row.id, wasDone);
      await load();
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

  // What the widgets took. A piece of content appears once on this screen: if
  // a task is in the to-do list and a place is on the map, printing them again
  // below is the same information twice and makes the list look longer than
  // the thread is.
  const inWidgets = showArchived
    ? new Set<string>()
    : new Set(
        widgetsFor(rows, thread.preference.widgets).flatMap((widget) =>
          widget.rows.map((row) => row.id)
        )
      );
  // **Anything with a date already has a home, so this does not repeat it.**
  // The rail above draws every dated row and its day lists them, which is where
  // an event belongs; showing it again in the leftover list is the same row in
  // two places on one screen. Taken from what the rail actually draws rather
  // than from a type check, so the two cannot disagree about what is on it.
  //
  // **Only while the rail is on screen.** The archived view hides it, and
  // taking dated rows out of a list that is the only list there makes an
  // archived event invisible. The two have to be decided together, which is
  // why this reads the same flag the rail does.
  const onRail = new Set(
    showArchived ? [] : datedFor(rows, thread.notes).map((one) => one.rowId)
  );

  // **A repeating thing is one row here, not thirty.** A weekly class filed as
  // thirty occurrences spends thirty rows saying what the row above said, and
  // pushes everything that happened once off the bottom. The rail draws every
  // occurrence, because a calendar has a cell per day already and repetition
  // there is free; a list has no grid, so it collapses and says how often.
  //
  // *This was the timeline widget's job until 015 deleted the widget, and the
  // main list kept all thirty. It is the list's job now, which is what the rule
  // was always about.*
  const { once, repeating } = splitRepeating(
    rows.filter((row) => !inWidgets.has(row.id) && !onRail.has(row.id))
  );
  const rest = once;

  // "Everything else" once something has been lifted out, "Everything in here"
  // when nothing has: else what, otherwise.
  /** Everything a row needs from this page, in one place, so the list and the
   *  widgets cannot end up offering different controls on the same row. */
  const handlers: RowHandlers = {
    editing,
    draft,
    asking,
    arrived,
    onDraft: setDraft,
    onEdit: (row) => {
      setDraft(row.title);
      setEditing(row.id);
    },
    onSaveTitle: (row) => void saveTitle(row),
    onStopEditing: () => setEditing(null),
    onArchive: (row) => void archive(row),
    onAsk: setAsking,
    onDelete: (row) => void remove(row),
  };

  const restHeading =
    inWidgets.size > 0 ? "Everything else" : "Everything in here";

  const others = thread.members.filter((member) => !member.isYou);

  return (
    <>
      <PaneHead
        title={
          renaming ? (
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
            thread.name
          )
        }
        sub={
          <>
            {thread.counts.active}
            {others.length ? ` · ${others.map((m) => m.displayName).join(", ")}` : " · just you"}
          </>
        }
        fullHref={`/threads/${id}`}
        aside={
          <>
            {/* Who is already in, then the share control: the same order as
                the phones, and the order WPaneHead's `aside` puts them in. */}
            <div className={styles.faces}>
              {thread.members.map((member) => (
                <span key={member.accountId} className={styles.face} title={member.displayName}>
                  {member.initials}
                </span>
              ))}
            </div>

            {/* Inert until inviting exists. Drawn because the thread page
                without it is a different screen from the one designed. */}
            <button
              type="button"
              className={styles.shareButton}
              disabled
              aria-disabled="true"
              title="Sharing is not built yet"
            >
              <Icon name="share-2" size={15} />
              Share
            </button>
          </>
        }
        more={[
          {
            label: "Rename thread",
            icon: "pencil",
            onSelect: () => {
              setNameDraft(thread.name);
              setRenaming(true);
            },
          },
          {
            label: "Add a note",
            icon: "brain",
            onSelect: () => {
              setShowArchived(false);
              setAddingNote(true);
            },
          },
        ]}
      />

      <div className={styles.paneBody}>
        {/* No summary, nothing drawn. `WThing.jsx` has `{st ? ... : null}` and
            it is right: a line saying offload has not done something is not
            information, it is an apology taking up the most prominent space on
            the screen. Nothing writes summaries yet, so today this is always
            absent, and the day one lands the block appears with something in
            it. The phones draw a placeholder and should stop. */}
        {thread.standing ? (
          <>
            <p className={styles.standing}>{thread.standing}</p>
            <p className={styles.wrote}>
              <Icon name="sparkles" size={13} />
              offload wrote this
            </p>
          </>
        ) : null}

        {/* Widgets first, then everything. A widget is a view over the same
            rows the list below shows, so a piece removed from one is gone from
            both, and nothing here costs a second query. */}
        {/* The rail is above the widgets and is drawn for every thread,
            including one with nothing dated on it. It is not earned, which is
            why 015 took it out of the widget set rather than making it a widget
            that is always earned. */}
        {showArchived ? null : (
          <Timeline
            // Keyed by the thread, so the day you were reading and the gaps you
            // opened do not follow you into the next one. Without it, opening a
            // thread after picking 3 October in another one lands on 3 October
            // rather than on today.
            key={id}
            threadId={id}
            rows={rows}
            notes={thread.notes}
            handlers={handlers}
            onToggle={(row) => void toggle(row)}
            onAdded={() => void load()}
          />
        )}

        {showArchived ? null : (
          <Widgets
            threadId={id}
            rows={rows}
            preference={thread.preference}
            handlers={handlers}
            onAdded={() => void load()}
            onToggle={(row) => void toggle(row)}
          />
        )}

        {/* Notes sit between the widgets and the list, not at the foot.
            "Everything in here" has no cap and no pagination, so a section
            under it becomes undiscoverable on exactly the threads with most to
            say. A bounded set belongs next to the other bounded thing on the
            page. */}
        {showArchived ? null : (
          <Notes
            threadId={id}
            notes={thread.notes}
            counts={thread.noteCounts}
            members={thread.members}
            arrived={arrived}
            adding={addingNote}
            onAdding={setAddingNote}
            onChanged={() => void load()}
            onUndo={onUndo}
          />
        )}

        {/* A heading with nothing under it is a section announcing its own
            absence, and there is no exception: the way to the archived pile is
            a row below the list, so the heading never has to survive in order
            to carry it. */}
        {rest.length === 0 ? null : (
          <h2 className={styles.section}>
            {showArchived ? "Archived" : restHeading}
            {/* The count is what is in this list, so it is only shown once the
                whole list is loaded. A number that counts one page is a number
                that disagrees with the list under it the moment somebody
                scrolls. */}
            {cursor ? null : (
              <em className={styles.sectionCount} data-tone="accent">
                {rest.length + repeating.length}
              </em>
            )}
          </h2>
        )}

        {/* "Everything in this thread is above" is a line with nothing under
            it saying so, which is the same noise an empty heading was. The
            content is visibly above; the sentence adds a row to say so. What
            stays is the genuinely empty thread, which has nothing else on the
            screen and does need telling. */}
        {rest.length === 0 && (showArchived || inWidgets.size === 0) ? (
          <p className={styles.empty}>
            {showArchived
              ? "Nothing archived here."
              : "Nothing in this one yet. Dump something on Today and offload will file it."}
          </p>
        ) : rest.length === 0 && repeating.length === 0 ? null : (
          [
            // One row per series, standing for all of its occurrences, with
            // how often and how many held where its own date would be. **The
            // occurrences are counted, never hidden**, and the rail still draws
            // every one of them.
            ...repeating.map((series) => (
              <ContentRowView
                key={series.ref}
                row={series.row}
                handlers={handlers}
                lead={
                  <span className={styles.rowIcon}>
                    <Icon name={rowIcon(series.row.type)} size={18} />
                  </span>
                }
                meta={
                  <span className={styles.rowMeta}>
                    {cadenceLabel(series.everyDays) ?? `${series.count} dates`}
                    {cadenceLabel(series.everyDays) ? ` · ${series.count} held` : ""}
                  </span>
                }
              />
            )),
            ...rest.map((row) => (
            <ContentRowView
              key={row.id}
              row={row}
              handlers={handlers}
              lead={
                <span className={styles.rowIcon}>
                  <Icon name={rowIcon(row.type)} size={18} />
                </span>
              }
              meta={
                <span className={styles.rowMeta}>
                  {row.author.isYou ? "you" : row.author.displayName} ·{" "}
                  {/* The date says what happened to it rather than only when.
                      An archived row's created date is the least useful thing
                      about it. */}
                  {row.archivedAt ? "archived " : ""}
                  {new Date(row.archivedAt ?? row.createdAt).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              }
            />
            )),
          ]
        )}

        {cursor ? (
          <button type="button" className={styles.showMore} onClick={() => void more()}>
            Show more
          </button>
        ) : null}

        {/* The way to the archived pile, and the way back: a row under
            everything live rather than a toggle on the pane head. The archive
            is a place you go, and the count reads without hunting for a
            highlighted icon. */}
        {showArchived ? (
          <button
            type="button"
            className={styles.archivedRow}
            onClick={() => setShowArchived(false)}
          >
            <Icon name="chevron-left" size={15} />
            Back to the list
          </button>
        ) : thread.counts.archived > 0 ? (
          <button
            type="button"
            className={styles.archivedRow}
            onClick={() => setShowArchived(true)}
          >
            {thread.counts.archived} archived
            <span className={styles.archivedChevron}>
              <Icon name="chevron-right" size={15} />
            </span>
          </button>
        ) : null}
      </div>
    </>
  );
}

/** The glyph for a piece of content, from its type. The kit's own mapping:
 *  a pin for a place, a link for a link, a picture for a picture. */
function rowIcon(type: string): string {
  switch (type) {
    case "location":
      return "map-pin";
    case "link":
      return "link";
    case "image":
    case "screenshot":
      return "image";
    case "file":
      return "paperclip";
    case "voice":
      return "mic";
    case "task":
      return "square-check-big";
    case "event":
      return "calendar";
    default:
      return "text-quote";
  }
}
