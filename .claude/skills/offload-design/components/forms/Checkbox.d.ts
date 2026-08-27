/** Checkbox / task tick. The tick draws itself in 220ms; checked labels grey out and strike through. */
export interface CheckboxProps {
  checked?: boolean;
  onChange?: (next: boolean) => void;
  label?: string;
  /** Second line under the label, 12px tertiary. */
  meta?: string;
  disabled?: boolean;
  /** rounded 6px box (default) or circle for checklist items. */
  shape?: "rounded" | "circle";
  style?: React.CSSProperties;
}
export declare function Checkbox(props: CheckboxProps): JSX.Element;
