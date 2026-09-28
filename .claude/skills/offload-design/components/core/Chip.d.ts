/** Pill for filters and threads, 30px in a 44px target. Selected inverts to ink, or to the label's own colour when `label` is set. */
export interface ChipProps {
  children?: React.ReactNode;
  /** Lucide slug shown at 14px before the label. */
  icon?: string;
  /** A label's colour, 1 to 10: draws its dot, and selected fills with --label-N instead of ink. The filter bar's chips. */
  label?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  /** Inverted ink fill. */
  selected?: boolean;
  /** neutral grey fill, accent moss (offload did this; never a label), attention ink-blue (waiting on you), or outline. A tone is a fill: there is no soft variant. */
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
