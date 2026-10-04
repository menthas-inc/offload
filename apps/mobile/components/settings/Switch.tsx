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
      // **`thumbColor` as well as `trackColor`, and that is not decoration.**
      // Without a thumb colour Android keeps its own Material accent for the
      // whole control and the track colour is blended with it, so the switch
      // came out teal on a screen whose contract says the on state is the
      // inverse surface. Seen on a device; both phones take the same two
      // props, so this is one rule rather than a platform branch.
      //
      // **Off is the lift, not the hairline** (2026-10-05). In dark the
      // hairline track under a raised thumb was a dark circle on a dark pill
      // and an off switch could not be seen. The lift is dark's step up for
      // an edge; in light it is the hairline's own value.
      trackColor={{ true: COLOR.ink, false: COLOR.lift }}
      thumbColor={COLOR.raised}
      // The off track needs an edge of its own, which is the one place iOS
      // and Android agree by default and Android does not.
      ios_backgroundColor={COLOR.lift}
      style={style}
    />
  );
}
