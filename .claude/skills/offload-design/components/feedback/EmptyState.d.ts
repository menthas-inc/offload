/** Centred nothing-here state. Body copy is set in the quiet serif. */
export interface EmptyStateProps {
  title?: React.ReactNode;
  /** One or two sentences, in --font-quiet. */
  body?: React.ReactNode;
  /** Lucide slug at 28px in ink-300. */
  icon?: string;
  /** Optional single Button. */
  action?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function EmptyState(props: EmptyStateProps): JSX.Element;
