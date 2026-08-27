/** Small non-interactive status label, 20px tall. */
export interface BadgeProps {
  children?: React.ReactNode;
  /** accent = moss, offload did this. attention = ink blue, this needs you. */
  tone?: "neutral" | "accent" | "attention" | "warning" | "danger";
  variant?: "soft" | "solid";
  style?: React.CSSProperties;
}
export declare function Badge(props: BadgeProps): JSX.Element;
