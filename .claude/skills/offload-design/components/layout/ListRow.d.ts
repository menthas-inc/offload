/**
 * One line of captured content: 56px single-line, 72px with meta.
 */
export interface ListRowProps {
  title: React.ReactNode;
  /** Second line, 14px secondary. */
  meta?: React.ReactNode;
  /** Leading slot, Icon, Checkbox or a thumbnail. */
  leading?: React.ReactNode;
  /** Trailing slot, timestamps, Badge, IconButton. */
  trailing?: React.ReactNode;
  /**
   * The reorder handle, `<Icon name="grip-vertical" size={17}/>`, drawn first in the
   * trailing controls and before the pencil. Only on a row in a list that can be arranged.
   * It does nothing when pressed, so it is the one row control whose hover does not invert
   * to ink: it keeps --surface-fill and takes a grab cursor.
   */
  reorder?: React.ReactNode;
  /** Held and moving: the row lifts to --surface-raised with --shadow-2 and follows the
   *  finger while the list re-sorts under it. */
  dragging?: boolean;
  /** The row the drop would land against: a 2px --ink-950 line on that edge, full width. */
  over?: "top" | "bottom" | false;
  /** Show the disclosure chevron. */
  chevron?: boolean;
  selected?: boolean;
  onClick?: () => void;
  /** Inset hairline at the bottom edge. */
  border?: boolean;
  style?: React.CSSProperties;
}
export declare function ListRow(props: ListRowProps): JSX.Element;
