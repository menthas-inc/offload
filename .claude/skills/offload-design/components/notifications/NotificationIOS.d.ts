/** iOS notification banner. System material, so it does not follow the app theme. */
export interface NotificationAction {
  label: string;
  /** Red label. Put it last. */
  destructive?: boolean;
  onPress?: () => void;
}
export interface NotificationIOSProps {
  /** App name on the first line; uppercased by the banner. */
  app?: string;
  /** Delivery time, e.g. "now" or "9:41". */
  time?: string;
  title: React.ReactNode;
  /** Wraps to four lines collapsed. */
  body?: React.ReactNode;
  /** Rendered as the expanded state: full-width rows, two at most here. */
  actions?: NotificationAction[];
  /** Banner width; 390 is the iPhone default. */
  width?: number;
  style?: React.CSSProperties;
}
export declare function NotificationIOS(props: NotificationIOSProps): JSX.Element;
