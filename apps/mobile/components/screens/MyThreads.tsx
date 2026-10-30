// My threads, as a grid (2026-10-29, `APPLY-2026-10-29-threads-grid.md`).
//
// Two columns of square tiles, newest made first, until the person drags one;
// then the grid is in their order, which the chip under the bar switches back
// from without losing it. Activity never moves a tile and Older threads went
// with the list. Not in a thread is one row above the grid.
//
// **Hold to lift.** A hold of 320ms lifts a tile and dims the others; let go
// without moving and the tile's menu opens under it (Edit thread, Share, Delete
// or Leave); move while held and it follows the finger, the others making
// room, and the drop is drawn at once and written after, with Undo. A tap
// opens the thread. A screen reader gets Move earlier and Move later. There is
// no haptic on lift: it needs a native module, which waits for a store build.
//
// **No bell and no settings in the bar**, as before: both destinations are out
// of scope here, and a control that does nothing is worse than absent.

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  LinearTransition,
  ReduceMotion,
  runOnJS,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { prismShift, PRISM_SCROLL_FACTOR } from "../../lib/prism-scroll";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { DEFAULT_THREAD_ICON, leaveAsk, leastUsedHue, moveThread, ORDER_COPY, staysWith, tileLabel, type Layout, type ThreadSort } from "@offload/widgets";
import { ConfirmSheet } from "../people/ConfirmSheet";
import { ShareSheet } from "../people/ShareSheet";
import { Glyph } from "../Glyph";
import { EditThreadSheet } from "./EditThreadSheet";
import { useColors } from "../../lib/colors";
import { Logo } from "../Logo";
import { QuietEmpty } from "./QuietEmpty";
import { ThreadTile, TILE_CORNER } from "../ThreadTile";
import { ToastHost, useToast } from "../shell/Toast";
import { Returned, UndoLine } from "../shell/UndoLine";
import { useInPlace, useUndoEntries } from "../../lib/undo";
import { perform, useWrites } from "../../lib/optimistic";
import { cellOrigin, cellUnder, gridMetrics, HOLD_MS, STILL_PT } from "../../lib/threadGrid";
import {
  createThread,
  deleteThread,
  editThread,
  fetchThread,
  fetchThreadsAndInvitations,
  myThreads,
  putThreadOrder,
  restoreThread,
  type ThreadBundle,
  type ThreadGroup,
  type ThreadOrder,
  type ThreadRow,
} from "../../lib/threads";
import type { LooseSummary } from "../../lib/loose";
import type { Invitation } from "../../lib/people";
import { InvitationStrip } from "../people/InvitationStrip";
import { useChanged, useConversation } from "../shell/conversation-context";
import { PlateSpace } from "../shell/plate-inset";
import { useMe } from "../../lib/me";
import { failed } from "../../lib/log";

const isAndroid = Platform.OS === "android";
const GUTTER = 20;
const NEWEST: ThreadOrder = { sort: "newest", ids: [] };
/** The others make room on the iOS sheet curve, and on Android's emphasised
 *  decelerate, as the kit's other moves. */
const SLIDE = LinearTransition.duration(260)
  .easing(isAndroid ? Easing.bezier(0.05, 0.7, 0.1, 1) : Easing.bezier(0.32, 0.72, 0, 1))
  .reduceMotion(ReduceMotion.System);
const ORDER_PLACE = { id: "threads:order", icon: "grip-vertical", form: "plate" } as const;
const EDGE_PT = 64;
const MENU_HEIGHT = 152;

type Anchor = { x: number; y: number; w: number; h: number };
type Moving = { id: string; from: number; ids: string[]; dragged: boolean };

export default function MyThreads() {
  const router = useRouter();
  const toast = useToast();
  const COLOR = useColors();
  const me = useMe();
  const { filed } = useConversation();
  const { width, height } = useWindowDimensions();
  const m = gridMetrics(width, GUTTER);
  // Reduce Motion lifts a tile without the scale: a cut, not a shorter one.
  const reduced = useReducedMotion();

  const [groups, setGroups] = useState<ThreadGroup[] | null>(null);
  // 028. What is not in a thread, from the same read.
  const [loose, setLoose] = useState<LooseSummary | null>(null);
  // 022. Waiting shares, one strip each at the top, from the same read.
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [order, setOrder] = useState<ThreadOrder>(NEWEST);
  // The order as drawn at the press, until the list read after the write lands.
  const [drawnOrder, setDrawnOrder] = useState<ThreadOrder | null>(null);
  const [making, setMaking] = useState(false);
  // 2026-10-07. A shared thread asks before it is left.
  const [leaving, setLeaving] = useState<ThreadRow | null>(null);
  const [menu, setMenu] = useState<{ thread: ThreadRow; at: Anchor } | null>(null);
  const [chip, setChip] = useState<Anchor | null>(null);
  const [editing, setEditing] = useState<ThreadBundle | null>(null);
  const [sharing, setSharing] = useState<ThreadRow | null>(null);
  // A lifted tile, the cell it started in, and the list as it stands while
  // it is dragged.
  const [moving, setMovingState] = useState<Moving | null>(null);
  // The move as last set, for the release, which can land before the render
  // of the last step.
  const movingNow = useRef<Moving | null>(null);
  const setMoving = (next: Moving | null | ((was: Moving | null) => Moving | null)): void => {
    movingNow.current = typeof next === "function" ? next(movingNow.current) : next;
    setMovingState(movingNow.current);
  };
  const chipRef = useRef<View>(null);
  const cells = useRef(new Map<string, View>());

  const load = useCallback(async () => {
    try {
      const page = await fetchThreadsAndInvitations();
      // A read that failed keeps what is drawn: a live one runs while
      // somebody is looking at the list.
      if (!page) {
        setGroups((shown) => shown ?? []);
        return;
      }
      setGroups(page.groups);
      setInvitations(page.invitations);
      setLoose(page.loose);
      setOrder(page.order);
    } catch (error) {
      failed("threads.load", error);
    }
  }, []);
  const writes = useWrites(load);

  // On focus rather than on mount: a dump filed from another tab changes this
  // list, and coming back to a stale one is the version of that bug somebody
  // notices.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // And on the turn itself, because focus does not change when you are already
  // standing here and offload makes a thread while you watch.
  const lastFiled = useRef(0);
  useEffect(() => {
    if (!filed || filed.at === lastFiled.current) return;
    lastFiled.current = filed.at;
    void load();
  }, [filed, load]);
  // 048. And when a thread changed elsewhere, another device or another
  // member, or the order did on another device.
  useChanged(["thread", "removed", "invitation", "order"], () => void load());

  // A fresh read takes over from the drawn order, unless a write is still
  // travelling and the read is from before it.
  const idle = writes.idle;
  useEffect(() => {
    if (idle()) setDrawnOrder(null);
  }, [groups, order, idle]);

  const current = drawnOrder ?? order;
  const { threads, empty } = myThreads(groups ?? [], loose, current);
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  const shown = moving ? moving.ids.flatMap((id) => byId.get(id) ?? []) : threads;
  const placed = useInPlace(shown, (thread) => `thread:${thread.id}`);
  // 2026-10-18. A thread left from its own page that this screen never drew
  // has its line at the top instead.
  const lines = useUndoEntries();
  const drawn = useRef(new Set<string>());
  for (const thread of threads) drawn.current.add(`thread:${thread.id}`);

  // The drag on the UI thread: how far the finger has gone, the scroll since
  // the lift, and the lift's scale.
  const scroll = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useSharedValue(0);
  const startScroll = useSharedValue(0);
  // Where the finger went down in the held cell.
  const downX = useSharedValue(0);
  const downY = useSharedValue(0);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const lift = useSharedValue(1);
  const onScroll = useAnimatedScrollHandler((event) => {
    // The field behind the plate slides against this list.
    prismShift.value = event.contentOffset.y * PRISM_SCROLL_FACTOR;
    scrollY.value = event.contentOffset.y;
  });
  // The lifted tile over the grid: from its first cell, by the finger and the
  // scroll since. Reduced motion lifts it without the scale.
  const floating = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value + scrollY.value - startScroll.value }, { scale: lift.value }],
  }));

  function open(thread: ThreadRow): void {
    router.push({ pathname: "/threads/[id]", params: { id: thread.id } });
  }

  function drop(ids: string[]): void {
    const before = current;
    setMoving(null);
    if (ids.join() === threads.map((thread) => thread.id).join()) return;
    void perform(
      {
        apply: () => setDrawnOrder({ sort: "mine", ids }),
        revert: () => setDrawnOrder(before),
        write: () => putThreadOrder("mine", ids),
        unwrite: () => putThreadOrder(before.sort, before.ids),
        did: ORDER_COPY.did,
        failed: ORDER_COPY.failed,
        place: ORDER_PLACE,
      },
      toast,
      writes,
    );
  }

  function sortBy(sort: ThreadSort): void {
    setChip(null);
    if (sort === current.sort) return;
    const before = current;
    void perform(
      {
        apply: () => setDrawnOrder({ ...before, sort }),
        revert: () => setDrawnOrder(before),
        write: () => putThreadOrder(sort),
        failed: ORDER_COPY.failed,
        place: ORDER_PLACE,
      },
      toast,
      writes,
    );
  }

  function menuFor(thread: ThreadRow): void {
    cells.current.get(thread.id)?.measureInWindow((x, y, w, h) => setMenu({ thread, at: { x, y, w, h } }));
  }

  function lifted(id: string): void {
    setMenu(null);
    const ids = threads.map((thread) => thread.id);
    setMoving({ id, from: ids.indexOf(id), ids, dragged: false });
  }

  // The finger, from the cell it went down in: where in that cell, plus how
  // far it has moved and the grid has scrolled since. Measuring the grid on
  // the screen instead arrived a frame after the first move, which read the
  // grid at the top of the screen and threw the held tile to the end of the
  // list and back. Within 64pt of the list's top or bottom edge, which sit
  // under the bar and over the plate, the grid scrolls.
  function over(x: number, y: number, absoluteY: number, far: boolean): void {
    setMoving((was) => {
      if (!was || (!far && !was.dragged)) return was;
      const to = cellUnder(was.from, x, y, m, was.ids.length);
      const ids = was.ids.indexOf(was.id) === to ? was.ids : moveThread(was.ids, was.id, to);
      return ids === was.ids && was.dragged ? was : { ...was, ids, dragged: true };
    });
    if (!far) return;
    if (absoluteY < EDGE_PT * 2) scroll.current?.scrollTo({ y: Math.max(0, scrollY.value - 12), animated: false });
    else if (absoluteY > height - EDGE_PT * 2) scroll.current?.scrollTo({ y: scrollY.value + 12, animated: false });
  }

  // Let go without moving: the menu. Otherwise the drop.
  function released(still: boolean): void {
    const was = movingNow.current;
    if (!was) return;
    const thread = byId.get(was.id);
    if (still && !was.dragged) {
      setMoving(null);
      if (thread) menuFor(thread);
    } else drop(was.ids);
  }

  // One gesture per tile, made once: a gesture rebuilt on a render is
  // re-attached, and the lift's own render would cancel the drag it started.
  // The handlers it calls are read fresh through a ref.
  const handlers = useRef({ lifted, over, released, open: (id: string) => byId.get(id) && open(byId.get(id)!) });
  handlers.current = { lifted, over, released, open: (id: string) => byId.get(id) && open(byId.get(id)!) };
  const gestures = useRef(new Map<string, ReturnType<typeof Gesture.Exclusive>>());
  function gesture(id: string) {
    const kept = gestures.current.get(id);
    if (kept) return kept;
    const call = {
      lifted: (one: string) => handlers.current.lifted(one),
      over: (x: number, y: number, absoluteY: number, far: boolean) => handlers.current.over(x, y, absoluteY, far),
      released: (still: boolean) => handlers.current.released(still),
      open: (one: string) => handlers.current.open(one),
    };
    const pan = Gesture.Pan()
      .activateAfterLongPress(HOLD_MS)
      .onStart((event) => {
        tx.value = 0;
        ty.value = 0;
        downX.value = event.x;
        downY.value = event.y;
        startScroll.value = scrollY.value;
        lift.value = withTiming(reduced ? 1 : 1.04, { duration: 140, reduceMotion: ReduceMotion.System });
        runOnJS(call.lifted)(id);
      })
      .onUpdate((event) => {
        tx.value = event.translationX;
        ty.value = event.translationY;
        const far = Math.hypot(event.translationX, event.translationY) >= STILL_PT;
        if (far && !reduced) lift.value = withTiming(1.05, { duration: 80, reduceMotion: ReduceMotion.System });
        runOnJS(call.over)(downX.value + event.translationX, downY.value + event.translationY + scrollY.value - startScroll.value, event.absoluteY, far);
      })
      .onEnd((event) => {
        runOnJS(call.released)(Math.hypot(event.translationX, event.translationY) < STILL_PT);
      })
      .onFinalize(() => {
        lift.value = 1;
      });
    const tap = Gesture.Tap()
      .maxDuration(HOLD_MS)
      .onEnd((_event, ok) => {
        if (ok) runOnJS(call.open)(id);
      });
    const made = Gesture.Exclusive(pan, tap);
    gestures.current.set(id, made);
    return made;
  }

  async function remove(thread: ThreadRow): Promise<void> {
    const result = await deleteThread(thread.id);
    if (!result) return;
    await load();
    // Which of the two happened, because leaving a shared thread destroys
    // nothing and saying "deleted" about it would be untrue.
    toast.show(
      result.deleted ? "Thread deleted" : "You left the thread",
      {
        label: "Undo",
        onPress: async () => {
          await restoreThread(thread.id);
          await load();
        },
      },
      { id: `thread:${thread.id}`, icon: result.deleted ? "trash-2" : "log-out", form: "slot" },
    );
  }

  async function edit(thread: ThreadRow): Promise<void> {
    setMenu(null);
    const bundle = await fetchThread(thread.id);
    if (bundle) setEditing(bundle);
    else toast.show("Couldn't open that thread", { label: "Try again", onPress: () => void edit(thread) });
  }

  async function saveEdit(id: string, change: Parameters<typeof editThread>[1]): Promise<void> {
    setEditing(null);
    const result = await editThread(id, change);
    if (!result || "labelsFull" in result) toast.show("Couldn't save that", { label: "Try again", onPress: () => void saveEdit(id, change) });
    void load();
  }

  async function make(shown: { name: string; icon: string; hue: number }, layout?: Layout): Promise<void> {
    const made = await createThread({ ...shown, ...(layout && layout !== "default" ? { layout } : {}) });
    if (!made) {
      toast.show("Couldn't make that thread", { label: "Try again", onPress: () => void make(shown, layout) });
      return;
    }
    void load();
    router.push({ pathname: "/threads/[id]", params: { id: made.id } });
  }

  function shift(thread: ThreadRow, by: number): void {
    const ids = threads.map((one) => one.id);
    drop(moveThread(ids, thread.id, ids.indexOf(thread.id) + by));
  }

  const bar = (
    <View className="h-appbar-height flex-row items-center px-gutter-screen">
      <Logo size={24} />
      {/* A bare glyph, as every bar control on the phones. */}
      <Pressable className="ml-auto" onPress={() => setMaking(true)} hitSlop={12} accessibilityRole="button" accessibilityLabel="New thread">
        <Glyph name="plus" size={24} color={COLOR.iconOnWell} />
      </Pressable>
    </View>
  );
  const ground = `flex-1 ${isAndroid ? "bg-a-surface" : "bg-surface-page"}`;

  if (groups === null) {
    return (
      <SafeAreaView className={ground} edges={["top"]}>
        {bar}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  const unplaced = [...lines.values()].filter(
    (entry) => entry.id.startsWith("thread:") && entry.form === "slot" && (empty || !drawn.current.has(entry.id)),
  );
  const unplacedLines = unplaced.map((entry) => (
    <View key={entry.id} className="border-b border-border-hairline">
      <UndoLine entry={entry} />
    </View>
  ));
  const strips = invitations.map((invitation) => <InvitationStrip key={invitation.memberId} invitation={invitation} />);
  const movingThread = moving ? byId.get(moving.id) : undefined;
  const from = moving ? cellOrigin(moving.from, m) : null;

  return (
    <SafeAreaView className={ground} edges={["top"]}>
      {bar}

      {empty ? (
        <>
          {/* 022. A strip stays over the empty state: a first thread may well
              be somebody else's. */}
          {strips.length > 0 ? <View className="pt-space-5">{strips}</View> : null}
          {unplacedLines}
          <QuietEmpty line="Threads appear here on their own, once there is enough in one place to be one." />
        </>
      ) : (
        <Animated.ScrollView ref={scroll} onScroll={onScroll} scrollEventThrottle={16} scrollEnabled={moving === null} contentContainerClassName="pb-space-9">
          <View className="flex-row items-center justify-between px-gutter-screen pb-space-6 pt-space-3">
            <Text className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 28 }} accessibilityRole="header">
              My threads
            </Text>
            <Pressable
              ref={chipRef}
              hitSlop={6}
              onPress={() => chipRef.current?.measureInWindow((x, y, w, h) => setChip({ x, y, w, h }))}
              accessibilityRole="button"
              accessibilityLabel={ORDER_COPY[current.sort]}
              accessibilityHint="Changes the order"
              className={`flex-row items-center gap-space-2 px-space-5 ${isAndroid ? "border border-border-strong" : "rounded-pill bg-surface-fill"}`}
              style={{ height: 32, ...(isAndroid ? { borderRadius: 8 } : { boxShadow: `inset 0 0 0 1px ${COLOR.edgeWell}` }) }}
            >
              <Text className="font-core font-medium text-text-primary" style={{ fontSize: 13.5 }}>
                {ORDER_COPY[current.sort]}
              </Text>
              <Glyph name="chevron-down" size={14} color={COLOR.iconOnWell} />
            </Pressable>
          </View>

          {strips}
          {unplacedLines}

          {/* 028. Not in a thread, as one row above the grid; it opens the
              full list. Not drawn when there is nothing in it.
              Dark theme: edges (design decisions, 2026-10-07). */}
          {loose && loose.count > 0 ? (
            <Pressable
              onPress={() => router.push("/threads/loose")}
              accessibilityRole="button"
              accessibilityLabel={`Not in a thread, ${loose.count}`}
              className="mx-gutter-screen mb-space-6 flex-row items-center gap-space-4 rounded-md bg-surface-fill px-space-6"
              style={{ minHeight: 48, boxShadow: `inset 0 0 0 1px ${COLOR.edgeWell}` }}
            >
              <Glyph name="inbox" size={18} color={COLOR.iconOnWell} />
              <Text className="flex-1 font-core font-medium text-text-primary" style={{ fontSize: 15 }}>
                Not in a thread
              </Text>
              <Text className="font-core text-text-secondary" style={{ fontSize: 13 }}>
                {loose.count}
              </Text>
              <Glyph name="chevron-right" size={16} color={COLOR.iconOnWell} />
            </Pressable>
          ) : null}

          <View className="flex-row flex-wrap px-gutter-screen" style={{ gap: m.gap }}>
            {placed.map((one) => {
              // A thread that went keeps its tile's place for its line.
              const slot = "slot" in one ? one.entry : one.line?.form === "slot" && !one.line.failed ? one.line : null;
              if (slot) {
                return (
                  <View key={slot.id} style={{ width: m.side, height: m.side, justifyContent: "center" }}>
                    <UndoLine entry={slot} radius={TILE_CORNER} />
                  </View>
                );
              }
              if ("slot" in one) return null;
              const thread = one.row;
              const isMoving = moving?.id === thread.id;
              return (
                <Animated.View key={thread.id} layout={SLIDE} style={{ width: m.side, opacity: moving && !isMoving ? 0.55 : 1 }}>
                  <Returned id={`thread:${thread.id}`}>
                    <GestureDetector gesture={gesture(thread.id)}>
                      <View
                        ref={(el) => {
                          if (el) cells.current.set(thread.id, el);
                          else cells.current.delete(thread.id);
                        }}
                        collapsable={false}
                        accessible
                        accessibilityRole="button"
                        accessibilityLabel={tileLabel(thread)}
                        accessibilityActions={[
                          { name: "activate" },
                          { name: "longpress", label: "Options" },
                          { name: "earlier", label: "Move earlier" },
                          { name: "later", label: "Move later" },
                        ]}
                        onAccessibilityAction={(event) => {
                          const name = event.nativeEvent.actionName;
                          if (name === "activate") open(thread);
                          else if (name === "earlier") shift(thread, -1);
                          else if (name === "later") shift(thread, 1);
                          else menuFor(thread);
                        }}
                      >
                        {isMoving && moving.dragged ? (
                          <View
                            className="border-border-strong"
                            style={{ width: m.side, height: m.side, borderRadius: TILE_CORNER, borderWidth: 1.5, borderStyle: "dashed" }}
                          />
                        ) : (
                          <ThreadTile thread={thread} side={m.side} />
                        )}
                      </View>
                    </GestureDetector>
                  </Returned>
                  {one.line ? <UndoLine entry={one.line} /> : null}
                </Animated.View>
              );
            })}
            {moving?.dragged && movingThread && from ? (
              <Animated.View
                pointerEvents="none"
                style={[{ position: "absolute", left: GUTTER + from.x, top: from.y, borderRadius: TILE_CORNER, boxShadow: COLOR.shadowCallout }, floating]}
              >
                <ThreadTile thread={movingThread} side={m.side} />
              </Animated.View>
            ) : null}
          </View>
          <PlateSpace />
        </Animated.ScrollView>
      )}

      {/* The tile's menu, under it, or over it when it would leave the screen. */}
      <Modal transparent visible={menu !== null} animationType="fade" onRequestClose={() => setMenu(null)}>
        <Pressable className="flex-1" onPress={() => setMenu(null)} accessibilityLabel="Close">
          {menu ? (
            <Menu
              at={menu.at}
              screen={height}
              items={[
                { label: "Edit thread", icon: "pencil", onPress: () => void edit(menu.thread) },
                {
                  label: "Share",
                  icon: "share-2",
                  onPress: () => {
                    setMenu(null);
                    setSharing(menu.thread);
                  },
                },
                removal(menu.thread, (held, leaves) => {
                  setMenu(null);
                  if (leaves) setLeaving(held);
                  else void remove(held);
                }),
              ]}
            />
          ) : null}
        </Pressable>
      </Modal>

      {/* The order chip's menu, with the check on the one showing. */}
      <Modal transparent visible={chip !== null} animationType="fade" onRequestClose={() => setChip(null)}>
        <Pressable className="flex-1" onPress={() => setChip(null)} accessibilityLabel="Close">
          {chip ? (
            <Menu
              at={chip}
              screen={height}
              alignEnd
              caption={ORDER_COPY.caption}
              items={(["newest", "mine"] as const).map((sort) => ({
                label: ORDER_COPY[sort],
                icon: current.sort === sort ? "check" : null,
                checked: current.sort === sort,
                disabled: sort === "mine" && current.ids.length === 0,
                onPress: () => sortBy(sort),
              }))}
            />
          ) : null}
        </Pressable>
      </Modal>

      <ShareSheet
        open={sharing !== null}
        threadId={sharing?.id ?? ""}
        threadName={sharing?.name ?? ""}
        viewerId={me?.accountId ?? null}
        onClose={() => setSharing(null)}
        onChanged={() => void load()}
      />
      <ConfirmSheet
        open={leaving !== null}
        title={leaveAsk(leaving?.name ?? "")}
        body={staysWith(leaving?.others ?? [])}
        action="Leave"
        danger
        onConfirm={() => {
          const held = leaving;
          setLeaving(null);
          if (held) void remove(held);
        }}
        onClose={() => setLeaving(null)}
      />
      {editing ? <EditThreadSheet thread={editing} from="name" onClose={() => setEditing(null)} onSave={(change) => void saveEdit(editing.id, change)} /> : null}
      {making ? (
        <EditThreadSheet
          thread={{ id: "new", name: "", icon: DEFAULT_THREAD_ICON, hue: leastUsedHue(threads.map((thread) => thread.hue)), iconSetBy: "offload" }}
          from="name"
          heading="New thread"
          action="Create"
          onClose={() => setMaking(false)}
          onSave={(change, shown) => void make(shown, change.layout)}
        />
      ) : null}
      <ToastHost state={toast} />
    </SafeAreaView>
  );
}

/** Delete on a thread of your own, Leave on a shared one, which asks. */
function removal(thread: ThreadRow, onPress: (thread: ThreadRow, leaves: boolean) => void): MenuItem {
  const leaves = (thread.others ?? []).length > 0;
  return { label: leaves ? "Leave thread" : "Delete thread", icon: leaves ? "log-out" : "trash-2", danger: true, onPress: () => onPress(thread, leaves) };
}

interface MenuItem {
  label: string;
  icon: string | null;
  danger?: boolean;
  checked?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

/** A small raised menu anchored to what opened it: under it, or over it when
 *  it would leave the screen. */
function Menu({ at, screen, items, caption, alignEnd = false }: { at: Anchor; screen: number; items: MenuItem[]; caption?: string; alignEnd?: boolean }) {
  const COLOR = useColors();
  const below = at.y + at.h + 6 + MENU_HEIGHT < screen - 40;
  const width = 236;
  return (
    <View
      accessibilityRole="menu"
      className="absolute rounded-md bg-surface-raised p-space-2"
      style={{
        width,
        left: alignEnd ? at.x + at.w - width : at.x,
        ...(below ? { top: at.y + at.h + 6 } : { bottom: screen - at.y + 6 }),
        boxShadow: COLOR.shadowCallout,
      }}
    >
      {items.map((item) => (
        <Pressable
          key={item.label}
          onPress={item.onPress}
          disabled={item.disabled}
          accessibilityRole="menuitem"
          accessibilityState={{ disabled: item.disabled ?? false, ...(item.checked !== undefined ? { checked: item.checked } : {}) }}
          className="min-h-tap-min flex-row items-center gap-space-4 rounded-sm px-space-4"
          style={{ opacity: item.disabled ? 0.45 : 1 }}
        >
          <View style={{ width: 16 }}>{item.icon ? <Glyph name={item.icon} size={16} color={item.danger ? COLOR.danger : COLOR.iconOnWell} /> : null}</View>
          <Text className={`font-core font-medium ${item.danger ? "text-text-danger" : "text-text-primary"}`} style={{ fontSize: 15 }}>
            {item.label}
          </Text>
        </Pressable>
      ))}
      {caption ? (
        <Text className="px-space-4 pb-space-3 pt-space-2 font-core text-text-tertiary" style={{ fontSize: 12.5, lineHeight: 17 }}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}
