"use client";

// Thread layouts: the web draws what layoutFor returns (decision 10). Default
// keeps its own proven render in Thread.tsx; this is the five other layouts.
// Rows reuse ContentRowView, so a row offers the same controls whatever the
// layout arranges it into.

import { useState } from "react";
import type { LayoutPage, LayoutSection } from "@offload/widgets";
import { Icon } from "../Icon";
import { ContentRowView, type RowHandlers } from "./ContentRowView";
import { rowIcon } from "./rowIcon";
import type { ContentRow, Note } from "../../lib/threads";
import styles from "./LayoutSections.module.css";
import tstyles from "../../app/(shell)/shell.module.css";

type Page = LayoutPage<ContentRow, Note>;
type Section = LayoutSection<ContentRow, Note>;

interface Props {
  page: Page;
  handlers: RowHandlers;
  labels: { id: string; name: string; colour: number }[];
  /** Todo list's "Add an item" opens the section's quick add. */
  onAdd: (text: string) => void;
}

const isRow = (item: ContentRow | Note): item is ContentRow => "type" in item;

function Row({ row, handlers }: { row: ContentRow; handlers: RowHandlers }) {
  return (
    <ContentRowView
      row={row}
      handlers={handlers}
      meta={null}
      lead={
        <span className={tstyles.rowIcon}>
          <Icon name={rowIcon(row.type)} size={18} />
        </span>
      }
    />
  );
}

/** A label section's heading: a colour dot, the name, the count, a chevron. */
function Heading({ section, colour, open, onToggle }: { section: Extract<Section, { kind: "list" }>; colour: number | null; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={styles.heading} aria-expanded={open} onClick={onToggle}>
      {colour && colour >= 1 && colour <= 10 ? <span className={styles.dot} style={{ background: `var(--label-${colour})` }} /> : null}
      <span className={styles.headingName}>{section.heading}</span>
      {section.rows.length > 0 ? <span className={styles.headingCount}>{section.rows.length}</span> : null}
      <Icon name={open ? "chevron-down" : "chevron-right"} size={18} />
    </button>
  );
}

function Tile({ row, handlers }: { row: ContentRow; handlers: RowHandlers }) {
  const letters = row.title.trim().slice(0, 2);
  // Gallery draws link and task tiles; a link's picture is its own, a typed
  // title is lettered. Project Files draws photo/PDF tiles, which open the
  // viewer. A link opens the link, a task its sheet (6.4).
  const cover = row.type === "link" ? (row.imageUrl ?? null) : null;
  const open = () => {
    if (row.type === "link" && row.url) window.open(row.url, "_blank", "noopener,noreferrer");
    else if (row.type === "task") handlers.onEdit?.(row);
    else handlers.onOpenPhoto?.(row);
  };
  return (
    <button type="button" className={styles.tile} onClick={open}>
      <span className={styles.tileCover} data-lettered={cover ? undefined : true}>
        {cover ? <img src={cover} alt="" referrerPolicy="no-referrer" loading="lazy" className={styles.tileImg} /> : <span className={styles.tileLetters}>{letters}</span>}
        <span className={styles.tileGlyph}>
          <Icon name={rowIcon(row.type)} size={12} />
        </span>
      </span>
      <span className={styles.tileTitle}>{row.title}</span>
    </button>
  );
}

function ListSection({ section, handlers, labels, onAdd }: { section: Extract<Section, { kind: "list" }>; handlers: RowHandlers; labels: Props["labels"]; onAdd: Props["onAdd"] }) {
  const [open, setOpen] = useState(!section.foldedAtFirst);
  const [draft, setDraft] = useState("");
  const colour = section.labelId ? labels.find((l) => l.id === section.labelId)?.colour ?? null : null;
  const tiles = section.form === "tile";

  return (
    <section className={styles.block}>
      {section.heading !== null && section.folds ? (
        <Heading section={section} colour={colour} open={open} onToggle={() => setOpen((v) => !v)} />
      ) : null}
      {open ? (
        <>
          {section.add ? (
            <form
              className={styles.addRow}
              onSubmit={(event) => {
                event.preventDefault();
                if (draft.trim()) onAdd(draft.trim());
                setDraft("");
              }}
            >
              <Icon name="plus" size={20} />
              <input className={styles.addInput} placeholder="Add an item" value={draft} onChange={(event) => setDraft(event.target.value)} />
            </form>
          ) : null}
          {section.rows.length === 0 && section.heading !== null ? (
            <p className={styles.nothing}>Nothing here yet</p>
          ) : tiles ? (
            <div className={styles.grid}>
              {section.rows.map((row) => (
                <Tile key={row.id} row={row} handlers={handlers} />
              ))}
            </div>
          ) : (
            section.rows.map((row) => <Row key={row.id} row={row} handlers={handlers} />)
          )}
        </>
      ) : null}
    </section>
  );
}

function FoldSection({ heading, rows, handlers, countFirst }: { heading: string; rows: ContentRow[]; handlers: RowHandlers; countFirst?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={styles.block}>
      <button type="button" className={styles.fold} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="check" size={16} />
        <span>{countFirst ? `${rows.length} ${heading}` : `${heading} ${rows.length}`}</span>
        <Icon name={open ? "chevron-down" : "chevron-right"} size={16} />
      </button>
      {open ? rows.map((row) => <Row key={row.id} row={row} handlers={handlers} />) : null}
    </section>
  );
}

function DaySection({ section, handlers }: { section: Extract<Section, { kind: "day" }>; handlers: RowHandlers }) {
  const d = new Date(section.day + "T00:00:00");
  return (
    <section className={styles.day}>
      <div className={styles.gutter}>
        <span className={styles.weekday}>{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
        <span className={styles.date}>{d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
      </div>
      <div className={styles.entries}>
        {section.rows.map((item) =>
          isRow(item) ? <Row key={item.id} row={item} handlers={handlers} /> : <p key={item.id} className={styles.noteLine}>{item.text}</p>,
        )}
      </div>
    </section>
  );
}

export function LayoutSections({ page, handlers, labels, onAdd }: Props) {
  const [others, setOthers] = useState(false);
  const otherCount = page.others.rows.length + page.others.notes.length;

  if (others) {
    return (
      <>
        <h2 className={tstyles.section}>Other things</h2>
        {page.others.rows.map((row) => (
          <Row key={row.id} row={row} handlers={handlers} />
        ))}
        {page.others.notes.map((note) => (
          <p key={note.id} className={styles.noteLine}>{note.text}</p>
        ))}
        <button type="button" className={styles.othersRow} onClick={() => setOthers(false)}>
          <Icon name="chevron-left" size={15} /> Back to the list
        </button>
      </>
    );
  }

  return (
    <>
      {page.sections.map((section, i) => {
        if (section.kind === "list") return <ListSection key={section.key} section={section} handlers={handlers} labels={labels} onAdd={onAdd} />;
        if (section.kind === "done") return <FoldSection key={section.key} heading={section.heading} rows={section.rows} handlers={handlers} countFirst={section.key === "week"} />;
        if (section.kind === "day") return <DaySection key={section.key} section={section} handlers={handlers} />;
        if (section.kind === "files")
          return (
            <section className={styles.block} key={`files-${i}`}>
              <div className={styles.grid}>
                {section.rows.map((row) => (
                  <Tile key={row.id} row={row} handlers={handlers} />
                ))}
              </div>
            </section>
          );
        return null;
      })}

      {otherCount > 0 ? (
        <button type="button" className={styles.othersRow} onClick={() => setOthers(true)}>
          <span>{otherCount} other things in here</span>
          <Icon name="chevron-right" size={16} />
        </button>
      ) : null}
    </>
  );
}
