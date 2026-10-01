// My threads, from ui_kits/mobile_app/ThreadsScreen.jsx.
//
// One list by last activity, then Older threads, which is about time only: a
// thread does not become old, it stops being used, and the server derives it
// so every client agrees. 028 retired Always on, and put what is not in a
// thread between the two as its own group.
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
  Text,
  View,
} from "react-native";
import Animated, { useAnimatedScrollHandler } from "react-native-reanimated";
import { prismShift, PRISM_SCROLL_FACTOR } from "../../lib/prism-scroll";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Logo } from "../Logo";
import { QuietEmpty } from "./QuietEmpty";
import { ThreadRow } from "../shell/ThreadRow";
import { ToastHost, useToast } from "../shell/Toast";
import {
  deleteThread,
  fetchThreadsAndInvitations,
  myThreads,
  restoreThread,
  type ThreadGroup,
} from "../../lib/threads";
import type { LooseSummary } from "../../lib/loose";
import { LooseGroup } from "../loose/LooseGroup";
import { useLooseRows } from "../loose/useLooseRows";
import type { Invitation } from "../../lib/people";
import { InvitationStrip } from "../people/InvitationStrip";
import { useConversation } from "../shell/conversation-context";
import { PlateSpace } from "../shell/plate-inset";
import { failed } from "../../lib/log";

const isAndroid = Platform.OS === "android";

/** The kit shows three older threads and hides the rest behind one control. */
const OLDER_SHOWN = 3;

export default function MyThreads() {
  // The field behind the plate slides against this list. On the UI thread, so
  // it never crosses to JS and never waits on a render.
  const onScroll = useAnimatedScrollHandler((event) => {
    prismShift.value = event.contentOffset.y * PRISM_SCROLL_FACTOR;
  });

  const router = useRouter();
  const [groups, setGroups] = useState<ThreadGroup[] | null>(null);
  // 028. What is not in a thread, from the same read.
  const [loose, setLoose] = useState<LooseSummary | null>(null);
  // 022. Waiting shares, one strip each at the top, from the same read.
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [allOlder, setAllOlder] = useState(false);
  const toast = useToast();
  const { filed } = useConversation();

  const load = useCallback(async () => {
    try {
      const page = await fetchThreadsAndInvitations();
      setGroups(page?.groups ?? []);
      setInvitations(page?.invitations ?? []);
      setLoose(page?.loose ?? null);
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

  const rows = useLooseRows(loose, load, toast);

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

  const { now, older, empty } = myThreads(groups, loose);
  const shownOlder = allOlder ? older : older.slice(0, OLDER_SHOWN);

  return (
    <SafeAreaView
      className={`flex-1 ${isAndroid ? "bg-a-surface" : "bg-surface-page"}`}
      edges={["top"]}
    >
      <View className="h-appbar-height flex-row items-center px-gutter-screen">
        <Logo size={21} />
      </View>

      {empty ? (
        <>
          {/* 022. A strip stays over the empty state: a first thread may well
              be somebody else's. */}
          {invitations.length > 0 ? (
            <View className="pt-space-5">
              {invitations.map((invitation) => (
                <InvitationStrip key={invitation.memberId} invitation={invitation} />
              ))}
            </View>
          ) : null}
          <QuietEmpty line="Threads appear here on their own, once there is enough in one place to be one." />
        </>
      ) : (
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerClassName="pt-space-5 pb-space-9"
        >
          {invitations.map((invitation) => (
            <InvitationStrip key={invitation.memberId} invitation={invitation} />
          ))}
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
            />
          ))}

          {/* 028. Between the first list and Older threads, and not drawn
              when there is nothing in it. */}
          <LooseGroup
            summary={loose}
            heading={(label, count) => <Section label={label} count={count} />}
            live={rows.live}
            gone={rows.gone}
            row={rows.row}
          />

          {older.length > 0 ? (
            <Section label="Older threads" count={older.length} />
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
          <PlateSpace />
        </Animated.ScrollView>
      )}

      {rows.sheets}
      <ToastHost state={toast} />
    </SafeAreaView>
  );
}

function Section({ label, count }: { label: string; count: number }) {
  return (
    <View className="flex-row items-center gap-space-3 px-gutter-screen pb-space-3 pt-space-7">
      <Text
        className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
        style={{ fontSize: 21 }}
      >
        {label}
      </Text>
      <View className="rounded-pill bg-surface-fill px-space-3 py-space-1">
        <Text className="font-core text-text-secondary" style={{ fontSize: 12 }}>
          {count}
        </Text>
      </View>
    </View>
  );
}
