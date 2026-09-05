/** Pill for filters, threads and inferred tags. Selected state inverts to ink. */
export interface ChipProps {
  children?: React.ReactNode;
  /** Lucide slug shown at 14px before the label. */
  icon?: string;
  /** Inverted ink fill. */
  selected?: boolean;
  /** neutral grey fill, accent moss (AI-inferred), attention ink-blue (waiting on you), or outline. A tone is a fill: there is no soft variant. */
  tone?: "neutral" | "accent" | "attention" | "warning" | "danger" | "outline";
  /** Unavailable. Paints --state-disabled-surface with --state-disabled-text and no opacity fade, takes no click, no hover and no enlarged hit area. Say why it is unavailable in copy nearby rather than leaving a dead pill. */
  disabled?: boolean;
  onClick?: () => void;
  /** Touch-target height around the 30px pill, 44 by default when interactive. */
  hitArea?: number;
  /** Adds a trailing dismiss glyph. Ignored while disabled. */
  onRemove?: () => void;
  style?: React.CSSProperties;
}
export declare function Chip(props: ChipProps): JSX.Element;
