"use client";

// 044, 050. Up to two things a dump carried that one tap can act on, offered on
// its row: a link to open, a number to call, an address to write to, plus
// Directions when the row has a place offload resolved (030). Secondary pills,
// a hairline outline, never the moss "offload did this" or the attention tone.
// offload opens nothing: every open is the person's own click.
//
// The kind decides what the pill shows, never the scheme alone:
// - Open shows the label only, so a click shows where it leads first: "From
//   the picture. Open <host>?", with the anchor that opens it. The host is
//   computed here from the url, never a string the server sent, so a
//   look-alike shows its true host (hostForAction).
// - Call and Email show the label and the destination, formatted here, and
//   open on the click: the destination is on screen before anything happens,
//   and the system's own dialer or mail draft sends nothing by itself.
// - Directions is 030's own link to the place.
// Every entry is re-checked here (isActionUrl) before it is drawn, because the
// row could be stale.
//
// The confirm takes the pills' place rather than floating, as the row's own
// delete confirm does, so there is no popover to position.

import { useState } from "react";
import { Icon } from "../Icon";
import { actionKind, directionsUrl, hostForAction, isActionUrl, shownDestination } from "@offload/widgets";
import styles from "./actions.module.css";

export interface Action {
  label: string;
  url: string;
  kind?: "open" | "call" | "email";
  source?: "pdf" | "picture" | "voice" | "typed" | "mail";
  sender?: string | null;
}

/** Where an Open came from, in the confirm's first words. */
function fromWhere(action: Action): string {
  switch (action.source) {
    case "picture":
      return "From the picture.";
    case "voice":
      return "From your voice note.";
    case "typed":
      return "From what you typed.";
    case "mail":
      return action.sender ? `From a mail from ${action.sender}.` : "From the mail.";
    default:
      return "From the PDF.";
  }
}

export function Actions({
  actions,
  place,
  canRemove = false,
  onRemove,
  removeHere = false,
}: {
  actions: Action[] | null | undefined;
  /** 050. The row's place, for Directions when it has coordinates. */
  place?: { lat: number | null; lng: number | null } | null | undefined;
  /** 044. The row is the viewer's own, so they may correct a wrong action.
   *  Author only (OFF-3), the same gate the row's delete uses. */
  canRemove?: boolean;
  /** Remove this action from the row, with the row's own Undo. */
  onRemove?: (url: string) => void;
  /** 050. Where the row is edited: Remove beside a Call or an Email, which
   *  have no confirm to hold it. */
  removeHere?: boolean;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  // A kind the server sent must be the url's own: the pill follows the kind,
  // and a mismatch is a stale or hand-made entry, dropped rather than drawn.
  const usable = (actions ?? [])
    .filter((a) => isActionUrl(a.url) && (a.kind === undefined || a.kind === actionKind(a.url)))
    .slice(0, 2);
  const there = place && place.lat !== null && place.lng !== null ? { lat: place.lat, lng: place.lng } : null;
  if (usable.length === 0 && !there) return null;
  const mayRemove = canRemove && onRemove !== undefined;

  const open = usable.find((a) => a.url === confirming);
  if (open) {
    const host = hostForAction(open.url);
    return (
      <span className={styles.confirm} role="group" aria-label="Open this link?">
        <span className={styles.confirmText}>
          {fromWhere(open)} Open {host}?
        </span>
        <a className={styles.open} href={open.url} target="_blank" rel="noopener noreferrer" onClick={() => setConfirming(null)}>
          Open
        </a>
        {mayRemove ? (
          // 044. Correcting a wrong action lives here, in the confirm, not a
          // separate sheet: quiet, author only, with the row's own Undo.
          <button
            type="button"
            className={styles.remove}
            onClick={() => {
              setConfirming(null);
              onRemove!(open.url);
            }}
          >
            Remove
          </button>
        ) : null}
        <button type="button" className={styles.cancel} onClick={() => setConfirming(null)}>
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span className={styles.actions}>
      {usable.map((action) => {
        const kind = actionKind(action.url);
        if (kind === "open") {
          return (
            <button
              key={action.url}
              type="button"
              className={styles.pill}
              // The host in the accessible name, so a screen reader hears where
              // the click leads as a sighted reader sees it in the confirm.
              aria-label={`${action.label}, opens ${hostForAction(action.url)}`}
              onClick={() => setConfirming(action.url)}
            >
              {action.label}
              <Icon name="arrow-up-right" size={13} />
            </button>
          );
        }
        const shown = shownDestination(action.url);
        return (
          <span key={action.url} className={styles.held}>
            <a className={styles.pill} href={action.url} aria-label={`${action.label}, ${shown}`}>
              <Icon name={kind === "call" ? "phone" : "mail"} size={13} className={styles.glyph} />
              {action.label}
              <span className={styles.destination}>{shown}</span>
            </a>
            {removeHere && mayRemove ? (
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remove ${action.label}`}
                onClick={() => onRemove!(action.url)}
              >
                Remove
              </button>
            ) : null}
          </span>
        );
      })}
      {there ? (
        <a
          className={styles.pill}
          href={directionsUrl({ ...there, googlePlaceId: null })}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="map-pin" size={13} className={styles.glyph} />
          Directions
        </a>
      ) : null}
    </span>
  );
}
