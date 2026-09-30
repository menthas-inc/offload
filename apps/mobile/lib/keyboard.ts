// Putting the keyboard away when a sheet goes (30 September 2026).
//
// React Native's `Keyboard.dismiss()` blurs the input JS believes is focused.
// A sheet closed by Cancel unmounts its field first, so JS has already let go
// of it while Android still has it focused, and the keyboard stayed up over
// the screen the sheet left (found on the Pixel). The keyboard controller asks
// Android for its own focused view, so it works whatever JS remembers.

import { KeyboardController } from "react-native-keyboard-controller";

export function putKeyboardAway(): void {
  void KeyboardController.dismiss();
}
