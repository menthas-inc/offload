"use client";

// 028. A thing not in a thread, as a row.
//
// From `LooseRow` in ui_kits/mobile_app/LooseParts.jsx: the type tile, the
// title, the meta *Photo · Monday*, and the suggestion under it, with the row
// aligning to its top. No thread slot, no labels, no handle. A content row is
// the thread page's own `ContentRowView`, with its lead tile and its hover
// tools, edit and delete, so it opens and acts exactly as it does there. A
// note is drawn the same way and opens the thread page's note editor in its
// place.

import { Icon } from "../Icon";
import { ContentRowView } from "../panes/ContentRowView";
import { rowIcon } from "../panes/Thread";
import { Suggestion } from "./Suggestion";
import type { LooseRows } from "./useLooseRows";
import { useClock } from "../../lib/clock";
import { itemTitle, metaLine, type LooseItem } from "../../lib/loose";
import pane from "../../app/(shell)/shell.module.css";
import styles from "./loose.module.css";

export function LooseRow({ item, rows }: { item: LooseItem; rows: LooseRows }) {
  const { today, zone } = useClock();
  const meta = metaLine(item, today, zone);
  const suggestion = item.suggestion ? (
    <Suggestion
      title={itemTitle(item)}
      suggestion={item.suggestion}
      onAccept={() => rows.accept(item)}
      onDismiss={() => rows.dismiss(item)}
    />
  ) : null;

  if (item.kind === "content") {
    return (
      <ContentRowView
        row={item.row}
        handlers={rows.handlers}
        lead={
          <span className={pane.rowIcon}>
            <Icon name={rowIcon(item.row.type)} size={18} />
          </span>
        }
        meta={
          <>
            <span className={pane.rowMeta}>{meta}</span>
            {suggestion}
          </>
        }
      />
    );
  }

  const note = item.note;
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
        <span className={pane.rowMeta}>
          {meta}
          {note.muted ? " · Muted" : ""}
        </span>
        {suggestion}
      </span>
    </div>
  );
}
