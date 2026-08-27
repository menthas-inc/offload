/** Square/round glyph-only action for bars, rows and the composer. */
export interface IconButtonProps {
  /** Lucide slug. */
  icon: string;
  /** Accessible name, required, since there is no visible label. */
  label: string;
  variant?: "primary" | "secondary" | "quiet" | "ghost";
  /** With variant="primary" this fills the button instead. Otherwise recolours the glyph. Use it rather than passing a colour on style: style lands
      on the outer hit-area element and the painted span overrides it. */
  tone?: "neutral" | "danger" | "accent" | "attention";
  /** sm 32 / md 40 / lg 48 px box. */
  size?: "sm" | "md" | "lg";
  shape?: "circle" | "rounded";
  /** Touch-target size around the drawn box, 44 by default. Only lower it for a
      glyph inside a larger already-tappable row. */
  hitArea?: number;
  disabled?: boolean;
  onClick?: () => void;
  /** Truthy draws a red presence dot on the glyph corner. Omit or 0 for none. */
  badge?: number | boolean;
  style?: React.CSSProperties;
}
export declare function IconButton(props: IconButtonProps): JSX.Element;
