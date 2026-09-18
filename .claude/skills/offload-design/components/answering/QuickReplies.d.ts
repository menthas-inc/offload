/**
 * Taps that stand in for typing an answer to a question offload just asked. Inside the
 * reply bubble, under the sentence that asks; on a turn that filed silently and asked, the
 * question gets a reply bubble of its own and this sits in that.
 *
 * Never the only way in: every option is answerable by typing, and the labels are the
 * words somebody would say. Anything past the fifth option is dropped.
 */
export interface QuickReplyOption {
  id?: string;
  /** What somebody would say. "Add it", not "Confirm". Capped at 24 characters by the
   *  server, which is what stops a label wrapping inside itself. */
  label: string;
  /**
   * value:   one of several things it could be. --surface-card with --border-strong; no
   *          option in a question is ever a primary, because dark ink would say offload
   *          was recommending one.
   * plain:   the way out, always last and always on a line of its own, drawn with an x.
   * primary: 012's proposal only, where offload does have a recommendation.
   * thread:  an object being picked, drawn in the thread's own moss.
   */
  kind?: "value" | "plain" | "primary" | "thread";
  icon?: string;
}
export interface QuickRepliesProps {
  /** Five at most. None of them may destroy anything. */
  options: QuickReplyOption[];
  onPick?: (option: QuickReplyOption) => void;
  /**
   * The group's accessible name: the sentence that asked, verbatim, so a screen reader
   * hears the question before the options. The clients also repeat it as each chip's hint,
   * because iOS does not read a container's name.
   */
  label?: string;
  /** The rest of the truth: "Or name another one." Unused by 018's questions. */
  note?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function QuickReplies(props: QuickRepliesProps): JSX.Element | null;
