/** Single- or multi-line text input, 44px tall, hairline border that goes ink on focus. */
export interface TextFieldProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  /** Label above the field, 13px secondary. */
  label?: string;
  /** Helper or error text below. */
  hint?: string;
  /** Lucide slug shown inside, leading. */
  icon?: string;
  multiline?: boolean;
  rows?: number;
  /** danger paints the border and hint clay. */
  tone?: "default" | "danger";
  disabled?: boolean;
  style?: React.CSSProperties;
}
export declare function TextField(props: TextFieldProps): JSX.Element;
