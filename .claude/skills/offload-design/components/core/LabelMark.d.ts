/** A person's label, drawn on a row's marks line beside the date chip, in Today's meta line,
 *  and in the turn footer after the thread pill. The label's solid with --text-on-solid words.
 *  A mark says something about the row; pressing one opens the label's list. The filter bar is
 *  Chip with `label`, not this. */
export interface LabelMarkProps {
  /** The label's name, 24 characters at most. */
  children?: React.ReactNode;
  /** Which of the ten label colours, 1 to 10, reading --label-N. Stored on the label, never derived from its name. */
  color?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  /** 20 on a row's marks line and in Today, 24 on its own in a sheet, 30 in the turn footer beside its 30px chips. */
  size?: 20 | 24 | 30;
  /** Opens the label's list: its things, Rename, Colour, Delete. */
  onClick?: (e: unknown) => void;
  /** A trailing x, in the label sheet only. */
  onRemove?: () => void;
  style?: React.CSSProperties;
}
export declare function LabelMark(props: LabelMarkProps): JSX.Element;
