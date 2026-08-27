/** Bottom sheet, offload's only modal. Rises 14px behind a scrim. */
export interface SheetProps {
  open?: boolean;
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** Action row pinned under the content. */
  footer?: React.ReactNode;
  /** Called when the scrim is tapped. */
  onClose?: () => void;
  style?: React.CSSProperties;
}
export declare function Sheet(props: SheetProps): JSX.Element;
