/** Section break: 21px semibold title over an ink rule, with an optional count pill beside it. */
export interface SectionHeaderProps {
  children?: React.ReactNode;
  /** Count shown in a grey pill immediately after the title. */
  count?: React.ReactNode;
  /** Affordance or badge ("Open calendar", "See all"), sitting beside the title. */
  action?: React.ReactNode;
  /** Where the action sits: left, in the same run as the title (default), or pushed right. */
  alignAction?: "left" | "right";
  /** Stick to the top of the scroll container. */
  sticky?: boolean;
  style?: React.CSSProperties;
}
export declare function SectionHeader(props: SectionHeaderProps): JSX.Element;
