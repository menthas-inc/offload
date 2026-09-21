/**
 * Ink bar, two forms.
 *
 * **The confirmation.** What happened, and usually the way back: "Deleted, gone in a
 * moment · Undo". role="status".
 *
 * **The failure**, `failed`. One clause and a Retry, per action rather than one generic
 * line: "Couldn't tick that off · Retry", "Couldn't archive that · Retry", "Couldn't put
 * that back · Retry" for a refused undo. role="alert", because a write that did not land
 * has to interrupt rather than wait its turn. It replaces the Undo it supersedes.
 *
 * **Not red, and not an error state.** Same ink bar and same geometry; the glyph, the live
 * region and the action are what change.
 *
 * A write is drawn at the press and the request follows, so **Undo is offered the moment
 * the change is drawn**, not when the server answers. A tick offers none: the box is its
 * own undo, and the same goes for the fold, mute and the switches.
 */
export interface ToastProps {
  message: React.ReactNode;
  /** Label for the single trailing action: "Undo" on a confirmation, "Retry" on a failure. */
  action?: string;
  onAction?: () => void;
  /** The failure form: role="alert" and the alert glyph. */
  failed?: boolean;
  /** Leading Lucide slug. Defaults to "check", or "circle-alert" when failed. */
  icon?: string;
  style?: React.CSSProperties;
}
export declare function Toast(props: ToastProps): JSX.Element;
