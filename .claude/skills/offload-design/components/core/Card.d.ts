/** Grouping surface. Hairline by default, shadow only when it floats. */
export interface CardProps {
  children?: React.ReactNode;
  /** hairline (default), raised (shadow-2), fill (sunken grey, no border). */
  variant?: "hairline" | "raised" | "fill";
  /** Any CSS padding value; defaults to 16px. */
  padding?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}
export declare function Card(props: CardProps): JSX.Element;
