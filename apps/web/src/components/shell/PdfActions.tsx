"use client";

// 044. Up to two links a PDF carried, offered beside it. The one useful move
// the document exists for (check in, view the ticket, manage the booking, add
// to a wallet) and at most one more, each a label-only secondary pill with a
// leaves-offload glyph. offload opens nothing: the link is the person's own tap,
// in the browser's own tab.
//
// The pill shows no destination, so a tap shows where it leads first: "From the
// PDF. Open <host>?", with the anchor that opens it. The host is computed here
// from the url, never a string the server sent, so a look-alike shows its true
// host (hostForAction). The scheme is re-checked here before anything opens,
// because the row could be stale.
//
// Grounded in the row's own delete confirm (ContentRowView): the confirm takes
// the pills' place rather than floating, so there is no popover to position and
// nothing fires on a touch or keyboard reveal.

import { useState } from "react";
import { Icon } from "../Icon";
import { hostForAction } from "@offload/widgets";
import { webHref } from "../../lib/links";
import styles from "./pdfActions.module.css";

export interface PdfAction {
  label: string;
  url: string;
}

export function PdfActions({ actions }: { actions: PdfAction[] | null | undefined }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  // http(s) only, re-checked before anything is drawn to open: a stale row
  // cannot offer a scheme the harvest, the worker and the write already refused.
  const usable = (actions ?? []).filter((a) => webHref(a.url) !== undefined).slice(0, 2);
  if (usable.length === 0) return null;

  const open = usable.find((a) => a.url === confirming);
  if (open) {
    const host = hostForAction(open.url);
    return (
      <span className={styles.confirm} role="group" aria-label="Open this link?">
        <span className={styles.confirmText}>From the PDF. Open {host}?</span>
        <a
          className={styles.open}
          href={webHref(open.url)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setConfirming(null)}
        >
          Open
        </a>
        <button type="button" className={styles.cancel} onClick={() => setConfirming(null)}>
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span className={styles.actions}>
      {usable.map((action) => (
        <button
          key={action.url}
          type="button"
          className={styles.pill}
          // The host in the accessible name, so a screen reader hears where the
          // tap leads as a sighted reader sees it in the confirm.
          aria-label={`${action.label}, opens ${hostForAction(action.url)}`}
          onClick={() => setConfirming(action.url)}
        >
          {action.label}
          <Icon name="arrow-up-right" size={13} />
        </button>
      ))}
    </span>
  );
}
