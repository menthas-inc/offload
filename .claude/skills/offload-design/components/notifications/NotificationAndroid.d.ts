/** Android notification as Material 3 draws it in the shade. Painted by the system, so it
    does not follow the app theme. */
export interface NotificationAndroidProps {
  app?: string;
  time?: string;
  title: React.ReactNode;
  /** Clamped to two lines until the notification is expanded. */
  body?: React.ReactNode;
  /** Text buttons inside the card; three is the platform maximum. */
  actions?: Array<{ label: string; destructive?: boolean; onPress?: () => void }>;
  /** Shows the expander chevron in the header line. */
  expandable?: boolean;
  /** Card width; 360 is the phone default. */
  width?: number;
  style?: React.CSSProperties;
}
export declare function NotificationAndroid(props: NotificationAndroidProps): JSX.Element;
