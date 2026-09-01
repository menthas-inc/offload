// Today, on day one.
//
// Not a zero and not an illustration of one: an invitation in offload's own
// voice, three dashed examples, and the composer. Tapping an example fills the
// composer rather than submitting it, because the first thing that lands in an
// account should be something the person meant.

import { useRef, useState, type ComponentRef } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const EXAMPLES = [
  "Ana's birthday is in March, she wants the ceramics class",
  "flight to Lisbon on the 14th, check in opens the day before",
  "that podcast about the bridge collapse, listen on the train",
] as const;

export default function Today() {
  const [draft, setDraft] = useState("");
  // ComponentRef, not TextInput: the class and its instance are different
  // types, and the element ref is the instance.
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  return (
    <SafeAreaView className="flex-1 bg-surface-page" edges={["top"]}>
      <ScrollView contentContainerClassName="px-gutter-screen pt-space-8 pb-space-8">
        <Text className="font-quiet text-title-3 text-text-primary">
          Nothing here yet. Dump the first thing and offload will start filing.
        </Text>

        <View className="mt-space-7 gap-space-4">
          {EXAMPLES.map((example) => (
            <Pressable
              key={example}
              onPress={() => {
                setDraft(example);
                input.current?.focus();
              }}
              className="min-h-tap-min rounded-card border border-dashed border-border-strong px-space-6 py-space-5 active:bg-ink-50"
            >
              <Text className="font-core text-body text-text-secondary">{example}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* The composer never leaves an empty screen, because on every one of
          them the answer is to dump something. Nothing it accepts is wired up
          yet. */}
      <View className="px-gutter-screen pb-space-5">
        <View className="min-h-composer-height flex-row items-center rounded-pill border border-border-attention bg-surface-attention-soft pl-space-7 pr-space-4">
          <TextInput
            ref={input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Dump anything"
            className="min-h-tap-min flex-1 font-core text-body text-text-primary"
          />
          <Pressable
            disabled={draft.trim().length === 0}
            className="h-space-10 w-space-10 items-center justify-center rounded-pill bg-ink-950 disabled:bg-ink-200"
          >
            <Text className="text-paper">↑</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
