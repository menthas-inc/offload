// 035. Delete your account, confirmed.
//
// Neither kit draws this. The row is theirs (`SettingsDetail.jsx`,
// `M3SettingsDetail.jsx`); what happens after the tap is specified in 035 and
// built on the sheet the other writes use, with each platform's own chrome.
//
// It is the one action in the product that nothing brings back, so it takes a
// typed word rather than a second tap (OFF-6). The server checks the word
// again. A short sheet with a field, so the keyboard lifts the whole of it and
// the field and the button both stay in view.
//
// No state explains itself: a failure says what happened beside Try again, and
// the last staff owner is told what to do first and given nothing to press.

import { useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "../../lib/colors";
import { deleteAccount, wordMatches } from "../../lib/account";
import { putKeyboardAway } from "../../lib/keyboard";
import { DragSheet } from "../shell/DragSheet";

const isAndroid = Platform.OS === "android";
/** The pills sit 8 apart, as in `SheetFoot`. */
const SLOP = { top: 8, bottom: 8, left: 4, right: 4 };

export function DeleteAccountSheet({
  onClose,
  onDeleted,
  onMakeCopy,
}: {
  onClose: () => void;
  onDeleted: () => void;
  /** Leaves for the Privacy page, where a copy is made and downloaded. */
  onMakeCopy: () => void;
}) {
  const COLOR = useColors();
  const insets = useSafeAreaInsets();
  const field = useRef<TextInput>(null);
  const [word, setWord] = useState("");
  const [state, setState] = useState<"idle" | "deleting" | "failed" | "last_owner">("idle");
  const busy = state === "deleting";
  const ready = wordMatches(word) && !busy;
  const quiet = isAndroid ? "text-a-on-var" : "text-text-secondary";

  function close(): void {
    // Not while the delete is in flight: the sheet would leave a screen that
    // looks signed in over an account that may be gone. The sheet is locked
    // for the same moment, since its own exits run before this is asked.
    if (busy) return;
    putKeyboardAway();
    onClose();
  }

  async function go(): Promise<void> {
    if (!ready) return;
    setState("deleting");
    const outcome = await deleteAccount(word);
    if (outcome === "done") {
      putKeyboardAway();
      onDeleted();
      return;
    }
    setState(outcome);
  }

  return (
    <DragSheet
      onClose={close}
      keyboard="lift"
      locked={busy}
      className="px-gutter-screen pb-space-6 pt-space-2"
      // The pills clear the home indicator once the keyboard is down.
      sheetStyle={{ paddingBottom: insets.bottom }}
      accessibilityLabel="Delete your account"
      // A screen reader hears what deleting does before it is put in a field.
      onOpen={() => {
        void AccessibilityInfo.isScreenReaderEnabled().then((reading) => {
          if (!reading) field.current?.focus();
        });
      }}
    >
      <Text
        className={`font-core font-semibold text-title-2 ${isAndroid ? "text-a-on" : "text-text-primary"}`}
        accessibilityRole="header"
      >
        Delete your account
      </Text>
      <Text className={`mt-space-2 font-core text-body-sm ${quiet}`}>
        Deleting your account takes away your access and what only you could see, and leaves what you added with the
        others in any thread you share. It can&apos;t be undone.
      </Text>
      <Pressable
        onPress={() => {
          if (busy) return;
          putKeyboardAway();
          onMakeCopy();
        }}
        disabled={busy}
        hitSlop={SLOP}
        accessibilityRole="link"
        className="mt-space-3 self-start"
        style={{ minHeight: 30, justifyContent: "center" }}
      >
        <Text className={`font-core font-medium text-body-sm ${isAndroid ? "text-blue-700" : "text-text-accent"}`}>
          Make a copy first
        </Text>
      </Pressable>

      {state === "last_owner" ? (
        <Text
          className="mt-space-6 font-core text-body-sm text-text-danger"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          Hand offload&apos;s ownership to someone else first.
        </Text>
      ) : (
        <>
          {/* Above the field, not in it: a placeholder is gone at the first
              keystroke, and with it the only line that names the word. */}
          <Text className={`mt-space-6 font-core text-body-sm ${quiet}`}>Type delete to confirm</Text>
          <View
            className={`mt-space-3 flex-row items-center border px-space-6 ${
              isAndroid ? "rounded-a-xs border-a-on-var" : "rounded-sm border-border-strong"
            }`}
            style={{ minHeight: 48 }}
          >
            <TextInput
              ref={field}
              value={word}
              onChangeText={(text) => {
                // The field stays editable in flight so the keyboard, and the
                // sheet on it, hold still; the word just stops changing.
                if (busy) return;
                setWord(text);
                if (state === "failed") setState("idle");
              }}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              returnKeyType="done"
              onSubmitEditing={() => void go()}
              accessibilityLabel="Type delete to confirm"
              className={`flex-1 font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`}
              style={{ fontSize: 16 }}
            />
          </View>
          {state === "failed" ? (
            <Text
              className="mt-space-4 font-core text-body-sm text-text-danger"
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              Couldn&apos;t delete your account
            </Text>
          ) : null}
        </>
      )}

      <View className="mt-space-4 flex-row flex-wrap items-center justify-end gap-space-4">
        <Pressable
          onPress={close}
          disabled={busy}
          hitSlop={SLOP}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          className="rounded-pill border border-border-hairline px-space-5"
          style={{ minHeight: 30, justifyContent: "center" }}
        >
          <Text className={`font-core font-medium ${quiet}`} style={{ fontSize: 13 }}>
            {state === "last_owner" ? "Close" : "Cancel"}
          </Text>
        </Pressable>
        {state === "last_owner" ? null : (
          <Pressable
            onPress={() => void go()}
            disabled={!ready}
            hitSlop={SLOP}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready, busy }}
            className={`flex-row items-center gap-space-3 rounded-pill px-space-5 ${
              ready || busy ? "bg-surface-danger" : "bg-state-disabled-surface"
            }`}
            style={{ minHeight: 30, justifyContent: "center" }}
          >
            {busy ? <ActivityIndicator size="small" color={COLOR.onBrand} /> : null}
            <Text
              className={`font-core font-medium ${ready || busy ? "text-text-on-solid" : "text-state-disabled-text"}`}
              style={{ fontSize: 13 }}
            >
              {busy ? "Deleting" : state === "failed" ? "Try again" : "Delete account"}
            </Text>
          </Pressable>
        )}
      </View>
    </DragSheet>
  );
}
