/** One standing rule a thread holds about itself, as a row.
 *
 *  A memory is a sentence up to 200 characters, so it is set as one: full text,
 *  wrapped, read without a click. It was a chip until 5 September 2026, and the
 *  chip truncated it to a window you had to open to read.
 *
 *  Open, the row grows to hold its own editor: the thing you clicked is
 *  visibly the thing you are editing. Leave 5px inside any animation clip or
 *  the focus ring is cut to four corner marks. */
export interface MemoryRowProps {
  text: string;
  /** `learned` gets the sparkles glyph and moss, because offload wrote it.
   *  `told` is neutral. */
  origin?: "learned" | "told";
  /** Shown after the text in a lighter weight, on a shared thread only. */
  author?: string;
  /** Quieted by any member and un-quietable by any member, including its
   *  author. A muted row offers Unmute and nothing else. */
  muted?: boolean;
  /** Expands the row into its editor. */
  open?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  onSave?: (text: string) => void;
  /** The author's, or anybody's once the author has left. Omit and the row
   *  offers Mute instead: never both, they are the same intent at different
   *  strengths. */
  onDelete?: () => void;
  onMute?: () => void;
  /** 200. Counted live in the editor. */
  maxChars?: number;
  /** Arrived while somebody was looking at the screen: takes the change mark,
   *  a moss ground settling to transparent over 1400ms. */
  arrived?: boolean;
  style?: React.CSSProperties;
}
export declare function MemoryRow(props: MemoryRowProps): JSX.Element;
