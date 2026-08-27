/** Pill for filters, spaces and inferred tags. Selected state inverts to ink. */
export interface ChipProps {
  children?: React.ReactNode;
  /** Lucide slug shown at 14px before the label. */
  icon?: string;
  /** Inverted ink fill. */
  selected?: boolean;
  /** neutral grey fill, accent moss tint (AI-inferred), attention ink-blue tint (waiting on you), or outline. */
  tone?: "neutral" | "accent" | "attention" | "warning" | "danger" | "outline";
  onClick?: () => void;
  /** Touch-target height around the 30px pill, 44 by default when interactive. */
  hitArea?: number;
  /** Adds a trailing dismiss glyph. */
  onRemove?: () => void;
  style?: React.CSSProperties;
}
export declare function Chip(props: ChipProps): JSX.Element;
