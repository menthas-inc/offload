// 039. A review code, under the no-invite screen's two buttons.
//
// One component for both phones, since the words and the order are the same
// and only the Material classes differ. No kit draws it, so it is the gate's
// own pieces: the caption's accent as a line to tap, the gate's refusal block,
// a field at the buttons' height like the waitlist screen's, and the outlined
// button, so the screen keeps one filled one.
//
// Each refusal is one clause with the way forward beside it: the field and
// Use code for a code that did not work, Sign in for a refusal that has run
// out. Nothing here explains a failure.

import { useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { GATE } from "../../lib/gate";
import { redeemCode, type CodeAnswer } from "../../lib/code";

export function HaveACode({ onIn }: { onIn: () => void }) {
  const router = useRouter();
  const material = Platform.OS === "android";
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Exclude<CodeAnswer, "in"> | null>(null);

  async function use() {
    if (!code.trim() || busy) return;
    setBusy(true);
    const status = await redeemCode(code);
    setBusy(false);
    if (status === "in") onIn();
    else setAnswer(status);
  }

  const outlined = material
    ? "min-h-a-row-height w-full items-center justify-center rounded-pill border border-a-outline bg-surface-raised active:opacity-90"
    : "min-h-composer-height w-full items-center justify-center rounded-pill border border-border-strong bg-surface-raised active:opacity-90";
  const outlinedText = `font-core text-body font-medium ${material ? "text-a-on" : "text-text-primary"}`;

  if (!open) {
    return (
      // 44 points of touch around a caption-sized line, per the hit area rule.
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        className="items-center justify-center"
        style={{ minHeight: 44 }}
      >
        <Text
          className={`font-core font-medium ${material ? "text-blue-700" : "text-caption text-text-accent"}`}
          style={material ? { fontSize: 12.5, lineHeight: 18 } : undefined}
        >
          {GATE.code.open}
        </Text>
      </Pressable>
    );
  }

  const line =
    answer === "refused" ? GATE.code.refused : answer === "sign-in" ? GATE.code.signIn : answer === "failed" ? GATE.code.failed : null;

  return (
    <View className="gap-space-4">
      {line ? (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="rounded-md bg-surface-attention-soft px-space-6 py-space-5"
        >
          <Text className="font-core text-body-sm text-text-on-attention">{line}</Text>
        </View>
      ) : null}

      {answer === "sign-in" ? (
        <Pressable onPress={() => router.replace("/sign-in")} className={outlined}>
          <Text className={outlinedText}>{GATE.code.signInButton}</Text>
        </Pressable>
      ) : (
        <>
          <TextInput
            value={code}
            onChangeText={(next) => {
              setCode(next);
              if (answer) setAnswer(null);
            }}
            onSubmitEditing={() => void use()}
            placeholder={GATE.code.placeholder}
            accessibilityLabel={GATE.code.placeholder}
            // A code is letters and digits as typed from a store's notes: no
            // corrections, and capitals, which is how it is printed.
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            maxLength={40}
            returnKeyType="go"
            autoFocus
            className={`w-full rounded-pill border px-space-7 text-center font-core text-body ${
              material ? "min-h-a-row-height border-a-outline text-a-on" : "min-h-composer-height border-border-strong text-text-primary"
            }`}
          />
          <Pressable onPress={() => void use()} disabled={busy || !code.trim()} className={outlined}>
            <Text className={outlinedText}>{GATE.code.use}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
