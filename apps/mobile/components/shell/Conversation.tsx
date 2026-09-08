// The conversation, as a sheet that folds.
//
// From `LiveConversation.jsx`, and it is the one piece of this feature with no
// web equivalent to check against. Three states on one shared value: **raised**
// over the screen with its own composer, **folded** to a header above the main
// composer, **closed**.
//
// Built on Reanimated rather than a sheet library on purpose. A sheet library
// gives open, closed, snap points and a backdrop; the fold is none of those. It
// is a sheet that collapses into a header inside a different container while
// keeping every turn and the draft, and wrapping a library to get that is
// reliably worse than owning the animation.
//
// The turns and the draft live in the provider above this, so folding cannot
// lose them, and the Undo toast is rendered above the sheet for the same
// reason: an eight second window that vanishes because somebody tidied the
// screen was not eight seconds.

import { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { Composer } from "./Composer";
import { PrismField } from "../PrismField";
import { answerPending } from "../../lib/calendars";
import { useRouter } from "expo-router";
import { useConversation, type Turn } from "./conversation-context";

const isAndroid = Platform.OS === "android";

/** The dim behind a raised conversation. Full screen, and its own component so
 *  the shell can put it under the whole bottom column rather than inside it. */
export function ConversationScrim() {
  const COLOR = useColors();
  const conversation = useConversation();
  const raised = conversation.live !== null && !conversation.folded;
  const progress = useSharedValue(0);
  // Mounted for as long as it is on screen, which is longer than `raised` is
  // true: unmounting on the flag is what made both this and the sheet vanish
  // rather than leave.
  const [shown, setShown] = useState(raised);

  useEffect(() => {
    if (raised) setShown(true);
  }, [raised]);

  useEffect(() => {
    if (!shown) return;
    progress.value = withTiming(
      raised ? 1 : 0,
      { duration: 280, reduceMotion: ReduceMotion.System },
      (done) => {
        if (done && !raised) runOnJS(setShown)(false);
      },
    );
  }, [raised, shown, progress]);

  const scrim = useAnimatedStyle(() => ({ opacity: progress.value * 0.35 }));
  if (!shown) return null;

  return (
    <Animated.View
      style={[
        { position: "absolute", inset: 0, backgroundColor: COLOR.scrim },
        scrim,
      ]}
    >
      <Pressable
        className="flex-1"
        onPress={conversation.fold}
        accessibilityLabel="Fold"
      />
    </Animated.View>
  );
}

export function Conversation() {
  const COLOR = useColors();
  const conversation = useConversation();
  const raised = conversation.live !== null && !conversation.folded;
  const progress = useSharedValue(0);
  const [shown, setShown] = useState(raised);

  // How far a finger has dragged it down. Separate from `progress` so the sheet
  // follows the hand rather than animating to a state: a drag that does not go
  // far enough springs back from wherever it got to, and one that folds it
  // hands over to the exit from exactly where the finger let go.
  const drag = useSharedValue(0);

  // Its own height, so putting it away is a roll off the bottom rather than a
  // 60px nudge. Measured rather than assumed: it is as tall as the
  // conversation in it, up to the cap below.
  const height = useSharedValue(0);

  useEffect(() => {
    if (raised) setShown(true);
  }, [raised]);

  useEffect(() => {
    if (!shown) return;
    // Reduced motion removes the movement rather than shortening it, handled
    // by Reanimated's own flag rather than a second code path.
    progress.value = withTiming(
      raised ? 1 : 0,
      { duration: 280, reduceMotion: ReduceMotion.System },
      (done) => {
        if (!done || raised) return;
        drag.value = 0;
        runOnJS(setShown)(false);
      },
    );
  }, [raised, shown, progress, drag]);

  // In pixels, not `78%`. The sheet's parent is the shell's column, which is
  // anchored to the bottom with no height of its own, so a percentage resolved
  // against the *unclamped* sheet: the column sized itself to the whole
  // conversation, the sheet then shrank to 78% of that, and the surplus column
  // height showed as a band of nothing under the tabs.
  const { height: screen } = useWindowDimensions();

  const foldNow = (): void => {
    conversation.fold();
  };

  /** Pull it down to put it away.
   *
   *  Past a third of the way, or thrown hard enough, it folds; short of that it
   *  springs back. Distance alone would make a fast flick feel ignored and
   *  velocity alone would fold on a careless brush. */
  const pull = Gesture.Pan()
    .activeOffsetY([-12, 12])
    .onUpdate((event) => {
      drag.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY > 110 || event.velocityY > 900) {
        runOnJS(foldNow)();
        return;
      }
      drag.value = withSpring(0, { damping: 22, stiffness: 240 });
    });

  // No fade. It goes down behind the plate, which paints after it, so the
  // slide is the whole animation and a fade on top of it only makes the sheet
  // look like it is dissolving on the way.
  const sheet = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          (1 - progress.value) * (height.value || screen * 0.78) + drag.value,
      },
    ],
  }));

  if (!shown) return null;

  return (
    // An ordinary block in the shell's bottom column, above the plate. It was
    // absolutely positioned at `bottom: 0` and the plate is too, so the tabs
    // painted straight over the sheet's own composer. One column, sheet on top,
    // which is also how the kit lays it out.
    <Animated.View
      onLayout={(event) => {
        height.value = event.nativeEvent.layout.height;
      }}
      style={[sheet, { maxHeight: screen * 0.78 }]}
      // `surface-plate`, the same token the plate below is painted with. A
      // raised conversation rests on the plate rather than replacing it, so
      // two different values here read as a seam across the join.
      className={`bg-surface-plate ${isAndroid ? "rounded-t-a-xl" : "rounded-t-lg"}`}
    >
      {/* The header is the handle: tap it or pull it down to put the
          conversation away. The chevron stays because a gesture with no visible
          affordance is one nobody finds, and the two nested controls take their
          own taps before this one sees them. */}
      <GestureDetector gesture={pull}>
        <Pressable
          onPress={foldNow}
          accessibilityLabel="Fold the conversation away"
        >
          {/* A grab handle, because "you can pull this" has to be visible
              somewhere and the chevron alone reads as a button rather than an
              edge you can take hold of. Its own centred row rather than an
              absolute box: absolute plus `top: 6` inside the header's flex row
              laid it over the title. */}
          <View className="items-center pt-space-3">
            <View
              className={`rounded-pill ${isAndroid ? "bg-a-outline" : "bg-border-strong"}`}
              style={{ width: 36, height: 4 }}
            />
          </View>

          <View className="flex-row items-center gap-space-4 px-gutter-screen pb-space-3 pt-space-3">
            <Text
              className={`flex-1 font-core font-medium ${
                isAndroid ? "text-a-on" : "text-text-primary"
              }`}
              style={{ fontSize: 14 }}
              numberOfLines={1}
            >
              {conversation.live?.title}
            </Text>
            <Pressable
              onPress={foldNow}
              hitSlop={10}
              accessibilityLabel="Fold away"
            >
              <Glyph name="chevron-down" size={18} color={COLOR.iconOnWell} />
            </Pressable>
            <Pressable
              onPress={conversation.close}
              hitSlop={10}
              accessibilityLabel="Close"
            >
              <Glyph name="x" size={18} color={COLOR.iconOnWell} />
            </Pressable>
          </View>
        </Pressable>
      </GestureDetector>

      <Turns />

      {/* No safe-area padding here: the plate below owns the bottom inset, and
          adding it twice left a gap the height of the gesture bar. */}
      {/* **The field follows the composer, because the composer is what it is
          for.** The design keeps one field over one continuous plate whose
          height never changes, and in that layout a raised sheet rests on the
          plate and the plate keeps its composer. Here the sheet and the plate
          are siblings in one column, so the sheet brings its own composer and
          the plate hides its own: the band the eye actually sees is this
          composer sitting directly on top of the tabs.
        
          So the field moves with it. One field at a time, never two, which is
          the failure the design warns about: two boxes each mapping the whole
          texture, squashed and broken at the seam. The tabs below keep no field
          of their own, which is also where the veil would have been opaque
          anyway. */}
      <View className="overflow-hidden">
        <PrismField
          variant="band"
          veil="graded"
          pulse={conversation.filed?.at ?? 0}
        />
        <Composer placeholder="Add to this" />
      </View>
    </Animated.View>
  );
}

function Turns() {
  const { turns, writing, finish } = useConversation();
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    scroll.current?.scrollToEnd({ animated: true });
  }, [turns.length, writing]);

  // The keyboard changes the height under the log, so the end moves. Without
  // this the view stays where it was and shows the middle of the conversation.
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      scroll.current?.scrollToEnd({ animated: true }),
    );
    return () => show.remove();
  }, []);

  return (
    <ScrollView
      ref={scroll}
      contentContainerClassName="gap-space-4 px-gutter-screen pb-space-4"
      // Shrink, never grow. The composer keeps its height and the log takes
      // what is left, so a long conversation scrolls instead of pushing the
      // field out of the sheet.
      style={{ flexShrink: 1, flexGrow: 0 }}
    >
      {turns.map((turn) =>
        turn.from === "you" ? (
          <Yours
            key={turn.id}
            turn={turn}
            onFinish={() => void finish(turn.id)}
          />
        ) : (
          <Theirs key={turn.id} turn={turn} />
        ),
      )}
      {writing ? <Writing /> : null}
    </ScrollView>
  );
}

function Yours({ turn, onFinish }: { turn: Turn; onFinish: () => void }) {
  const COLOR = useColors();
  const hurt = turn.state === "failed" || turn.state === "partial";

  return (
    <View style={{ alignSelf: "flex-end", maxWidth: "84%" }}>
      {/* A turn that failed, or half worked, carries its own failure: the
          message you wrote takes a clay border and one clay line beneath it.
          Tighter than a tinted card in the middle of a conversation, and the
          failure is attached to the thing that failed. */}
      <View
        className={`border px-space-5 py-space-3 ${
          hurt ? "border-clay-600 bg-blue-50" : "border-blue-100 bg-blue-50"
        }`}
        style={{
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          borderBottomLeftRadius: 16,
          borderBottomRightRadius: 4,
        }}
      >
        <Text
          className="font-core text-ink-950"
          style={{ fontSize: 15, lineHeight: 22 }}
        >
          {turn.text}
        </Text>
      </View>

      {/* 👀 means offload has it. Done means offload *did* something, from the
          record rather than from the reply: a question that got an answer and a
          request that was refused both used to wear a tick. */}
      {turn.state === "seen" ? (
        <Mark>
          <Text
            accessibilityLabel="seen, not answered yet"
            style={{ fontSize: 15 }}
          >
            👀
          </Text>
        </Mark>
      ) : null}
      {turn.state === "answered" && turn.did ? (
        <Mark done>
          <Glyph name="check" size={11} color={COLOR.onSolid} />
          <Text
            className="font-core font-medium text-text-on-solid"
            style={{ fontSize: 11 }}
          >
            Done
          </Text>
        </Mark>
      ) : null}

      {/* The readme's own words, and the same ones web uses. They diverged
          here: this said "Saved what landed. The rest didn't come through."
          and offered Finish, which is a second way of saying the same thing in
          a product with one voice. */}
      {turn.state === "partial" ? (
        <View className="mt-space-2 flex-row items-center gap-space-3">
          <Text className="font-core text-text-danger" style={{ fontSize: 13 }}>
            offload did not finish that one.
          </Text>
          <Pressable onPress={onFinish} hitSlop={8}>
            <Text
              className="font-core font-medium text-text-accent"
              style={{ fontSize: 13 }}
            >
              Finish it
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/** The mark hangs off the bubble's bottom left in its own chip, so it never
 *  crowds the text and reads the same on one line or five. */
function Mark({
  done,
  children,
}: {
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View
      className={`flex-row items-center gap-space-2 rounded-pill px-space-3 ${
        done ? "bg-moss-600" : "border border-border-hairline bg-paper"
      }`}
      style={{
        alignSelf: "flex-start",
        height: 24,
        marginTop: -10,
        marginLeft: -6,
      }}
    >
      {children}
    </View>
  );
}

function Theirs({ turn }: { turn: Turn }) {
  const COLOR = useColors();
  const router = useRouter();
  const { fold } = useConversation();
  return (
    <View
      className={`px-space-5 py-space-4 ${isAndroid ? "bg-a-c" : "bg-ink-50"}`}
      style={{
        alignSelf: "flex-start",
        maxWidth: "92%",
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderBottomRightRadius: 16,
        borderBottomLeftRadius: 4,
      }}
    >
      <Text
        className={`font-quiet ${isAndroid ? "text-a-on" : "text-text-primary"}`}
        style={{ fontSize: 16, lineHeight: 24 }}
      >
        {turn.text}
      </Text>

      {/* A calendar write offload has not made yet.
          **The reply carries the control that answers it**, which is the same
          rule the failure line follows: a sentence cannot be clicked, so the
          thing that acts on it sits next to it. Without this the proposal is
          announced and then expires an hour later having done nothing. */}
      {turn.waiting ? <Waiting turn={turn} /> : null}

      {/* Where it actually filed, from the content rows rather than from the
          sentence, so a chip can never point somewhere nothing landed. */}
      {turn.threads && turn.threads.length > 0 ? (
        <View className="mt-space-3 flex-row flex-wrap gap-space-2">
          {turn.threads.map((thread) => (
            // Tappable, and it folds on the way out. A reply naming where it
            // filed something and not taking you there is a sentence about a
            // place rather than a way to it, and the conversation should get
            // out of the way rather than close: you may want to keep dumping.
            <Pressable
              key={thread.id}
              onPress={() => {
                fold();
                router.push({
                  pathname: "/threads/[id]",
                  params: { id: thread.id },
                });
              }}
              className="flex-row items-center gap-space-2 rounded-pill bg-surface-accent-soft px-space-4"
              style={{ height: 26 }}
            >
              <Glyph name="lasso" size={12} color={COLOR.accent} />
              <Text
                className="font-core text-text-accent"
                style={{ fontSize: 12.5 }}
              >
                {thread.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Writing() {
  return (
    <View
      className={`flex-row items-center gap-space-2 px-space-5 py-space-4 ${
        isAndroid ? "bg-a-c" : "bg-ink-50"
      }`}
      style={{
        alignSelf: "flex-start",
        borderRadius: 16,
        borderBottomLeftRadius: 4,
      }}
      accessibilityLabel="offload is writing"
    >
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          className="rounded-pill bg-ink-300"
          style={{ width: 6, height: 6 }}
        />
      ))}
    </View>
  );
}

/** Confirm or decline a calendar write offload proposed.
 *
 *  **Names who finds out and nothing else.** No explanation of why offload
 *  asked: the two controls beside it are the answer, and a paragraph about
 *  guests would be offload diagnosing itself.
 *
 *  Nothing has reached Google until Add lands. The server runs the outward test
 *  again against live state, because a calendar can be shared in the minutes
 *  somebody takes to decide. */
function Waiting({ turn }: { turn: Turn }) {
  const { resolveWaiting } = useConversation();
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const [failedToSend, setFailedToSend] = useState(false);

  if (!turn.waiting || gone) return null;

  const answer = async (choice: "confirm" | "decline") => {
    if (busy) return;
    setBusy(true);
    const ok = await answerPending(turn.waiting!.id, choice);
    setBusy(false);
    if (ok) {
      setGone(true);
      resolveWaiting(turn.id);
    } else {
      // What happened and the way forward, never why. This cannot see whether
      // the proposal expired or the network did.
      setFailedToSend(true);
    }
  };

  return (
    <View className="mt-space-4 gap-space-3">
      <Text
        className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
        style={{ fontSize: 13, lineHeight: 18 }}
      >
        {turn.waiting.because}
      </Text>

      {failedToSend ? (
        <Text
          className="font-core text-text-danger"
          style={{ fontSize: 13, lineHeight: 18 }}
          accessibilityRole="alert"
        >
          That did not go through. Try again.
        </Text>
      ) : null}

      <View className="flex-row items-center gap-space-4">
        <Pressable
          onPress={() => void answer("confirm")}
          disabled={busy}
          className={`min-h-tap-min items-center justify-center rounded-pill px-space-6 ${
            isAndroid ? "bg-blue-600" : "bg-ink-950"
          }`}
          accessibilityRole="button"
        >
          <Text
            className="font-core font-medium text-text-inverse"
            style={{ fontSize: 15 }}
          >
            Add it
          </Text>
        </Pressable>

        <Pressable
          onPress={() => void answer("decline")}
          disabled={busy}
          className="min-h-tap-min justify-center"
          accessibilityRole="button"
        >
          <Text
            className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
            style={{ fontSize: 15 }}
          >
            Not now
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
