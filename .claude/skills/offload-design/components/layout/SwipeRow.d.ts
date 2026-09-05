/** Wraps a list row so a left swipe parks it open over a Delete action.
 *
 *  Delete-only, despite the generic name. The trash glyph and the clay ground are
 *  inside the component and only the label is exposed, so a swipe labelled Archive
 *  would show a trash can. Anything other than deleting belongs in a long-press
 *  action sheet, which is also what an authorship-conditional set of actions needs.
 *
 *  The reveal is a property of the gesture, not of the row's existence: its opacity
 *  is driven from the same value as its offset, so a closed row paints no panel at
 *  all. Covering it with the row's opaque background is not enough, because any
 *  group fade over the screen shows it through every closed row at once. */
export interface SwipeRowProps {
  /** The row itself, usually a ListRow. */
  children?: React.ReactNode;
  /** Called when the revealed action is tapped. Show an undo toast in response; nothing is destroyed until the toast expires. */
  onDelete?: () => void;
  /** Action label. Delete by default. */
  label?: string;
  /** How far the row parks open, in px. 88 by default. */
  revealWidth?: number;
  /** What the sliding surface paints, so it hides the action beneath it. Defaults to the page; pass the container's own surface when the row sits inside a card. */
  background?: string;
  style?: React.CSSProperties;
}
