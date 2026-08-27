/** Ink confirmation bar with one optional undo-style action. */
export interface ToastProps {
  message: React.ReactNode;
  /** Label for the single trailing action, e.g. "Undo". */
  action?: string;
  onAction?: () => void;
  /** Leading Lucide slug; "check" by default. */
  icon?: string;
  style?: React.CSSProperties;
}
export declare function Toast(props: ToastProps): JSX.Element;
