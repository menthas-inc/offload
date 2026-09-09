/**
 * One read from an answer: the thread that holds the rows, the rows themselves, and one
 * tail. Sits below the reply bubble, never inside it.
 *
 * Ticking is the only write it offers. No delete, no archive, no rename, no swipe.
 */
export interface AnswerRow {
  id: string;
  title: string;
  /** Who and when, or dates and places. Plain text. */
  meta?: string;
  /** Task rows tick; everything else takes its type tile. */
  type?: "task" | "event" | "location" | "link" | "image" | "file" | "voice" | "note";
  done?: boolean;
}
export interface AnswerResultProps {
  /** The thread these rows came from. Null when a search crossed threads. */
  thread?: { id: string; name: string } | null;
  /** Header count. A number, or a string when the read was cut short: "20 of 46". */
  count?: number | string;
  rows: AnswerRow[];
  /** Rows drawn before the tail. 5 on the phones, 8 on web. */
  shown?: number;
  /** The read hit its page. The tail becomes the thread rather than Show more. */
  truncated?: boolean;
  /** How many more are in the thread, for the truncated tail's sentence. */
  threadTotal?: number;
  /** Omit to draw the rows untickable, which is right for a fact. */
  onToggle?: (row: AnswerRow) => void;
  onOpenThread?: () => void;
  style?: React.CSSProperties;
}
export declare function AnswerResult(props: AnswerResultProps): JSX.Element;
