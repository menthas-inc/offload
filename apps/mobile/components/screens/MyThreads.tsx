// My threads, from ui_kits/mobile_app/ThreadsScreen.jsx.
//
// Three groups, and only one of them is stored: `always_on` is a column, and
// "older" is derived from activity, because a thread does not become old, it
// stops being used. The server derives all three so every client agrees.
//
// **Two divergences from the kit, both logged in the design system:**
//
//   - **No trailing count.** The kit draws a `Badge` of the people count here
//     and a content count on Android. It is the same number the meta line
//     already carries, and it came off the web row for that reason.
//   - **No bell and no settings in the bar.** The kit draws both and both
//     destinations are out of scope, and a control that does nothing is worse
//     on a phone than absent.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Logo } from "../Logo";
import { QuietEmpty } from "./QuietEmpty";
import { ThreadRow } from "../shell/ThreadRow";
import { ToastHost, useToast } from "../shell/Toast";
import {
  deleteThread,
  fetchThreads,
  restoreThread,
  type ThreadGroup,
} from "../../lib/threads";
import { useConversation } from "../shell/conversation-context";
import { failed } from "../../lib/log";

const isAndroid = Platform.OS === "android";

const HEADINGS: Record<string, string> = {
  always: "Always on",
  older: "Older threads",
};

/** The kit shows three older threads and hides the rest behind one control. */
const OLDER_SHOWN = 3;

export default function MyThreads() {
  const router = useRouter();
  const [groups, setGroups] = useState<ThreadGroup[] | null>(null);
  const [allOlder, setAllOlder] = useState(false);
  const toast = useToast();
  const { filed } = useConversation();

  const load = useCallback(async () => {
    try {
      setGroups(await fetchThreads());
    } catch (error) {
      failed("threads.load", error);
    }
  }, []);

  // On focus rather than on mount: a dump filed from another tab changes this
  // list, and coming back to a stale one is the version of that bug somebody
  // notices.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // And on the turn itself, because focus does not change when you are already
  // standing here. The composer is on this screen, so offload creating a thread
  // while you watch is the ordinary case: without this the list went on showing
  // what it held a moment ago and only caught up if you navigated away and
  // back, which is how it was found.
  const lastFiled = useRef(0);
  useEffect(() => {
    if (!filed || filed.at === lastFiled.current) return;
    lastFiled.current = filed.at;
    void load();
  }, [filed, load]);

  async function remove(id: string, name: string): Promise<void> {
    const result = await deleteThread(id);
    if (!result) return;
    await load();
    // Which of the two happened, because leaving a shared thread destroys
    // nothing and saying "deleted" about it would be untrue.
    toast.show(result.deleted ? "Thread deleted" : "You left the thread", {
      label: "Undo",
      onPress: async () => {
        await restoreThread(id);
        await load();
      },
    });
    void name;
  }

  if (groups === null) {
    return (
      <SafeAreaView
        className={`flex-1 ${isAndroid ? "bg-a-surface" : "bg-surface-page"}`}
        edges={["top"]}
      >
        <View className="h-appbar-height flex-row items-center px-gutter-screen">
          <Logo size={21} />
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  const now = groups.find((g) => g.key === "now")?.threads ?? [];
  const always = groups.find((g) => g.key === "always")?.threads ?? [];
  const older = groups.find((g) => g.key === "older")?.threads ?? [];
  const shownOlder = allOlder ? older : older.slice(0, OLDER_SHOWN);
  const total = now.length + always.length + older.length;

  return (
    <SafeAreaView
      className={`flex-1 ${isAndroid ? "bg-a-surface" : "bg-surface-page"}`}
      edges={["top"]}
    >
      <View className="h-appbar-height flex-row items-center px-gutter-screen">
        <Logo size={21} />
      </View>

      {total === 0 ? (
        <QuietEmpty line="Threads appear here on their own, once there is enough in one place to be one." />
      ) : (
        <ScrollView contentContainerClassName="pt-space-5 pb-space-9">
          {now.map((thread, i) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              border={i < now.length - 1}
              onOpen={() =>
                router.push({
                  pathname: "/threads/[id]",
                  params: { id: thread.id },
                })
              }
              onDelete={() => void remove(thread.id, thread.name)}
              onRefuse={() =>
                toast.show(
                  "This thread can't be deleted. It's where things land by default.",
                )
              }
            />
          ))}

          {always.length > 0 ? (
            <Section label={HEADINGS["always"]!} count={always.length} accent />
          ) : null}
          {always.map((thread, i) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              border={i < always.length - 1}
              onOpen={() =>
                router.push({
                  pathname: "/threads/[id]",
                  params: { id: thread.id },
                })
              }
              onDelete={() => void remove(thread.id, thread.name)}
              onRefuse={() =>
                toast.show(
                  "This thread can't be deleted. It's where things land by default.",
                )
              }
            />
          ))}

          {older.length > 0 ? (
            <Section label={HEADINGS["older"]!} count={older.length} />
          ) : null}
          {shownOlder.map((thread, i) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              border={i < shownOlder.length - 1}
              onOpen={() =>
                router.push({
                  pathname: "/threads/[id]",
                  params: { id: thread.id },
                })
              }
              onDelete={() => void remove(thread.id, thread.name)}
              onRefuse={() =>
                toast.show(
                  "This thread can't be deleted. It's where things land by default.",
                )
              }
            />
          ))}

          {!allOlder && older.length > OLDER_SHOWN ? (
            <Pressable
              className="min-h-tap-min flex-row items-center px-gutter-screen pt-space-6"
              onPress={() => setAllOlder(true)}
            >
              <Text
                className="font-core text-text-secondary"
                style={{ fontSize: 14.5 }}
              >
                All {older.length} older threads
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}

      <ToastHost state={toast} />
    </SafeAreaView>
  );
}

function Section({
  label,
  count,
  accent,
}: {
  label: string;
  count: number;
  accent?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-space-3 px-gutter-screen pb-space-3 pt-space-7">
      <Text
        className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
        style={{ fontSize: 21 }}
      >
        {label}
      </Text>
      <View
        className={`rounded-pill px-space-3 py-space-1 ${
          accent ? "bg-surface-accent-soft" : "bg-surface-fill"
        }`}
      >
        <Text
          className={`font-core ${accent ? "text-text-accent" : "text-text-secondary"}`}
          style={{ fontSize: 12 }}
        >
          {count}
        </Text>
      </View>
    </View>
  );
}
