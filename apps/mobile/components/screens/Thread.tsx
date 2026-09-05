// One thread, from ui_kits/mobile_app/ThreadScreen.jsx.
//
// The app bar carries back, Share and More, and nothing else: **the name is a
// heading inside the scroll**, not in the bar, which is the kit's own layout and
// the opposite of the web's pane head.
//
// Four things the kit does not draw and this does, each with an entry in the
// design system's log:
//
//   - **The memories section**, which no kit draws on any platform.
//   - **Content row actions**: a swipe deletes, a long press opens the rest.
//     The sheet lists what this account may actually do to the row, which is
//     how the authorship split is handled without a gesture map that is wrong
//     for half of them.
//   - **The archived toggle** in the section header.
//   - **No standing placeholder.** The kit says "offload has not summarised
//     this one yet" when there is none; nothing writes summaries, and a line
//     saying offload has not done something is an apology taking up the most
//     prominent space on the screen.

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { widgetsFor } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { COLOR } from "../../lib/colors";
import { ContentRowView } from "../shell/ContentRow";
import { MemoriesSection } from "../shell/Memories";
import { RowActions, type RowAction } from "../shell/RowActions";
import { ToastHost, useToast } from "../shell/Toast";
import { Widgets } from "../shell/Widgets";
import {
  completeContent,
  deleteContent,
  fetchContent,
  fetchThread,
  setArchived,
  type ContentRow,
  type ThreadBundle,
} from "../../lib/threads";
import { useConversation } from "../shell/conversation-context";
import { failed } from "../../lib/log";

const isAndroid = Platform.OS === "android";

export default function Thread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [thread, setThread] = useState<ThreadBundle | null>(null);
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [acting, setActing] = useState<ContentRow | null>(null);
  // What arrived while this screen was open, marked for a moment rather than
  // appearing silently in the middle of a list.
  const [arrived, setArrived] = useState<Set<string>>(new Set());
  const toast = useToast();
  const { filed } = useConversation();

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [bundle, page] = await Promise.all([
        fetchThread(id),
        fetchContent(id, { archived: showArchived }),
      ]);
      setThread(bundle);
      setRows(page?.rows ?? []);
      setCursor(page?.nextCursor ?? null);
    } catch (error) {
      failed("thread.load", error, { threadId: id });
    }
  }, [id, showArchived]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /** Reload, and mark whatever was not here before.
   *
   *  The diff is done here rather than asked of the server: the screen already
   *  knows what it was showing, and a "what changed since" parameter would be a
   *  second source of truth about the same question. */
  const catchUp = useCallback(async (): Promise<void> => {
    if (!id) return;
    const before = new Set(rows.map((row) => row.id));
    const [bundle, page] = await Promise.all([
      fetchThread(id),
      fetchContent(id, { archived: showArchived }),
    ]);
    const next = page?.rows ?? [];
    setThread(bundle);
    setRows(next);
    setCursor(page?.nextCursor ?? null);
    const fresh = next.filter((row) => !before.has(row.id)).map((row) => row.id);
    if (fresh.length > 0) setArrived(new Set(fresh));
  }, [id, rows, showArchived]);

  // offload filed into the thread somebody is looking at. The composer is on
  // this screen, so this is the ordinary case rather than a race, and without
  // it the page goes on showing what it held a moment ago while the reply says
  // otherwise.
  const lastFiled = useRef(0);
  useEffect(() => {
    if (!filed || filed.at === lastFiled.current) return;
    lastFiled.current = filed.at;
    if (filed.threadIds.length > 0 && !filed.threadIds.includes(id ?? "")) return;
    void catchUp();
  }, [filed, id, catchUp]);

  // The mark is a moment, not a state, and it is cleared on a timer so it
  // survives the reload that produced it.
  useEffect(() => {
    if (arrived.size === 0) return;
    const timer = setTimeout(() => setArrived(new Set()), 1600);
    return () => clearTimeout(timer);
  }, [arrived]);

  async function tick(row: ContentRow): Promise<void> {
    await completeContent(row.id, row.doneAt === null);
    await load();
  }

  async function archive(row: ContentRow): Promise<void> {
    if (!(await setArchived(row.id, row.archivedAt === null))) return;
    await load();
    toast.show(row.archivedAt === null ? "Archived" : "Back in the thread", {
      label: "Undo",
      onPress: async () => {
        await setArchived(row.id, row.archivedAt !== null);
        await load();
      },
    });
  }

  async function remove(row: ContentRow): Promise<void> {
    if (!(await deleteContent(row.id))) return;
    await load();
    // Never the row's title: a toast is a few words and a title is not.
    toast.show("Deleted");
  }

  if (!thread) {
    return (
      <SafeAreaView className={`flex-1 ${isAndroid ? "bg-a-surface" : "bg-surface-page"}`} edges={["top"]}>
        <Bar onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  const widgets = widgetsFor(rows, thread.preference.widgets);
  const inWidgets = new Set(widgets.flatMap((w) => w.rows.map((r) => r.id)));
  const rest = rows.filter((row) => !inWidgets.has(row.id));
  // "Everything else" once a widget has lifted anything out, per 007's AC-2.
  // Not a fixed string: it is the anti-duplication contract.
  const restHeading = inWidgets.size > 0 ? "Everything else" : "Everything in here";

  const actions: RowAction[] = acting
    ? [
        { label: acting.doneAt ? "Mark not done" : "Mark done", run: () => tick(acting) },
        {
          label: acting.archivedAt ? "Put back in the thread" : "Archive",
          run: () => archive(acting),
        },
        ...(acting.canDelete ? [{ label: "Delete", danger: true, run: () => remove(acting) }] : []),
      ]
    : [];

  return (
    <SafeAreaView className={`flex-1 ${isAndroid ? "bg-a-surface" : "bg-surface-page"}`} edges={["top"]}>
      <Bar onBack={() => router.back()} />

      <ScrollView contentContainerClassName="pb-space-9">
        <View className="px-gutter-screen pb-space-8 pt-space-7">
          <Text
            className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
            style={{ fontSize: 28, lineHeight: 34, letterSpacing: -0.5 }}
          >
            {thread.name}
          </Text>

          <View className="mt-space-5 flex-row flex-wrap gap-space-3">
            {thread.members
              .filter((member) => !member.isYou)
              .map((member) => (
                <View
                  key={member.accountId}
                  className="flex-row items-center gap-space-2 rounded-pill bg-surface-fill px-space-5"
                  style={{ height: 30 }}
                >
                  <Glyph name="users" size={14} color={COLOR.iconOnWell} />
                  <Text className="font-core text-text-primary" style={{ fontSize: 13 }}>
                    {member.displayName}
                  </Text>
                </View>
              ))}
            <View
              className="flex-row items-center gap-space-2 rounded-pill border border-border-hairline px-space-5"
              style={{ height: 30, opacity: 0.55 }}
            >
              <Glyph name="share-2" size={14} color={COLOR.iconOnWell} />
              <Text className="font-core text-text-secondary" style={{ fontSize: 13 }}>
                Share
              </Text>
            </View>
          </View>

          {/* Only when there is one. */}
          {thread.standing ? (
            <>
              <Text
                className="mt-space-7 font-quiet text-text-primary"
                style={{ fontSize: 18, lineHeight: 27 }}
              >
                {thread.standing}
              </Text>
              <View className="mt-space-5 flex-row items-center gap-space-3">
                <Glyph name="sparkles" size={13} color={COLOR.iconOnWell} />
                <Text className="font-core text-text-tertiary" style={{ fontSize: 12 }}>
                  offload wrote this
                </Text>
              </View>
            </>
          ) : null}
        </View>

        {showArchived ? null : (
          <Widgets
            widgets={widgets}
            groupBy={thread.preference.groupBy}
            onDelete={(row: ContentRow) => void remove(row)}
            onActions={setActing}
            onToggle={(row: ContentRow) => void tick(row)}
            arrived={arrived}
          />
        )}

        {showArchived ? null : (
          <MemoriesSection
            threadId={thread.id}
            memories={thread.memories}
            members={thread.members}
            onChanged={() => void load()}
            onToast={toast.show}
          />
        )}

        {rest.length > 0 ? (
          <View className="flex-row items-center gap-space-3 px-gutter-screen pb-space-3 pt-space-7">
            <Text className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 21 }}>
              {showArchived ? "Archived" : restHeading}
            </Text>
            {cursor ? null : (
              <View className="rounded-pill bg-surface-fill px-space-3 py-space-1">
                <Text className="font-core text-text-secondary" style={{ fontSize: 12 }}>
                  {rest.length}
                </Text>
              </View>
            )}
            {thread.counts.archived > 0 || showArchived ? (
              <Pressable className="ml-auto" hitSlop={10} onPress={() => setShowArchived((v) => !v)}>
                <Text className="font-core text-text-secondary" style={{ fontSize: 13 }}>
                  {showArchived ? "Back to the list" : `Archived ${thread.counts.archived}`}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {rest.length === 0 && !showArchived && inWidgets.size === 0 ? (
          <Text
            className="px-gutter-screen py-space-8 font-core text-text-tertiary"
            style={{ fontSize: 14 }}
          >
            Nothing in this one yet. Dump something and offload will file it.
          </Text>
        ) : null}

        {rest.map((row, i) => (
          <ContentRowView
            key={row.id}
            row={row}
            border={i < rest.length - 1}
            arrived={arrived.has(row.id)}
            onDelete={() => void remove(row)}
            onActions={() => setActing(row)}
          />
        ))}
      </ScrollView>

      <RowActions
        open={acting !== null}
        actions={actions}
        onClose={() => setActing(null)}
      />
      <ToastHost state={toast} />
    </SafeAreaView>
  );
}

function Bar({ onBack }: { onBack: () => void }) {
  return (
    <View className="h-appbar-height flex-row items-center px-gutter-screen">
      <Pressable onPress={onBack} hitSlop={12}>
        <Glyph name="chevron-left" size={22} color={COLOR.iconOnWell} />
      </Pressable>
    </View>
  );
}
