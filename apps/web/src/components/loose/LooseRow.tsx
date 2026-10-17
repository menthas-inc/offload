"use client";

// 028. An entry not in a thread, as a row.
//
// From `LooseRow` in ui_kits/mobile_app/LooseParts.jsx: the type tile, the
// title, and the suggestion under it, with the row aligning to its top. No
// thread slot, no labels, no handle, and no meta line: the tile already says
// what it is (2026-10-05). A content row is the thread page's own
// `ContentRowView`, with its lead tile and its hover tools, edit and delete,
// so it opens and acts exactly as it does there. A to-do leads with the
// thread page's checkbox, since ticking it is the thing people come to do. A
// note is drawn the same way and opens the thread page's note editor in its
// place.

import { Icon } from "../Icon";
import { ContentRowView } from "../panes/ContentRowView";
import { rowIcon } from "../panes/Thread";
import { Suggestion } from "./Suggestion";
import type { LooseRows } from "./useLooseRows";
import { entryTitle, type LooseEntry } from "../../lib/loose";
import pane from "../../app/(shell)/shell.module.css";
import styles from "./loose.module.css";

export function LooseRow({ entry, rows }: { entry: LooseEntry; rows: LooseRows }) {
  const suggestion = entry.suggestion ? (
    <Suggestion
      title={entryTitle(entry)}
      suggestion={entry.suggestion}
      onAccept={() => rows.accept(entry)}
      onDismiss={() => rows.dismiss(entry)}
    />
  ) : null;

  if (entry.kind === "content") {
    const row = entry.row;
    return (
      <ContentRowView
        row={row}
        handlers={rows.handlers}
        checkbox={row.type === "task"}
        lead={
          row.type === "task" ? (
            <input
              type="checkbox"
              className={pane.rowCheck}
              checked={false}
              onChange={() => rows.tick(row)}
              aria-label={`Finish ${row.title}`}
            />
          ) : (
            <span className={pane.rowIcon}>
              <Icon name={rowIcon(row.type)} size={18} />
            </span>
          )
        }
        meta={suggestion}
      />
    );
  }

  const note = entry.note;
  if (rows.editingNote === note.id) {
    return (
      <div className={pane.noteRow} data-tone="neutral" data-open={true}>
        {rows.noteEditor(note)}
      </div>
    );
  }
  return (
    <div className={pane.row} data-row>
      <span className={pane.rowIcon}>
        <Icon name="text-quote" size={18} />
      </span>
      <span className={pane.rowText}>
        <button type="button" className={styles.noteTitle} data-muted={note.muted ? true : undefined} onClick={() => rows.openNote(note)}>
          {note.text}
        </button>
        {suggestion}
      </span>
    </div>
  );
}
