/** Translucent 52px top bar. Sticky at the top of every screen. */
export interface AppBarProps {
  title?: React.ReactNode;
  /** 12px tertiary line under the title (counts, "updated 2m ago"). */
  subtitle?: string;
  /** Leading slot, usually a back IconButton. */
  left?: React.ReactNode;
  /**
   * Trailing slot, **up to three IconButtons**, by the same criterion the web pane head
   * uses: a tool earns a bar slot only if it changes what offload reads or shows.
   * Anything that acts on the thread goes in More. On a thread that is share, the
   * calendar when the account has a connection, and More.
   */
  right?: React.ReactNode;
  /** Hairline at the bottom edge. */
  border?: boolean;
  align?: "left" | "center";
  style?: React.CSSProperties;
}
export declare function AppBar(props: AppBarProps): JSX.Element;
