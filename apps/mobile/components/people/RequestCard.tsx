// A connection request, answered on the card. 022.
//
// The kit's `PendingInvite` with the two chips the 21 September design put on
// their own line, so the sentence keeps its full measure and both clear 44px:
// Accept in moss, Not now outlined. The mark is a door to the person's page,
// where More holds Block, which is how the one person you may need to block
// is one tap from the card. A failed answer keeps the card with the failure
// line and the chip becomes Try again.

import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Avatar } from "../Avatar";
import { nameOf, type RequestCard as Card } from "../../lib/people";

const isAndroid = Platform.OS === "android";

export function RequestCard({
  card,
  onAnswer,
}: {
  card: Card;
  /** Resolves true when the server took it. */
  onAnswer: (answer: "accept" | "dismiss") => Promise<boolean>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "dismiss" | null>(null);
  const [failed, setFailed] = useState<"accept" | "dismiss" | null>(null);

  async function answer(which: "accept" | "dismiss") {
    setBusy(which);
    setFailed(null);
    const ok = await onAnswer(which);
    setBusy(null);
    if (!ok) setFailed(which);
  }

  return (
    <View
      className={`mb-space-4 rounded-lg px-space-5 py-space-4 ${
        isAndroid ? "bg-a-c-low" : "bg-surface-accent-soft"
      }`}
    >
      <View className="flex-row items-center gap-space-4">
        <Pressable
          onPress={() => router.push(`/people/${card.accountId}`)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={nameOf(card)}
        >
          <Avatar uid={card.accountId} initials={card.initials} name={card.displayName ?? undefined} size={28} />
        </Pressable>
        <Text
          className={`flex-1 font-core font-medium ${isAndroid ? "text-a-on" : "text-text-primary"}`}
          style={{ fontSize: 15, lineHeight: 20 }}
        >
          {nameOf(card)} wants to connect
        </Text>
      </View>
      <View className="flex-row items-center gap-space-3 pt-space-3">
        <Pressable
          onPress={() => void answer("accept")}
          disabled={busy !== null}
          accessibilityRole="button"
          className="items-center justify-center rounded-pill bg-moss-600 px-space-5"
          style={{ height: 30, marginVertical: 7, opacity: busy === "accept" ? 0.55 : 1 }}
        >
          <Text className="font-core font-medium text-text-on-solid" style={{ fontSize: 13 }}>
            {failed === "accept" ? "Try again" : "Accept"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void answer("dismiss")}
          disabled={busy !== null}
          accessibilityRole="button"
          className="items-center justify-center rounded-pill border border-border-strong px-space-5"
          style={{ height: 30, marginVertical: 7, opacity: busy === "dismiss" ? 0.55 : 1 }}
        >
          <Text className={`font-core font-medium ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 13 }}>
            {failed === "dismiss" ? "Try again" : "Not now"}
          </Text>
        </Pressable>
        {failed ? (
          <Text className="flex-1 font-core text-text-danger" style={{ fontSize: 13 }} accessibilityRole="alert">
            That didn't go through.
          </Text>
        ) : null}
      </View>
    </View>
  );
}
