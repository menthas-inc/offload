/**
 * Undo, in place. Replaces the floating Toast for every action that offers Undo
 * (18 October 2026). The line is drawn where the change is, so it never covers the page.
 *
 * **slot**: the thing left its list (archive, delete, move, tick off on Today, dismiss a
 * reminder, answer Needs you, delete or leave a thread, forget a memory). Takes the row's slot
 * at row height on `--amber-100`, text and underlined Undo in `--amber-700`.
 *
 * **under**: the thing stayed, changed (edit, label, label a list, edit a thread, a dump filed
 * into the open thread). 36px, grey, directly beneath the row, indented to the row's text.
 *
 * **plate**: the change has no row on screen (a dump filed from Today, Memories, My threads).
 * A line above the composer.
 *
 * Eight seconds, drawn as a 2px rule along the foot that empties. Several can run at once,
 * each with its own clock. No close: it covers nothing. **failed** keeps the ground and the
 * place, swaps the glyph for `circle-alert`, the action for Retry, and the live region for an
 * alert; it is not red, as with Toast.
 */
export interface UndoLineProps {
  message: React.ReactNode;
  /** Defaults to "Undo", or "Retry" when failed. */
  action?: string;
  onAction?: () => void;
  form?: "slot" | "under" | "plate";
  failed?: boolean;
  /** Leading Lucide slug, the action's own: "archive", "trash-2", "arrow-up-right", "bell", "tag", "pencil", "cloudy", "log-out". Defaults to "check". */
  icon?: string;
  /** Let the message wrap instead of truncating. For a sentence that must be read whole, such as the thread notice's layout switch (31 October 2026). */
  wrap?: boolean;
  /** Milliseconds. Default 8000. */
  duration?: number;
  /** Epoch ms the change was drawn, so a re-mount keeps its place on the clock. */
  startedAt?: number;
  /** Called after the window and a 240ms close. The parent drops the line and commits. */
  onExpire?: () => void;
  /** Override the corner, to match the card the slot sits in. slot and under default to 0, plate to 12. */
  radius?: number;
  style?: React.CSSProperties;
}
export declare function UndoLine(props: UndoLineProps): JSX.Element;
