/**
 * Text action. Primary is solid ink; everything else recedes.
 */
export interface ButtonProps {
  /** primary = solid ink fill; secondary = hairline outline; quiet = grey fill; ghost = no chrome. */
  variant?: "primary" | "secondary" | "quiet" | "ghost";
  /** Drawn height: sm 32px / md 40px / lg 48px. The touch target stays 44px
      regardless, so a small button is still safely tappable. */
  size?: "sm" | "md" | "lg";
  /** rounded = 10px radius (default), pill = fully round. */
  shape?: "rounded" | "pill";
  /** Lucide slug placed before the label. */
  icon?: string;
  /** Lucide slug placed after the label. */
  iconAfter?: string;
  /** Stretch to the container width. */
  block?: boolean;
  /** Touch-target height around the drawn button, 44 by default. */
  hitArea?: number;
  disabled?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Button(props: ButtonProps): JSX.Element;
