/** Hairline ring for in-flight work. Use a label when the wait is explained. */
export interface SpinnerProps {
  size?: number;
  /** 12px tertiary caption beside the ring, e.g. "sorting…". */
  label?: string;
  style?: React.CSSProperties;
}
export declare function Spinner(props: SpinnerProps): JSX.Element;
