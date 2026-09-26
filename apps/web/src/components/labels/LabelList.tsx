"use client";

// 025. The label's list: every row in the thread with a tick, for one label.
// Reached from the plus (New label), from Group with labels, from a mark on a
// row and from a label chip's context menu or pencil. A name field led by the
// colour's dot, "Tick what goes under it.", the rows under the thread's own
// headings, and a foot of Cancel and Label N; for an existing label, Rename,
// Colour and Delete too, and Save.
//
// It reads its rows page by page from the server, with the tick the server
// computed, and keeps what was ticked while later pages arrive. It writes
// nothing itself: the page makes the one write and offers the one Undo.

import { useEffect, useRef, useState } from "react";
import { countWord, readEveryPage, widgetsFor } from "@offload/widgets";
import styles from "./labels.module.css";
import people from "../people/people.module.css";
import pane from "../../app/(shell)/shell.module.css";
import { Modal } from "../people/Modal";
import { Icon } from "../Icon";
import { LabelDot, LabelMark } from "./LabelMark";
import { fetchContent, type ContentRow, type Note } from "../../lib/threads";
import type { Label, Rows } from "../../lib/labels";

const NAME_CHARS = 24;
const HEADINGS: Record<string, string> = { todo: "To do", map: "Places", files: "Files" };

export interface ListSave {
  name: string;
  colour: number | undefined;
  add: Required<Rows>;
  remove: Required<Rows>;
}

export function LabelList({
  threadId,
  label,
  labels,
  notes,
  widgets,
  freeColour,
  line,
  onSave,
  onDelete,
  onClose,
}: {
  threadId: string;
  /** The label being edited, or null for a new one. */
  label: Label | null;
  /** Every label in the thread, for the colours taken and the small marks. */
  labels: Label[];
  notes: Note[];
  widgets: string[] | undefined;
  /** The colour a new label will take. */
  freeColour: number;
  /** A refusal from the last save, said under the name field. */
  line: string | null;
  onSave: (save: ListSave) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<(ContentRow & { ticked?: boolean })[] | null>(null);
  const [changed, setChanged] = useState<Map<string, boolean>>(new Map());
  const [name, setName] = useState(label?.name ?? "");
  const [colour, setColour] = useState<number>(label?.colour ?? freeColour);
  const [renaming, setRenaming] = useState(label === null);
  const [colouring, setColouring] = useState(false);
  const [asking, setAsking] = useState(false);
  const [tooLong, setTooLong] = useState(false);
  const [unread, setUnread] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    setUnread(false);
    void readEveryPage<ContentRow & { ticked?: boolean }>(
      (cursor) => fetchContent(threadId, { ...(cursor ? { cursor } : {}), ...(label ? { ticksFor: label.id } : {}) }),
      setRows,
      () => live.current,
    ).then((read) => {
      if (!read) setUnread(true);
    });
    return () => {
      live.current = false;
    };
  }, [threadId, label, attempt]);

  const noteTicked = (note: Note) => (label ? note.labels.includes(label.id) : false);
  const isOn = (key: string, initial: boolean) => changed.get(key) ?? initial;
  const flip = (key: string, initial: boolean) =>
    setChanged((current) => {
      const next = new Map(current);
      const now = !(current.get(key) ?? initial);
      if (now === initial) next.delete(key);
      else next.set(key, now);
      return next;
    });

  const content = rows ?? [];
  const sections = widgetsFor(content, widgets);
  const inSections = new Set(sections.flatMap((s) => s.rows.map((r) => r.id)));
  const rest = content.filter((row) => !inSections.has(row.id));

  const count =
    content.filter((row) => isOn(`c:${row.id}`, row.ticked === true)).length +
    notes.filter((note) => isOn(`n:${note.id}`, noteTicked(note))).length;

  function save(): void {
    const clean = name.trim().replace(/^#+/, "").replace(/\s+/g, " ").trim();
    if ([...clean].length > NAME_CHARS) {
      setTooLong(true);
      return;
    }
    if (!clean) return;
    const add: Required<Rows> = { content: [], notes: [] };
    const remove: Required<Rows> = { content: [], notes: [] };
    for (const [key, on] of changed) {
      const [kind, id] = [key.slice(0, 1), key.slice(2)];
      (on ? add : remove)[kind === "c" ? "content" : "notes"].push(id);
    }
    onSave({ name: clean, colour: colour === label?.colour ? undefined : colour, add, remove });
  }

  const others = (ids: string[]) =>
    ids
      .filter((id) => id !== label?.id)
      .map((id) => labels.find((l) => l.id === id))
      .filter((l): l is Label => l !== undefined);

  const option = (key: string, initial: boolean, title: string, carried: string[]) => {
    const on = isOn(key, initial);
    const small = others(carried);
    return (
      <li key={key}>
        <button type="button" className={styles.option} role="checkbox" aria-checked={on} onClick={() => flip(key, initial)}>
          <span className={styles.optionName}>
            {title}
            {small.length > 0 ? (
              <span className={styles.others}>
                {small.map((l) => (
                  <LabelMark key={l.id} color={l.colour}>
                    {l.name}
                  </LabelMark>
                ))}
              </span>
            ) : null}
          </span>
          <span className={styles.tick} data-on={on ? true : undefined}>
            {on ? <Icon name="check" size={13} /> : null}
          </span>
        </button>
      </li>
    );
  };

  const taken = (c: number) => labels.find((l) => l.colour === c && l.id !== label?.id);

  return (
    <Modal label={label ? label.name : "New label"} wide onClose={onClose}>
      <h2 className={people.modalTitle}>{label ? label.name : "New label"}</h2>
      <div className={styles.nameField} style={{ marginTop: "var(--space-5)" }}>
        <LabelDot colour={colour} size={10} />
        <input
          value={name}
          readOnly={!renaming}
          maxLength={NAME_CHARS + 4}
          placeholder="Name it"
          aria-label="Label name"
          onChange={(event) => {
            setName(event.target.value);
            setTooLong(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              save();
            }
          }}
        />
      </div>
      {tooLong ? <p className={styles.line}>A label is {NAME_CHARS} characters at most.</p> : null}
      {line ? <p className={styles.line}>{line}</p> : null}
      <p className={styles.hint}>Tick what goes under it.</p>

      {unread ? (
        <p className={styles.unread}>
          <span className={styles.line}>Couldn&apos;t load everything</span>
          <button type="button" className={people.ghost} onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </p>
      ) : null}
      <div className={styles.list}>
        {rows === null ? (
          unread ? null : <span className={pane.paneSpinner} role="status" aria-label="loading" />
        ) : (
          <>
            {sections.map((section) => (
              <section key={section.kind}>
                <h3 className={styles.section}>{HEADINGS[section.kind] ?? "Everything else"}</h3>
                <ul className={styles.options}>{section.rows.map((row) => option(`c:${row.id}`, row.ticked === true, row.title, row.labels))}</ul>
              </section>
            ))}
            {notes.length > 0 ? (
              <section>
                <h3 className={styles.section}>Notes</h3>
                <ul className={styles.options}>{notes.map((note) => option(`n:${note.id}`, noteTicked(note), note.text, note.labels))}</ul>
              </section>
            ) : null}
            {rest.length > 0 ? (
              <section>
                <h3 className={styles.section}>{sections.length > 0 ? "Everything else" : "Everything in here"}</h3>
                <ul className={styles.options}>{rest.map((row) => option(`c:${row.id}`, row.ticked === true, row.title, row.labels))}</ul>
              </section>
            ) : null}
          </>
        )}
      </div>

      {label ? (
        <div className={styles.foot}>
          <button type="button" className={people.ghost} onClick={() => setRenaming(true)} disabled={renaming}>
            Rename
          </button>
          <button type="button" className={people.ghost} onClick={() => setColouring((v) => !v)} aria-expanded={colouring}>
            Colour
          </button>
          {asking ? null : (
            <button type="button" className={people.ghost} onClick={() => setAsking(true)}>
              Delete
            </button>
          )}
        </div>
      ) : null}
      {colouring ? (
        <div className={styles.swatches} role="radiogroup" aria-label="Colour">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((c) => {
            const holder = taken(c);
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={colour === c}
                aria-label={holder ? `Colour ${c}, ${holder.name}'s. Picking it swaps.` : `Colour ${c}`}
                className={styles.swatch}
                data-colour={c}
                data-on={colour === c ? true : undefined}
                onClick={() => setColour(c)}
              >
                {colour === c ? <Icon name="check" size={16} /> : holder ? <span className={styles.swatchInitial}>{[...holder.name][0]}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {asking && label ? (
        <div className={styles.foot} role="alertdialog" aria-label={`Delete ${label.name}`}>
          <span className={styles.optionName}>
            Delete {label.name}? It comes off {countWord(label.count)}. Nothing else is deleted.
          </span>
          <button type="button" className={people.ghost} onClick={() => setAsking(false)}>
            Cancel
          </button>
          <button type="button" className={people.danger} onClick={onDelete}>
            Delete
          </button>
        </div>
      ) : (
        <div className={styles.actions}>
          <button type="button" className={people.ghost} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={people.primary}
            disabled={!name.trim() || (label === null && count === 0)}
            onClick={save}
          >
            {label ? "Save" : `Label ${count}`}
          </button>
        </div>
      )}
    </Modal>
  );
}
