// TEMPORARY. Delete this file and its two call sites in components/screens/
// Today.ios.tsx and Today.android.tsx.
//
// There is no sign-out in the design yet, and testing the gate means being
// able to leave it. Deliberately unstyled against the token set so it reads as
// scaffolding rather than a control anyone might mistake for shipped: if this
// ever looks at home on the screen, it has been here too long.

import { Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { signOut } from "../lib/auth";

export function TempSignOut() {
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Sign out, for testing"
      hitSlop={12}
      className="ml-auto rounded border border-dashed border-red-500 px-2 py-1"
      onPress={() => {
        void signOut().then(() => router.replace("/sign-in"));
      }}
    >
      <Text className="text-xs text-red-500">sign out</Text>
    </Pressable>
  );
}
