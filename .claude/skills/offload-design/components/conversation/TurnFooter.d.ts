/**
 * One row under a turn carrying everything offload has to say about it that is not a
 * sentence. Drawn whether or not offload replied: on a silent filing turn it is the whole
 * of offload's side.
 *
 * Left aligned at the log's gutter, wrapping rather than scrolling, min-height never height.
 */
export interface TurnRef {
  id?: string;
  name: string;
  /** thread is moss and opens the thread; time and money are read-only marks. */
  kind?: "thread" | "time" | "money";
}
export interface TurnSource {
  /** The registrable domain, and nothing else: no path, no title, no scheme. */
  domain: string;
  url: string;
}
export interface TurnFooterProps {
  /** seen draws 👀, done draws the moss mark. Never set on a turn that only answered. */
  state?: "seen" | "done" | null;
  /** Where the turn's content landed, from the record rather than from the sentence. */
  refs?: TurnRef[];
  /** Where a fact came from. Three are drawn, then a count. */
  sources?: TurnSource[];
  maxSources?: number;
  onOpenRef?: (ref: TurnRef) => void;
  /** Omit to let the anchor open the URL itself. */
  onOpenSource?: (source: TurnSource) => void;
  style?: React.CSSProperties;
}
export declare function TurnFooter(props: TurnFooterProps): JSX.Element | null;
