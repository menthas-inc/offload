/** Everything a swipe cannot carry. A long press on a row opens this.
 *
 *  It lists what this account may actually do to the row and omits the rest.
 *  There is no disabled action in here on purpose: the server decides who may
 *  delete something, and a control that is drawn and refused teaches a rule
 *  that is not true. Pair it with `SwipeRow`, which stays delete-only. */
export interface RowAction {
  label: string;
  /** Lucide slug, 18px, leading the label. */
  icon?: string;
  /** Clay label and glyph. One per sheet at most. */
  danger?: boolean;
  onSelect?: () => void;
}
export interface RowActionSheetProps {
  open?: boolean;
  /** In the order they are offered. Omit what this account may not do. */
  actions?: RowAction[];
  /** The row's own title, shown above the actions when the sheet needs to say
   *  which row it belongs to. Omit on a screen where that is obvious. */
  subject?: React.ReactNode;
  onClose?: () => void;
  style?: React.CSSProperties;
}
export declare function RowActionSheet(props: RowActionSheetProps): JSX.Element;
