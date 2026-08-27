/** Wraps a list row so a left swipe parks it open over a Delete action. */
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
