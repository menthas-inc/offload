/**
 * The thread notice (31 October 2026). One full-width strip under a thread's bar, under the
 * read and above the rail, for anything the thread needs to tell the person. Replaces the 13px
 * layout suggestion pill and the plain heads-up line.
 *
 * **from offload**: solid `--surface-accent` (moss 600) with `--text-on-solid`, a Lucide glyph.
 * **from a person**: `--surface-inverse` with `--text-inverse`, their initials on their hue.
 *
 * 16 medium, two lines at most (clamped; copy is written to fit two at 375 wide), one underlined
 * word to act on, an x to dismiss. The action's result is an `UndoLine` in the strip's place.
 * Several stack, newest on top.
 */
export interface ThreadNoticeProps {
  message: React.ReactNode;
  /** One word: "Switch", "Change". */
  action?: string;
  onAction?: () => void;
  /** Omit to draw no x. */
  onDismiss?: () => void;
  from?: "offload" | "person";
  /** Lucide slug, offload only. Defaults to "sparkles". */
  icon?: string;
  /** Person only. */
  initials?: string;
  /** Person only, their hue. Defaults to var(--label-7). */
  hue?: string;
  style?: React.CSSProperties;
}
export declare function ThreadNotice(props: ThreadNoticeProps): JSX.Element;
