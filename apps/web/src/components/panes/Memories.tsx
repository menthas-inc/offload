"use client";

// 040. Memories: what offload knows about you across your threads.
//
// From ui_kits/memories_tab, the web branch. One pane: PaneHead with the
// List | Map switch, search and the plus as its tools, the list beneath, and
// the editor as a 400px pane on the right while one is open. Every sentence
// and every rule about a memory's kind and origin comes from @offload/widgets,
// so the phones say the same words about the same row.
//
// Forget is drawn first and written second, with eight seconds of Undo in the
// memory's place (2026-10-18), which is `perform` as everywhere else. An add or a change is the
// person's own edit and waits for the server: a refusal belongs under the
// field, which stays open.
//
// 042. Remind me, on a memory offload will remind about, is the settings
// `Switch`: drawn first and written second, put back with the toast's Retry
// on a failure. No Undo, since this editor has none.

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  MEMORY_COPY,
  MEMORY_KINDS,
  MEMORY_TEXT_CHARS,
  matchesMemory,
  memoryMeta,
  memoryOrigin,
  memoryRefusal,
  memorySections,
  remindSwitchShown,
  shownText,
  storedText,
  toSecondPerson,
  type MemoryKindId,
  type MemoryList,
  type MemoryView,
  type UndoEntry,
} from "@offload/widgets";
import { Icon } from "../Icon";
import { Switch } from "../Switch";
import { PaneHead } from "../shell/PaneHead";
import { useToast } from "../shell/Toast";
import { Line } from "../shell/InPlace";
import { Returned } from "../shell/UndoLine";
import { useChanged } from "../shell/threads-context";
import { useInPlace } from "../../lib/undo";
import { Segmented } from "./Appearance";
import { QuietEmpty } from "./QuietEmpty";
import { MemoriesMap } from "../memories/MemoriesMap";
import { perform, useWrites } from "../../lib/optimistic";
import { addMemory, changeMemory, forgetMemory, readMemories, restoreMemory } from "../../lib/memories";
import { setReminders } from "../../lib/reminders";
import pane from "../../app/(shell)/shell.module.css";
import people from "../people/people.module.css";
import styles from "../../app/(shell)/memories.module.css";

type View = "list" | "map";
type Sort = "kind" | "new";
/** Which memory the editor holds: one by id, a new one, or none. */
type Open = { id: string } | { fresh: true; kind: MemoryKindId } | null;

const EMPTY: MemoryList = { memories: [], kinds: [], full: false, rulesFull: false };

export function MemoriesPane({
  openId = null,
}: {
  /** 042. A door's `?memory=`, from Today's Reminders: opened once, when the
   *  list holds it. */
  openId?: string | null;
} = {}) {
  const toast = useToast();
  const [state, setState] = useState<"loading" | "failed" | "ready">("loading");
  const [list, setList] = useState<MemoryList>(EMPTY);
  const [view, setView] = useState<View>("list");
  const [sort, setSort] = useState<Sort>("kind");
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Open>(null);

  const idle = useRef<() => boolean>(() => true);
  const reload = useCallback(async () => {
    const read = await readMemories();
    if (read.kind === "ok" && idle.current()) setList(read.list);
  }, []);
  const writes = useWrites(reload);
  idle.current = writes.idle;
  // 048. The quiet read, never `load`, which draws the spinner.
  useChanged(["memories"], () => void reload());

  const load = useCallback(async () => {
    setState("loading");
    const read = await readMemories();
    if (read.kind === "failed") return setState("failed");
    setList(read.list);
    setState("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const doorOpened = useRef<string | null>(null);
  useEffect(() => {
    if (!openId || doorOpened.current === openId || state !== "ready") return;
    doorOpened.current = openId;
    if (list.memories.some((m) => m.id === openId)) setOpen({ id: openId });
  }, [openId, state, list]);

  const forget = (memory: MemoryView) => {
    setOpen(null);
    void perform(
      {
        apply: () => setList((now) => ({ ...now, memories: now.memories.filter((m) => m.id !== memory.id) })),
        revert: () =>
          setList((now) => (now.memories.some((m) => m.id === memory.id) ? now : { ...now, memories: [...now.memories, memory] })),
        write: () => forgetMemory(memory.id),
        unwrite: () => restoreMemory(memory.id),
        did: MEMORY_COPY.forgotten,
        failed: MEMORY_COPY.saveFailed,
        unfailed: MEMORY_COPY.unfailed,
        place: { id: memory.id, icon: "cloudy", form: "slot" },
      },
      toast,
      writes,
    );
  };

  const remind = (memory: MemoryView, on: boolean) => {
    const set = (reminders: MemoryView["reminders"]) =>
      setList((now) => ({ ...now, memories: now.memories.map((m) => (m.id === memory.id ? { ...m, reminders } : m)) }));
    void perform(
      {
        apply: () => set(on ? "on" : "off"),
        revert: () => set(memory.reminders ?? null),
        write: () => setReminders("memory", memory.id, on),
        failed: MEMORY_COPY.saveFailed,
      },
      toast,
      writes,
    );
  };

  // The kind the map is zoomed into, kept without a render per frame.
  const focused = useRef<MemoryKindId | null>(null);
  const focusKind = useCallback((kind: MemoryKindId | null) => {
    focused.current = kind;
  }, []);

  const closeSearch = () => {
    setSearching(false);
    setQuery("");
  };

  const plus = (
    <button
      type="button"
      className={pane.tool}
      aria-label="New memory"
      title="New memory"
      // From a map zoomed into a kind, that kind; otherwise About.
      onClick={() => setOpen({ fresh: true, kind: (view === "map" && focused.current) || "about" })}
    >
      <Icon name="plus" size={16} />
    </button>
  );

  const shown = list.memories.filter((m) => matchesMemory(m, query));
  const sections = memorySections(shown, sort);
  // 2026-10-18. The slots over the whole list rather than per section, so a
  // forgotten memory's line stays when its section empties: it goes before
  // the memory drawn after it, under its own heading while that has any left,
  // and at the foot when nothing follows (null).
  const order = useInPlace(sections.flatMap((section) => section.rows), (m) => m.id);
  const slotsBefore = new Map<string | null, UndoEntry[]>();
  const lines = new Map<string, UndoEntry>();
  let waiting: UndoEntry[] = [];
  for (const one of order) {
    if ("slot" in one) waiting.push(one.entry);
    else {
      if (waiting.length > 0) slotsBefore.set(one.row.id, waiting);
      waiting = [];
      if (one.line) lines.set(one.row.id, one.line);
    }
  }
  if (waiting.length > 0) slotsBefore.set(null, waiting);
  const slots = (before: string | null) => slotsBefore.get(before)?.map((entry) => <Line key={entry.id} entry={entry} />);
  const editing = open && "id" in open ? (list.memories.find((m) => m.id === open.id) ?? null) : null;
  const editor =
    open && (editing || "fresh" in open) ? (
      <MemoryEditor
        key={editing?.id ?? "new"}
        memory={editing}
        kind={editing?.kind ?? ("fresh" in open ? open.kind : "about")}
        onClose={() => setOpen(null)}
        onForget={forget}
        onRemind={remind}
        onSaved={(message) => {
          setOpen(null);
          toast.show(message);
          void reload();
        }}
        onGone={() => {
          setOpen(null);
          void reload();
        }}
      />
    ) : null;

  // Empty keeps its screen, and the plus opens the editor beside it.
  if (state === "ready" && list.memories.length === 0) {
    return (
      <div className={styles.emptyRow}>
        <div className={styles.emptyMain}>
          <QuietEmpty title={MEMORY_COPY.title} line={MEMORY_COPY.empty} tools={plus} />
        </div>
        {editor}
      </div>
    );
  }

  return (
    <>
      <PaneHead
        title={MEMORY_COPY.title}
        big
        tools={
          state === "ready" ? (
            <>
              <Segmented<View>
                label={MEMORY_COPY.view}
                options={["list", "map"]}
                labelFor={(one) => (one === "list" ? "List" : "Map")}
                iconFor={(one) => one}
                value={view}
                onChange={setView}
              />
              <button
                type="button"
                className={pane.tool}
                aria-label="Search"
                aria-pressed={searching}
                title="Search"
                onClick={() => (searching ? closeSearch() : setSearching(true))}
              >
                <Icon name="search" size={16} />
              </button>
              {plus}
            </>
          ) : null
        }
      />

      {searching ? (
        <div className={styles.search}>
          <label className={styles.searchField}>
            <Icon name="search" size={15} />
            <input
              type="search"
              autoFocus
              placeholder={MEMORY_COPY.search}
              aria-label={MEMORY_COPY.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") closeSearch();
              }}
            />
          </label>
        </div>
      ) : null}

      <div className={styles.columns}>
        {/* The map gets a column of its own, so the list's scroll never moves it. */}
        <div key={view} className={view === "map" && state === "ready" ? styles.mapColumn : styles.main}>
          {state === "loading" ? <span className={pane.paneSpinner} role="status" aria-label="loading" /> : null}
          {state === "failed" ? (
            <p className={styles.failed} role="alert">
              {MEMORY_COPY.loadFailed}
              <button type="button" className={people.ghost} onClick={() => void load()}>
                Try again
              </button>
            </p>
          ) : null}
          {state === "ready" && view === "map" ? (
            <MemoriesMap
              memories={list.memories}
              places={list.kinds ?? []}
              query={query}
              openId={editing?.id ?? null}
              onOpen={(id) => setOpen({ id })}
              onFocusKind={focusKind}
            />
          ) : null}
          {state === "ready" && view === "list" ? (
            <div className={styles.inner}>
              <Segmented<Sort>
                label="Sort"
                options={["kind", "new"]}
                labelFor={(one) => (one === "kind" ? "By kind" : "Newest")}
                value={sort}
                onChange={setSort}
              />
              {list.full ? <p className={styles.line}>{MEMORY_COPY.full}</p> : null}
              {shown.length === 0 && query.trim() ? <p className={styles.nothing}>{MEMORY_COPY.nothingSays(query.trim())}</p> : null}
              {sections.map((section) => (
                <section key={section.key}>
                  <h2 className={styles.head} data-k={section.kind ?? undefined}>
                    {section.kind ? <span className={styles.headDot} aria-hidden="true" /> : null}
                    {section.title}
                    <em>{section.rows.length}</em>
                  </h2>
                  {section.rows.map((memory) => {
                    const line = lines.get(memory.id);
                    return (
                      <Fragment key={memory.id}>
                        {slots(memory.id)}
                        <Returned id={memory.id}>
                          <MemoryEntry memory={memory} dot={sort === "new"} on={editing?.id === memory.id} onOpen={() => setOpen({ id: memory.id })} />
                        </Returned>
                        {line ? <Line entry={line} /> : null}
                      </Fragment>
                    );
                  })}
                </section>
              ))}
              {slots(null)}
            </div>
          ) : null}
        </div>

        {editor}
      </div>
    </>
  );
}

function MemoryEntry({ memory, dot, on, onOpen }: { memory: MemoryView; dot: boolean; on: boolean; onOpen: () => void }) {
  const meta = memoryMeta(memory);
  return (
    <button
      type="button"
      className={styles.row}
      data-k={memory.kind}
      data-dot={dot || undefined}
      data-memory={memory.id}
      aria-current={on || undefined}
      onClick={onOpen}
    >
      {dot ? <span className={styles.rowDot} aria-hidden="true" /> : null}
      <span className={styles.rowText}>
        {/* Stored about the person, read to them (F4). */}
        <span className={styles.sentence}>{toSecondPerson(memory.text)}</span>
        <span className={styles.meta}>
          {meta.learned ? (
            <span className={styles.learned}>
              <Icon name="sparkles" size={12} />
              {meta.label}
            </span>
          ) : (
            <span>{meta.label}</span>
          )}
          <span aria-hidden="true">·</span>
          <span>{meta.day}</span>
        </span>
      </span>
    </button>
  );
}

function MemoryEditor({
  memory,
  kind: firstKind,
  onClose,
  onForget,
  onRemind,
  onSaved,
  onGone,
}: {
  memory: MemoryView | null;
  kind: MemoryKindId;
  onClose: () => void;
  onForget: (memory: MemoryView) => void;
  onRemind: (memory: MemoryView, on: boolean) => void;
  onSaved: (message: string) => void;
  /** Forgotten in another window while it was open. */
  onGone: () => void;
}) {
  const toast = useToast();
  // Stored about the person and shown to them (F4), by the rule the phones'
  // editor uses: the field holds the person's form and a save writes the
  // stored one.
  const [draft, setDraft] = useState(() => (memory ? shownText(memory.text) : ""));
  const [kind, setKind] = useState<MemoryKindId>(firstKind);
  const [refused, setRefused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const words = draft.replace(/\s+/g, " ").trim();
  const text = storedText(memory?.text ?? null, draft);
  const severs = memory?.origin === "answered" && text !== memory.text;

  const save = async (): Promise<void> => {
    if (!words || busy) return;
    if (memory && text === memory.text && kind === memory.kind) return onClose();
    setBusy(true);
    const result = memory
      ? await changeMemory(memory.id, {
          // A change that makes a rule carries its words: the server refuses one without.
          ...(text !== memory.text || (kind === "rules" && kind !== memory.kind) ? { text } : {}),
          ...(kind !== memory.kind ? { kind } : {}),
        })
      : await addMemory(text, kind);
    setBusy(false);
    if (result.kind === "ok") return onSaved(memory ? MEMORY_COPY.saved : MEMORY_COPY.remembered);
    if (result.kind === "refused") return setRefused(memoryRefusal(result.error));
    if (result.kind === "gone") return onGone();
    toast.show(MEMORY_COPY.saveFailed, { label: "Retry", onPress: save });
  };

  const origin = memory ? memoryOrigin(memory) : null;

  return (
    <aside
      className={styles.editor}
      aria-label={memory ? "Memory" : "New memory"}
      // Escape cancels from anywhere in the editor, not only the field.
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className={styles.editorHead}>
        <span>{memory ? "Memory" : "New memory"}</span>
        <button type="button" className={pane.tool} aria-label="Close" title="Close" onClick={onClose}>
          <Icon name="x" size={16} />
        </button>
      </div>

      <div className={styles.field}>
        <textarea
          ref={field}
          rows={3}
          maxLength={MEMORY_TEXT_CHARS}
          placeholder={MEMORY_COPY.placeholder}
          aria-label="Memory"
          value={draft}
          onChange={(event) => {
            // One sentence: a pasted line break becomes a space.
            setDraft(event.target.value.replace(/\n/g, " "));
            setRefused(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (!event.shiftKey) void save();
            }
          }}
        />
        <div className={styles.count}>
          {draft.length}/{MEMORY_TEXT_CHARS}
        </div>
      </div>
      {refused ? (
        <p className={styles.refused} role="alert">
          {refused}
        </p>
      ) : null}

      <div className={styles.kindLabel}>Kind</div>
      <div className={styles.kinds} role="radiogroup" aria-label="Kind">
        {MEMORY_KINDS.map((one) => (
          <button
            key={one.kind}
            type="button"
            role="radio"
            aria-checked={one.kind === kind}
            className={styles.kind}
            data-k={one.kind}
            onClick={() => {
              setKind(one.kind);
              setRefused(null);
            }}
          >
            <Icon name={one.glyph} size={16} />
            <span>{one.name}</span>
          </button>
        ))}
      </div>

      {origin ? (
        <div className={styles.why}>
          <Icon name={origin.glyph} size={16} />
          <span>
            <b>{origin.lead}</b>
            {origin.rest}
          </span>
        </div>
      ) : (
        <div className={styles.why}>
          <Icon name="compass" size={16} />
          <span>{MEMORY_COPY.newRule}</span>
        </div>
      )}
      {severs ? <p className={styles.sever}>{MEMORY_COPY.sever}</p> : null}

      {memory && remindSwitchShown(memory, true) ? (
        <div className={pane.editSwitch}>
          <Switch label="Remind me" checked={memory.reminders === "on"} onChange={(on) => onRemind(memory, on)} />
        </div>
      ) : null}

      <div className={styles.foot}>
        {memory ? (
          <button type="button" className={styles.forget} onClick={() => onForget(memory)}>
            <Icon name="trash-2" size={16} />
            Forget
          </button>
        ) : null}
        <button type="button" className={people.ghost} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={people.primary} disabled={!words || busy} onClick={() => void save()}>
          {memory ? "Save" : "Add"}
        </button>
      </div>
    </aside>
  );
}
