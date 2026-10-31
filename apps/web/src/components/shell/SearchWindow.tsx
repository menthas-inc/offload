"use client";

// 049. Search, as a window over the page.
//
// ⌘K or Ctrl K from anywhere, / when focus is not in a text field, and the
// sidebar's Search. The surface is the web kit's `WPalette` (its tokens, not
// its commands); the groups and rows are the Search page the phones draw, read
// as you type: thread names held here at once, then the server's answer, then
// meaning after a pause from four letters. Keyboard first: the arrows move a
// selection through every option, Return opens it, ⌘Return asks offload,
// Escape closes and gives focus back.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ANNOUNCE_MS,
  ARCHIVED_PARAM,
  DEFAULT_THREAD_ICON,
  KIND_WORDS,
  MEMORY_PARAM,
  NOTE_GLYPH,
  NOTE_PARAM,
  QUERY_CHARS,
  ROW_GLYPHS,
  ROW_PARAM,
  SEARCH_COPY,
  foundMeta,
  looseMatches,
  matchSpans,
  nameMatches,
  rowLabel,
  searchCount,
  searchLetters,
  searchSession,
  type SearchRow,
  type SearchState,
} from "@offload/widgets";
import { Icon } from "../Icon";
import { ThreadIcon } from "../ThreadIcon";
import { useThreads } from "./threads-context";
import { useClock } from "../../lib/clock";
import { fillComposer } from "../../lib/composer-fill";
import { OPEN_SEARCH, dropRecent, keepRecent, readRecent, searchFor } from "../../lib/search";
import type { ThreadRow } from "../../lib/threads";
import styles from "./search.module.css";

const apple = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
/** ⌘ on Apple, Ctrl elsewhere: what the sidebar's cap and the footer say. */
export const searchKey = () => (apple() ? "⌘" : "Ctrl ");

function typing(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}

/** The letters a query matched, semibold. */
function Marked({ text, query, mode }: { text: string; query: string; mode: "word" | "any" }) {
  return (
    <>
      {matchSpans(text, query, mode).map((span, i) => (span.match ? <b key={i}>{span.text}</b> : <span key={i}>{span.text}</span>))}
    </>
  );
}

interface Option {
  id: string;
  label: string;
  run: (ask: boolean) => void;
  node: React.ReactNode;
}

export function SearchWindow() {
  const [open, setOpen] = useState(false);
  const returnTo = useRef<HTMLElement | null>(null);
  const isOpen = useRef(false);

  useEffect(() => {
    const show = () => {
      // Pressed again while open, focus is already the window's own.
      if (isOpen.current) return;
      isOpen.current = true;
      returnTo.current = document.activeElement as HTMLElement | null;
      setOpen(true);
    };
    const keys = (event: KeyboardEvent) => {
      const k = event.key.toLowerCase();
      if (k === "k" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        show();
      } else if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !typing(event.target)) {
        event.preventDefault();
        show();
      }
    };
    window.addEventListener(OPEN_SEARCH, show);
    document.addEventListener("keydown", keys);
    return () => {
      window.removeEventListener(OPEN_SEARCH, show);
      document.removeEventListener("keydown", keys);
    };
  }, []);

  if (!open) return null;
  return (
    <Window
      onClose={() => {
        isOpen.current = false;
        setOpen(false);
        returnTo.current?.focus?.();
      }}
    />
  );
}

function Window({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { groups, loose: looseSummary, viewerId } = useThreads();
  const { zone, today } = useClock();
  const threads = useMemo(() => groups.flatMap((group) => group.threads), [groups]);
  const byId = useMemo(() => new Map(threads.map((t) => [t.id, t])), [threads]);
  const [state, setState] = useState<SearchState>({ q: "", answer: null, failed: false });
  const [recent, setRecent] = useState<string[]>(() => (viewerId ? readRecent(viewerId) : []));
  const [selected, setSelected] = useState(0);
  const [announced, setAnnounced] = useState("");
  const session = useRef<ReturnType<typeof searchSession> | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // The account is known once /me answers; a window opened before that reads
  // the list when it is.
  useEffect(() => {
    if (viewerId) setRecent(readRecent(viewerId));
  }, [viewerId]);

  useEffect(() => {
    session.current = searchSession(searchFor, setState);
    input.current?.focus();
    return () => session.current?.dispose();
  }, []);

  const q = state.q;
  const trimmed = q.trim();

  const remember = (words: string) => {
    if (viewerId && words.trim()) setRecent(keepRecent(viewerId, words));
  };
  const go = (href: string) => {
    remember(q);
    onClose();
    router.push(href);
  };
  const ask = () => {
    if (!trimmed) return;
    remember(q);
    onClose();
    fillComposer(trimmed);
  };

  // What is drawn: the server's answer once there is one, the names held
  // here until then and after a failure.
  const answer = state.answer;
  const threadHits: { id: string; name: string; row: ThreadRow | null }[] = answer
    ? answer.threads.map((t) => ({ ...t, row: byId.get(t.id) ?? null }))
    : nameMatches(threads, q).map((t) => ({ id: t.id, name: t.name, row: t }));
  const looseHit = looseSummary !== null && (answer ? answer.loose : looseMatches(q));
  const threadName = (id: string, loose: boolean) => (loose ? SEARCH_COPY.loose : (byId.get(id)?.name ?? ""));
  const threadMark = (id: string, loose: boolean, size: number) => {
    const t = loose ? null : byId.get(id);
    return <ThreadIcon icon={t?.icon ?? DEFAULT_THREAD_ICON} hue={t?.hue ?? 1} seed={id} size={size} />;
  };
  const rowMeta = (row: SearchRow) =>
    row.archived ? SEARCH_COPY.archived : (foundMeta(row, zone, today) ?? KIND_WORDS[row.type] ?? null);

  const options: { heading: string | null; items: Option[]; chips?: boolean }[] = [];
  if (!trimmed) {
    if (recent.length) {
      options.push({
        heading: SEARCH_COPY.headings.recent,
        items: recent.map((words) => ({
          id: `recent-${words}`,
          label: words,
          run: () => type(words),
          node: (
            <>
              <Icon name="clock" size={16} className={styles.quiet} />
              <span className={styles.title}>{words}</span>
              <button
                type="button"
                className={styles.remove}
                aria-label={SEARCH_COPY.remove(words)}
                onClick={(event) => {
                  event.stopPropagation();
                  if (viewerId) setRecent(dropRecent(viewerId, words));
                }}
              >
                <Icon name="x" size={15} />
              </button>
            </>
          ),
        })),
      });
    }
    // Every thread as a chip, in the person's own order, reached by the arrows.
    if (threads.length) {
      options.push({
        heading: SEARCH_COPY.headings.threads,
        chips: true,
        items: threads.map((t) => ({
          id: `chip-${t.id}`,
          label: t.name,
          run: () => go(`/threads/${t.id}`),
          node: (
            <>
              <ThreadIcon icon={t.icon} hue={t.hue} seed={t.id} size={20} />
              <span>{t.name}</span>
            </>
          ),
        })),
      });
    }
  } else {
    const threadItems: Option[] = [
      ...(looseHit
        ? [
            {
              id: "thread-loose",
              label: SEARCH_COPY.loose,
              run: () => go("/threads/loose"),
              node: (
                <>
                  {threadMark("loose", true, 32)}
                  <span className={styles.text}>
                    <span className={styles.title}><Marked text={SEARCH_COPY.loose} query={q} mode="any" /></span>
                  </span>
                </>
              ),
            },
          ]
        : []),
      ...threadHits.map((t) => ({
        id: `thread-${t.id}`,
        label: t.name,
        run: () => go(`/threads/${t.id}`),
        node: (
          <>
            <ThreadIcon icon={t.row?.icon ?? DEFAULT_THREAD_ICON} hue={t.row?.hue ?? 1} seed={t.id} size={32} />
            <span className={styles.text}>
              <span className={styles.title}><Marked text={t.name} query={q} mode="any" /></span>
              {t.row?.meta ? <span className={styles.meta}>{t.row.meta}</span> : null}
            </span>
          </>
        ),
      })),
    ];
    if (threadItems.length) options.push({ heading: SEARCH_COPY.headings.threads, items: threadItems });
    if (answer?.rows.length) {
      options.push({
        heading: SEARCH_COPY.headings.rows,
        items: answer.rows.map((row) => {
          const meta = rowMeta(row);
          const params = new URLSearchParams({ [ROW_PARAM]: row.id, ...(row.archived ? { [ARCHIVED_PARAM]: "1" } : {}) });
          return {
            id: `row-${row.id}`,
            label: rowLabel({ title: row.title, kind: KIND_WORDS[row.type] ?? null, date: row.archived ? null : foundMeta(row, zone, today), threadName: threadName(row.threadId, row.loose), archived: row.archived }),
            run: () => go(`${row.loose ? "/threads/loose" : `/threads/${row.threadId}`}?${params.toString()}`),
            node: (
              <>
                <span className={styles.well}><Icon name={ROW_GLYPHS[row.type] ?? NOTE_GLYPH} size={16} /></span>
                <span className={styles.text}>
                  <span className={styles.title}><Marked text={row.title} query={q} mode="word" /></span>
                  <span className={styles.meta}>
                    {meta ? <>{meta}<span aria-hidden="true"> · </span></> : null}
                    {threadMark(row.threadId, row.loose, 16)}
                    <span>{threadName(row.threadId, row.loose)}</span>
                  </span>
                </span>
              </>
            ),
          };
        }),
      });
    }
    if (answer?.notes.length) {
      options.push({
        heading: SEARCH_COPY.headings.notes,
        items: answer.notes.map((note) => ({
          id: `note-${note.id}`,
          label: `${note.text}, note, in ${threadName(note.threadId, note.loose)}`,
          run: () => go(note.loose ? "/threads/loose" : `/threads/${note.threadId}?${NOTE_PARAM}=${note.id}`),
          node: (
            <>
              <span className={styles.well}><Icon name={NOTE_GLYPH} size={16} /></span>
              <span className={styles.text}>
                <span className={styles.title}><Marked text={note.text} query={q} mode="word" /></span>
                <span className={styles.meta}>
                  {threadMark(note.threadId, note.loose, 16)}
                  <span>{threadName(note.threadId, note.loose)}</span>
                </span>
              </span>
            </>
          ),
        })),
      });
    }
    if (answer?.memories.length) {
      options.push({
        heading: SEARCH_COPY.headings.memories,
        items: answer.memories.map((memory) => ({
          id: `memory-${memory.id}`,
          label: `${memory.text}, ${SEARCH_COPY.memory.toLowerCase()}`,
          run: () => go(`/memories?${MEMORY_PARAM}=${memory.id}`),
          node: (
            <>
              <span className={styles.well}><Icon name="cloudy" size={16} /></span>
              <span className={styles.text}>
                <span className={styles.title}><Marked text={memory.text} query={q} mode="word" /></span>
                <span className={styles.meta}>{SEARCH_COPY.memory}</span>
              </span>
            </>
          ),
        })),
      });
    }
    options.push({
      heading: null,
      items: [
        {
          id: "ask",
          label: SEARCH_COPY.ask(trimmed),
          run: () => ask(),
          node: (
            <>
              <span className={styles.askWell}><Icon name="sparkles" size={16} /></span>
              <span className={styles.title}>{SEARCH_COPY.ask(trimmed)}</span>
            </>
          ),
        },
      ],
    });
  }

  const flat = options.flatMap((group) => group.items);
  const found = flat.length - (trimmed ? 1 : 0);
  const current = flat[Math.min(selected, flat.length - 1)] ?? null;
  const showsNothing = trimmed && searchLetters(trimmed) >= 2 && answer !== null && found === 0;

  // The count, once typing pauses.
  useEffect(() => {
    if (!trimmed || !answer) {
      setAnnounced("");
      return;
    }
    const timer = setTimeout(() => setAnnounced(searchCount(found)), ANNOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed, found, answer]);

  function type(next: string) {
    setSelected(0);
    session.current?.type(next.slice(0, QUERY_CHARS));
  }

  function keys(event: React.KeyboardEvent) {
    if (event.key === "Tab") {
      // The window is modal: focus stays in its field.
      event.preventDefault();
      input.current?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) ask();
      else if (current) current.run(false);
      else if (trimmed) remember(q);
    }
  }

  return (
    <div className={styles.layer}>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <div
        className={styles.window}
        role="dialog"
        aria-modal="true"
        aria-label={SEARCH_COPY.title}
        onKeyDown={keys}
        // A click anywhere in the window leaves focus in the field, so the
        // keys keep working; the click itself still lands.
        onMouseDown={(event) => {
          if (event.target !== input.current) event.preventDefault();
        }}
      >
        <div className={styles.field}>
          <Icon name="search" size={18} className={styles.quiet} />
          <input
            ref={input}
            className={styles.input}
            value={q}
            maxLength={QUERY_CHARS}
            placeholder={SEARCH_COPY.placeholder}
            aria-label={SEARCH_COPY.title}
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls="search-results"
            aria-activedescendant={current ? `search-${current.id}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => type(event.target.value)}
          />
        </div>
        <div className={styles.results} id="search-results" role="listbox" aria-label={SEARCH_COPY.title}>
          {state.failed ? (
            <p className={styles.failed}>
              {SEARCH_COPY.failed}{" "}
              <button type="button" className={styles.retry} onClick={() => session.current?.retry()}>
                {SEARCH_COPY.retry}
              </button>
            </p>
          ) : null}
          {showsNothing ? <p className={styles.nothing}>{SEARCH_COPY.nothing(trimmed)}</p> : null}
          {options.map((group, g) => (
            <div key={group.heading ?? `group-${g}`} role="group" aria-labelledby={group.heading ? `search-h-${g}` : undefined} aria-label={group.heading ? undefined : SEARCH_COPY.ask(trimmed)}>
              {group.heading ? (
                <div id={`search-h-${g}`} className={styles.heading}>
                  {group.heading}
                </div>
              ) : null}
              <div className={group.chips ? styles.chips : undefined} role="presentation">
              {group.items.map((item) => {
                const index = flat.indexOf(item);
                return (
                  <div
                    key={item.id}
                    id={`search-${item.id}`}
                    role="option"
                    aria-selected={index === selected}
                    aria-label={item.label}
                    className={group.chips ? styles.chip : item.id === "ask" ? styles.ask : styles.row}
                    data-on={index === selected ? true : undefined}
                    onMouseMove={() => setSelected(index)}
                    onClick={() => item.run(false)}
                  >
                    {item.node}
                  </div>
                );
              })}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.foot} aria-hidden="true">
          <span><kbd>↑↓</kbd> {SEARCH_COPY.keys.move}</span>
          <span><kbd>↵</kbd> {SEARCH_COPY.keys.open}</span>
          <span><kbd>{searchKey()}↵</kbd> {SEARCH_COPY.keys.ask}</span>
          <span><kbd>esc</kbd> {SEARCH_COPY.keys.close}</span>
        </div>
        <div className={styles.announce} role="status" aria-live="polite">
          {announced}
        </div>
      </div>
    </div>
  );
}
