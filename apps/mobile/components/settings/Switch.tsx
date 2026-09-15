// The design system's `Switch`, over the platform's own.
//
// **The contract is `checked, onChange, disabled, label, style`**, and this
// exists so a call site can use those names. React Native ships a `Switch`
// whose props are `value` and `onValueChange`, and because the adherence rule
// matches on the element's name rather than its import, drawing the platform
// one directly reads to the linter as the governed component with four props it
// does not have. That is the linter being right: `Switch` means one thing in
// this product, and the place to keep the platform's spelling is here.
//
// The track is the platform's, which is the boring choice and the correct one:
// it is the control both phones already use everywhere else, and it is the one
// that announces itself properly to a screen reader. `trackColor` is where the
// design system's inverse on-state lands.

import { Switch as Native, type StyleProp, type ViewStyle } from "react-native";
import { useColors } from "../../lib/colors";

export function Switch({
  checked,
  onChange,
  disabled,
  label,
  style,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** What it is, for anybody who cannot see the row it sits in. */
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  const COLOR = useColors();
  return (
    <Native
      value={checked}
      onValueChange={onChange}
      disabled={disabled}
      accessibilityLabel={label}
      trackColor={{ true: COLOR.ink, false: COLOR.hairline }}
      style={style}
    />
  );
}
