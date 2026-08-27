/** Binary setting toggle. Ink track when on. */
export interface SwitchProps {
  checked?: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  /** Optional label rendered before the track; it flexes to fill a row. */
  label?: string;
  style?: React.CSSProperties;
}
export declare function Switch(props: SwitchProps): JSX.Element;
