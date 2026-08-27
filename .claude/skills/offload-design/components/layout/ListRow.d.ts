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
  /** Show the disclosure chevron. */
  chevron?: boolean;
  selected?: boolean;
  onClick?: () => void;
  /** Inset hairline at the bottom edge. */
  border?: boolean;
  style?: React.CSSProperties;
}
export declare function ListRow(props: ListRowProps): JSX.Element;
