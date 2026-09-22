// A shared thread, waiting at the top of My threads. 022.
//
// The kit's `PendingInvite`: one moss strip, the sharer's mark at 28, the
// sentence, and Look. A shared thread opens rather than answering on the
// card, because a thread has content to preview and a connection does not.
// It never becomes an inbox: no badge, no counter, and it goes on its own
// when the share expires or the sharer is no longer in the thread.

import { Platform, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Avatar } from "../Avatar";
import { nameOf, type Invitation } from "../../lib/people";

const isAndroid = Platform.OS === "android";

export function InvitationStrip({ invitation }: { invitation: Invitation }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/invitations/[memberId]", params: { memberId: invitation.memberId } })}
      accessibilityRole="button"
      className={`mx-gutter-screen mb-space-4 flex-row items-center gap-space-4 rounded-lg px-space-5 py-space-4 ${
        isAndroid ? "bg-a-c-low" : "bg-surface-accent-soft"
      }`}
      style={{ minHeight: 56 }}
    >
      <View pointerEvents="none">
        <Avatar uid={invitation.from.accountId} initials={invitation.from.initials} name={invitation.from.displayName ?? undefined} size={28} />
      </View>
      <Text
        className={`flex-1 font-core font-medium ${isAndroid ? "text-a-on" : "text-text-primary"}`}
        style={{ fontSize: 15, lineHeight: 20 }}
        numberOfLines={2}
      >
        {nameOf(invitation.from)} shared {invitation.threadName}
      </Text>
      <Text className={`font-core font-medium ${isAndroid ? "text-blue-700" : "text-text-accent"}`} style={{ fontSize: 14 }}>
        Look
      </Text>
    </Pressable>
  );
}
