/** Translucent 52px top bar. Sticky at the top of every screen. */
export interface AppBarProps {
  title?: React.ReactNode;
  /** 12px tertiary line under the title (counts, "updated 2m ago"). */
  subtitle?: string;
  /** Leading slot, usually a back IconButton. */
  left?: React.ReactNode;
  /** Trailing slot, one or two IconButtons. */
  right?: React.ReactNode;
  /** Hairline at the bottom edge. */
  border?: boolean;
  align?: "left" | "center";
  style?: React.CSSProperties;
}
export declare function AppBar(props: AppBarProps): JSX.Element;
