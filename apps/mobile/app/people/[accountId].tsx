// A person. 022.
//
// The kit's `PersonScreen`: the mark at 52 beside the name, what they are to
// you under it, and the threads you are both in. The kit's Waiting on you,
// Waiting on Ana and What offload knows sections are not drawn: nothing
// writes who a row is waiting on and nothing writes a memory about a person
// yet, and they arrive with those features. More holds what applies and
// nothing else, since nothing else on the page is destructive: Remove
// connection for a connection, Block for anybody not blocked, Unblock for
// somebody blocked. Every mark in the product opens here.

import { useCallback, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Glyph } from "../../components/Glyph";
import { ThreadIcon } from "../../components/ThreadIcon";
import { Avatar } from "../../components/Avatar";
import { RowActionSheet, type RowAction } from "../../components/shell/RowActionSheet";
import { ConfirmSheet } from "../../components/people/ConfirmSheet";
import { useColors } from "../../lib/colors";
import { refreshMe } from "../../lib/me";
import { useConversation } from "../../components/shell/conversation-context";
import {
  blockPerson,
  fetchPerson,
  firstNameOf,
  nameOf,
  removeConnection,
  unblockPerson,
  type PersonPage,
} from "../../lib/people";

const isAndroid = Platform.OS === "android";

/** The line under the name. */
function relationLine(page: PersonPage): string {
  switch (page.relation) {
    case "connected":
      return page.shared.length === 0
        ? "Connected"
        : `Shares ${page.shared.length} ${page.shared.length === 1 ? "thread" : "threads"} with you`;
    case "asked_you":
      return "Asked to connect";
    case "you_asked":
      return "You asked to connect";
    case "blocked":
      return "Blocked";
    case "thread":
      return page.shared.length === 1 ? `In ${page.shared[0]!.name} with you` : `In ${page.shared.length} threads with you`;
    case "waiting":
      return "Waiting on a share";
  }
}

/** "14 · active" for a live thread. The count stands on its own. */
function threadMeta(thread: { count: number; lastActivityAt: string }): string {
  const days = (Date.now() - new Date(thread.lastActivityAt).getTime()) / 86_400_000;
  return `${thread.count} · ${days < 30 ? "active" : "quiet"}`;
}

export default function Person() {
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const router = useRouter();
  const COLOR = useColors();
  const { notify } = useConversation();
  const [page, setPage] = useState<PersonPage | "gone" | null>(null);
  const [more, setMore] = useState(false);
  const [confirm, setConfirm] = useState<"remove" | "block" | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const [loadFailed, setLoadFailed] = useState(false);
  const load = useCallback(async () => {
    if (!accountId) return;
    setLoadFailed(false);
    const next = await fetchPerson(accountId);
    if (next === null) setLoadFailed(true);
    else setPage(next);
  }, [accountId]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const actions: RowAction[] = [];
  if (page && page !== "gone") {
    if (page.relation === "connected") {
      actions.push({ label: "Remove connection", icon: "x", run: () => setConfirm("remove") });
    }
    if (page.relation === "blocked") {
      actions.push({
        label: "Unblock",
        icon: "check",
        run: async () => {
          if (await unblockPerson(page.accountId)) await load();
          else notify("That didn't go through.", { label: "Try again", onPress: () => void unblockPerson(page.accountId).then(() => load()) });
        },
      });
    } else {
      actions.push({ label: "Block", icon: "lock", danger: true, run: () => setConfirm("block") });
    }
  }

  async function act() {
    if (!page || page === "gone" || !confirm) return;
    setBusy(true);
    setFailed(false);
    const ok = confirm === "remove" ? await removeConnection(page.accountId) : await blockPerson(page.accountId);
    setBusy(false);
    if (!ok) {
      setFailed(true);
      return;
    }
    setConfirm(null);
    void refreshMe();
    if (confirm === "remove") router.back();
    else await load();
  }

  const first = page && page !== "gone" ? firstNameOf(page) : "";
  const threadRows = page && page !== "gone" ? page.shared.map((t) => ({ title: t.name, meta: threadMeta(t), thread: { id: t.id, icon: t.icon, hue: t.hue } })) : [];

  return (
    <SafeAreaView className={`flex-1 ${isAndroid ? "bg-a-surface" : "bg-surface-page"}`} edges={["top"]}>
      <View className="h-appbar-height flex-row items-center px-gutter-screen">
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <Glyph name="chevron-left" size={22} color={COLOR.iconOnWell} />
        </Pressable>
        {actions.length > 0 ? (
          <Pressable onPress={() => setMore(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="More" className="ml-auto">
            <Glyph name="ellipsis" size={21} color={COLOR.iconOnWell} />
          </Pressable>
        ) : null}
      </View>

      {page === null && loadFailed ? (
        <Text className="px-gutter-screen pt-space-5 font-core text-text-danger" style={{ fontSize: 13 }} accessibilityRole="alert">
          That didn't go through.{" "}
          <Text className="font-core font-medium text-text-accent" onPress={() => void load()}>
            Try again
          </Text>
        </Text>
      ) : page === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : page === "gone" ? (
        <View className="flex-1 items-center justify-center px-space-8">
          <Text className="font-quiet text-center text-text-secondary" style={{ fontSize: 19, lineHeight: 28 }}>
            Not here any more.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerClassName="pb-space-9">
          <View className="flex-row items-center gap-space-6 px-gutter-screen pb-space-8 pt-space-6">
            <Avatar uid={page.accountId} initials={page.initials} name={page.displayName ?? undefined} size={52} />
            <View className="flex-1">
              <Text
                className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
                style={{ fontSize: 26, lineHeight: 31, letterSpacing: -0.4 }}
                accessibilityRole="header"
                numberOfLines={2}
              >
                {nameOf(page)}
              </Text>
              <Text className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 14, marginTop: 2 }}>
                {relationLine(page)}
              </Text>
            </View>
          </View>

          {page.shared.length === 0 ? (
            <View className="items-center px-space-8 pt-space-8">
              <Text className="font-quiet text-center text-text-secondary" style={{ fontSize: 19, lineHeight: 28, maxWidth: 300 }}>
                {page.relation === "connected"
                  ? `Open a thread and tap Share to bring ${first} into it.`
                  : `Nothing shared with ${first} yet.`}
              </Text>
            </View>
          ) : (
            <>
              <View className="flex-row items-center gap-space-3 px-gutter-screen pb-space-3">
                <Text className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 21 }}>
                  Shared with {first}
                </Text>
                <View className="rounded-pill bg-surface-fill px-space-3 py-space-1">
                  <Text className="font-core text-text-secondary" style={{ fontSize: 12 }}>
                    {page.shared.length}
                  </Text>
                </View>
              </View>
              {page.shared.map((thread, i) => (
                <Pressable
                  key={thread.id}
                  onPress={() => router.push({ pathname: "/threads/[id]", params: { id: thread.id } })}
                  accessibilityRole="button"
                  className={`flex-row items-center gap-space-4 px-gutter-screen py-space-3 ${
                    i < page.shared.length - 1 ? "border-b border-border-hairline" : ""
                  }`}
                  style={{ minHeight: 56 }}
                >
                  <ThreadIcon icon={thread.icon} hue={thread.hue} seed={thread.id} size={32} />
                  <View className="flex-1">
                    <Text className={`font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 15 }} numberOfLines={1}>
                      {thread.name}
                    </Text>
                    <Text className="font-core text-text-tertiary" style={{ fontSize: 12.5, marginTop: 2 }}>
                      {threadMeta(thread)}
                    </Text>
                  </View>
                  <Glyph name="chevron-right" size={15} color={COLOR.iconOnWell} />
                </Pressable>
              ))}
            </>
          )}
        </ScrollView>
      )}

      <RowActionSheet open={more} actions={actions} onClose={() => setMore(false)} />

      {page && page !== "gone" ? (
        <ConfirmSheet
          open={confirm !== null}
          title={confirm === "block" ? `Block ${nameOf(page)}?` : `Remove ${nameOf(page)}?`}
          body={
            confirm === "block"
              ? `${first} will not be able to ask to connect with you again. ${
                  page.shared.length > 0
                    ? `The ${page.shared.length} ${page.shared.length === 1 ? "thread" : "threads"} you already share ${page.shared.length === 1 ? "stays" : "stay"} as ${page.shared.length === 1 ? "it is" : "they are"}, and ${first} can still be in a thread you share if somebody else brings them in.`
                    : `${first} can still be in a thread you share if somebody else brings them in.`
                }`
              : `You will not be able to share anything new with ${first}, and ${first} will not be able to share with you.${
                  page.shared.length > 0
                    ? ` The ${page.shared.length} ${page.shared.length === 1 ? "thread" : "threads"} you already share ${page.shared.length === 1 ? "stays" : "stay"} as ${page.shared.length === 1 ? "it is" : "they are"}.`
                    : ""
                }`
          }
          rows={confirm === "remove" ? threadRows : []}
          rowCount={confirm === "remove" ? page.shared.length : 0}
          hint={confirm === "remove" && page.shared.length > 0 ? "Leave a thread from its own More menu if you want out of it." : undefined}
          action={confirm === "block" ? "Block" : "Remove"}
          danger
          busy={busy}
          failed={failed}
          onConfirm={() => void act()}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}
