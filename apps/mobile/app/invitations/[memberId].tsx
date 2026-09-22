// A shared thread, before it is yours. 022.
//
// The kit's `InviteScreen`: the sharer's mark at 56, the sentence, the count
// and what you can do, who is already in, a preview of two rows, and Add it
// to my threads over Not now. **The preview is a snapshot** the server took
// when the share was made, of the sharer's own two titles: nothing here reads
// the thread, since a person who has not accepted is not in it. Not now is
// not a decline; the strip waits. The invitation is read from the same list
// the strips come from, so one that has gone says so rather than drawing a
// stale screen.

import { useCallback, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Glyph } from "../../components/Glyph";
import { Avatar } from "../../components/Avatar";
import { useColors } from "../../lib/colors";
import { fetchThreadsAndInvitations } from "../../lib/threads";
import { acceptInvitation, firstNameOf, nameOf, type Invitation } from "../../lib/people";

const isAndroid = Platform.OS === "android";

function withNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `With ${names[0]}.`;
  if (names.length === 2) return `With ${names[0]} and ${names[1]}.`;
  return `With ${names[0]}, ${names[1]} and ${names.length - 2} more.`;
}

export default function InvitationScreen() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const router = useRouter();
  const COLOR = useColors();
  const [invitation, setInvitation] = useState<Invitation | "gone" | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      setLoadFailed(false);
      void fetchThreadsAndInvitations().then((page) => {
        if (!live) return;
        if (!page) {
          setLoadFailed(true);
          return;
        }
        const found = page.invitations.find((i) => i.memberId === memberId);
        setInvitation(found ?? "gone");
      });
      return () => {
        live = false;
      };
    }, [memberId, attempt]),
  );

  async function add() {
    if (!memberId) return;
    setBusy(true);
    setFailed(false);
    const result = await acceptInvitation(memberId);
    setBusy(false);
    if (result === "gone") {
      setInvitation("gone");
      return;
    }
    if (!result) {
      setFailed(true);
      return;
    }
    router.replace({ pathname: "/threads/[id]", params: { id: result.threadId } });
  }

  return (
    <SafeAreaView className={`flex-1 ${isAndroid ? "bg-a-surface" : "bg-surface-page"}`} edges={["top"]}>
      <View className="h-appbar-height flex-row items-center gap-space-4 px-gutter-screen">
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
          <Glyph name="x" size={22} color={COLOR.iconOnWell} />
        </Pressable>
        <Text className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 17 }}>
          Invitation
        </Text>
      </View>

      {invitation === null && loadFailed ? (
        <Text className="px-gutter-screen pt-space-5 font-core text-text-danger" style={{ fontSize: 13 }} accessibilityRole="alert">
          That didn't go through.{" "}
          <Text className="font-core font-medium text-text-accent" onPress={() => setAttempt((n) => n + 1)}>
            Try again
          </Text>
        </Text>
      ) : invitation === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : invitation === "gone" ? (
        <View className="flex-1 items-center justify-center px-space-8">
          <Text className="font-quiet text-center text-text-secondary" style={{ fontSize: 19, lineHeight: 28 }}>
            Not here any more.
          </Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerClassName="px-gutter-screen pb-space-6">
            <View className="items-center pb-space-6 pt-space-4">
              <Avatar uid={invitation.from.accountId} initials={invitation.from.initials} name={invitation.from.displayName ?? undefined} size={56} />
              <Text
                className={`pt-space-5 text-center font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
                style={{ fontSize: 26, lineHeight: 31, letterSpacing: -0.4 }}
                accessibilityRole="header"
              >
                {nameOf(invitation.from)} shared {invitation.threadName} with you
              </Text>
              <Text
                className={`pt-space-3 text-center font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
                style={{ fontSize: 15, lineHeight: 22 }}
              >
                {invitation.preview.count > 0 ? `${invitation.preview.count} in it. ` : ""}You can add to it, and you cannot delete anything of {firstNameOf(invitation.from)}'s.
                {invitation.members.length > 0 ? ` ${withNames(invitation.members)}` : ""}
              </Text>
            </View>

            {invitation.preview.titles.length > 0 ? (
              <View className={`rounded-lg px-space-5 ${isAndroid ? "bg-a-c-low" : "bg-surface-fill"}`}>
                {invitation.preview.titles.map((title, i) => (
                  <View
                    key={`${title}-${i}`}
                    className={`flex-row items-center gap-space-4 py-space-4 ${
                      i < invitation.preview.titles.length - 1 ? "border-b border-border-hairline" : ""
                    }`}
                  >
                    <View className={`items-center justify-center rounded-pill ${isAndroid ? "bg-a-surface" : "bg-surface-raised"}`} style={{ width: 22, height: 22 }}>
                      <Glyph name="square-check-big" size={13} color={COLOR.secondary} />
                    </View>
                    <Text className={`flex-1 font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 15 }} numberOfLines={2}>
                      {title}
                    </Text>
                    <Text className="font-core text-text-tertiary" style={{ fontSize: 12.5 }}>
                      {firstNameOf(invitation.from)} added it
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>

          <View className="gap-space-3 px-gutter-screen pb-space-6 pt-space-5">
            {failed ? (
              <Text className="font-core text-text-danger" style={{ fontSize: 13 }} accessibilityRole="alert">
                That didn't go through.
              </Text>
            ) : null}
            <Pressable
              onPress={() => void add()}
              disabled={busy}
              accessibilityRole="button"
              className={`items-center justify-center rounded-pill ${isAndroid ? "bg-blue-600" : "bg-surface-inverse"}`}
              style={{ minHeight: 52, opacity: busy ? 0.55 : 1 }}
            >
              {busy ? (
                <ActivityIndicator color={isAndroid ? COLOR.onBrand : COLOR.onSolid} />
              ) : (
                <Text className={`font-core font-medium ${isAndroid ? "text-text-on-solid" : "text-text-inverse"}`} style={{ fontSize: 16 }}>
                  {failed ? "Try again" : "Add it to my threads"}
                </Text>
              )}
            </Pressable>
            <Pressable onPress={() => router.back()} accessibilityRole="button" className="items-center justify-center" style={{ minHeight: 44 }}>
              <Text className={`font-core font-medium ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 15 }}>
                Not now
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
