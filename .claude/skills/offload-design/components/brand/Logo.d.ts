/** The offload mark: a dot above an open vessel, with or without the wordmark. */
export interface LogoProps {
  /** lockup = mark + wordmark (default); mark = the symbol alone. */
  variant?: "lockup" | "mark";
  /** Height of the mark in px. The wordmark scales from it. Never below 16. */
  size?: number;
  /** ink on light surfaces, inverse on ink surfaces. */
  tone?: "ink" | "inverse";
  style?: React.CSSProperties;
}
export declare function Logo(props: LogoProps): JSX.Element;
