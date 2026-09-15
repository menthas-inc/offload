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
  Linking,
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
import { AnswerResults } from "./AnswerResult";
import { Reply } from "./Reply";
import { isRich } from "@offload/markup";
import { useColors } from "../../lib/colors";
import { Composer } from "./Composer";
import { PrismField } from "../PrismField";
import { answerPending } from "../../lib/calendars";
import { useRouter } from "expo-router";
import { useConversation, type Pin, type Turn } from "./conversation-context";

const isAndroid = Platform.OS === "android";

/** The dim behind a raised conversation. Full screen, and its own component so
 *  the shell can put it under the whole bottom column rather than inside it. */
export function ConversationScrim() {
  const COLOR = useColors();
  const conversation = useConversation();
  const raised = conversation.raised;
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
        onPress={conversation.pin ? conversation.dismissPin : conversation.fold}
        accessibilityLabel={conversation.pin ? "Close" : "Fold"}
      />
    </Animated.View>
  );
}

export function Conversation() {
  const COLOR = useColors();
  const conversation = useConversation();
  const { pin, raised } = conversation;
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

  // A pin folds to nothing: there is no header row for it to collapse into,
  // since `FoldedHeader` in `Plate.tsx` reads `live`, not `pin`. Putting one
  // away is a close in every sense, never a fold.
  const foldNow = (): void => {
    if (pin) conversation.dismissPin();
    else conversation.fold();
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
          accessibilityLabel={pin ? "Close" : "Fold the conversation away"}
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
              {pin ? pin.title : conversation.live?.title}
            </Text>
            {pin ? null : (
              <Pressable
                onPress={foldNow}
                hitSlop={10}
                accessibilityLabel="Fold away"
              >
                <Glyph name="chevron-down" size={18} color={COLOR.iconOnWell} />
              </Pressable>
            )}
            <Pressable
              onPress={pin ? conversation.dismissPin : conversation.close}
              hitSlop={10}
              accessibilityLabel="Close"
            >
              <Glyph name="x" size={18} color={COLOR.iconOnWell} />
            </Pressable>
          </View>
        </Pressable>
      </GestureDetector>

      {pin ? <PinnedTarget pin={pin} /> : <Turns />}

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
        <Composer
          placeholder={pin ? pin.placeholder : "Add to this"}
          maxLength={pin?.charLimit}
          showCounter={pin?.showCounter}
          submitLabel={pin ? "Add" : "Send"}
        />
      </View>
    </Animated.View>
  );
}

/** What a `+` is pinned to, in the conversation area rather than the field:
 *  the one honest place for it, since a `+` genuinely cannot go anywhere
 *  else. An ordinary dump made from a thread may still default there without
 *  being pinned to it, which is a different claim and draws nothing here. */
function PinnedTarget({ pin }: { pin: Pin }) {
  const COLOR = useColors();
  return (
    <View className="flex-row items-center px-gutter-screen pb-space-4">
      <View
        className="flex-row items-center gap-space-2 rounded-pill bg-surface-accent-soft px-space-4"
        style={{ height: 26 }}
      >
        <Glyph name="lasso" size={12} color={COLOR.accent} />
        <Text className="font-core text-text-accent" style={{ fontSize: 12.5 }}>
          In thread {pin.threadName}
        </Text>
      </View>
    </View>
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

  /** Which reply belongs to which sent message.
   *
   *  **Matched on the turn id they share, not on the reply's own id.** The
   *  composer builds a live reply as `<messageId>-reply`, and a reply loaded
   *  from the tail has its real id instead, so a suffix rule linked them during
   *  the session and silently stopped after a reload: the footer drew under the
   *  sent bubble again, and a `replace` that found nothing to strip matched the
   *  reply against itself, so it drew twice. Both messages of a turn carry the
   *  same `turnId` on every path, which is the thing that was always true. */
  const answered = new Map<string, Turn>();
  const replied = new Set<string>();
  for (const reply of turns) {
    if (reply.from !== "offload" || !reply.turnId) continue;
    const sent = turns.find((other) => other.from === "you" && other.turnId === reply.turnId);
    if (!sent) continue;
    answered.set(reply.id, sent);
    replied.add(sent.id);
  }

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
            // **Only when nothing answered it.** The footer belongs to the turn,
            // and the turn ends at the reply when there is one: drawn on the
            // sent bubble regardless, the sources for an answer sat above the
            // answer they were sources for.
            footer={!replied.has(turn.id)}
            onFinish={() => void finish(turn.id)}
          />
        ) : (
          <Theirs key={turn.id} turn={turn} sent={answered.get(turn.id) ?? null} />
        ),
      )}
      {writing ? <Working /> : null}
    </ScrollView>
  );
}

function Yours({
  turn,
  footer,
  onFinish,
}: {
  turn: Turn;
  footer: boolean;
  onFinish: () => void;
}) {
  const COLOR = useColors();
  // **`cancelled` is deliberately not here.** The clay border says something
  // went wrong, and nothing did: somebody pressed Stop.
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

      {/* Everything about this turn that is not a sentence, in one row that
          belongs to the turn rather than to either bubble. The marks used to be
          positioned into this bubble's bottom corner and the pills drawn under
          whichever turn happened to carry them; a turn with a source as well
          has three things to report and, on an ordinary filing, no reply to
          report them in. */}
      {footer ? <TurnFooter turn={turn} /> : null}

      {/* The readme's own words, and the same ones web uses. They diverged
          here: this said "Saved what landed. The rest didn't come through."
          and offered Finish, which is a second way of saying the same thing in
          a product with one voice. */}
      {turn.state === "partial" ? (
        <View className="mt-space-2 flex-row items-center gap-space-3">
          <Text className="font-core text-text-danger" style={{ fontSize: 13 }}>
            Didn't finish that one.
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

      {/* 017. **One word, and nothing beside it.** `partial` gets Finish because
          offload stopped by accident and finishing is what somebody wants;
          this one they stopped themselves, and offering to undo their own
          decision is the product arguing with them. The footer above already
          says what landed, so this does not repeat it.

          Secondary rather than danger: nothing went wrong. */}
      {turn.state === "cancelled" ? (
        <Text
          className={`mt-space-2 font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
          style={{ fontSize: 13 }}
        >
          Stopped.
        </Text>
      ) : null}
    </View>
  );
}


/** Where it actually filed, from the content rows rather than from the
 *  sentence, so a chip can never point somewhere nothing landed.
 *
 *  **On either turn.** It used to belong to the reply, and a dump that was
 *  simply filed says nothing back, so the thread it went to was named nowhere
 *  at all. Drawn under whichever turn carries the threads: the reply when there
 *  is one, the message somebody sent when there is not. */
function TurnFooter({ turn }: { turn: Turn }) {
  const COLOR = useColors();
  const router = useRouter();
  const { fold } = useConversation();

  const sources = turn.sources ?? [];
  // Three, then a count. Six reads are possible in one turn and six chips under
  // a one sentence reply is a footnote section.
  const shown = sources.slice(0, 3);
  const hidden = sources.length - shown.length;
  // **Done means the turn finished and did something**, which is why
  // `answered` is in the condition and not just `did`. A partial turn that filed
  // one row wore a Done mark and the "Didn't finish that one." line at the same
  // time, which is the screen contradicting itself.
  const state = turn.state === "answered" && turn.did ? "done" : null;
  const refs = turn.threads ?? [];

  // An empty footer is no footer, never a 26px gap.
  if (!state && refs.length === 0 && sources.length === 0) return null;

  return (
    <View className="mt-space-3 flex-row flex-wrap items-center gap-space-2">
      {/* Order is fixed: what happened, where it landed, where it came from.

          **There is no `seen` mark any more.** 👀 sat here from 003 until 15
          September, and it was the product's only emoji. It said "offload has
          this and has not answered yet", which is exactly what the writing
          indicator says, at the same moment, a few lines below. Two marks for
          one state, and the one that stayed is the one that also says work is
          happening. */}
      {state === "done" ? (
        <View
          className="flex-row items-center gap-space-2 rounded-pill bg-moss-600 px-space-3"
          style={{ height: 24 }}
        >
          <Glyph name="check" size={11} color={COLOR.onBrand} />
          <Text
            className="font-core font-medium text-text-on-solid"
            style={{ fontSize: 11 }}
          >
            Done
          </Text>
        </View>
      ) : null}

      {refs.map((thread) => (
        // Tappable, and it folds on the way out. A reply naming where it filed
        // something and not taking you there is a sentence about a place rather
        // than a way to it, and the conversation should get out of the way
        // rather than close: you may want to keep dumping.
        <Pressable
          key={thread.id}
          onPress={() => {
            fold();
            router.push({ pathname: "/threads/[id]", params: { id: thread.id } });
          }}
          className="flex-row items-center gap-space-2 rounded-pill bg-surface-accent-soft px-space-4"
          style={{ height: 26 }}
        >
          <Glyph name="lasso" size={12} color={COLOR.accent} />
          <Text className="font-core text-text-accent" style={{ fontSize: 12.5 }}>
            {thread.name}
          </Text>
        </Pressable>
      ))}

      {/* **Outline, never moss.** Moss means "offload did this, you didn't"
          everywhere in this system, and a citation is the opposite: evidence of
          where a fact came from rather than something offload worked out.
          It is also the only thing in a conversation that leaves the app, and
          what makes that allowable is the source of the string: a domain from
          the record of what was read, not a word the page chose. */}
      {shown.map((source) => (
        <Pressable
          key={source.url}
          onPress={() => void Linking.openURL(source.url)}
          accessibilityRole="link"
          accessibilityLabel={`Open ${source.domain}`}
          className="flex-row items-center gap-space-2 rounded-pill border border-border-strong px-space-4"
          style={{ height: 26, maxWidth: 220 }}
        >
          <Glyph name="link" size={12} color={COLOR.iconOnWell} />
          <Text
            className="font-core text-text-secondary"
            style={{ fontSize: 12.5 }}
            numberOfLines={1}
          >
            {source.domain}
          </Text>
        </Pressable>
      ))}

      {/* Text, not a chip and not a control: there is no screen listing what a
          turn read, and a chip would promise one. */}
      {hidden > 0 ? (
        <Text className="font-core text-text-tertiary" style={{ fontSize: 12.5 }}>
          and {hidden} more
        </Text>
      ) : null}
    </View>
  );
}

function Theirs({ turn, sent }: { turn: Turn; sent: Turn | null }) {
  const COLOR = useColors();
  const router = useRouter();
  const { fold, tickFound } = useConversation();
  return (
    <View className="self-stretch">
    <View
      className={`px-space-5 py-space-4 ${isAndroid ? "bg-a-c" : "bg-ink-50"}`}
      style={{
        // **A bubble hugs a sentence and has to stop hugging a list.**
        // Shrink-wrapping takes the width from the first line, so every list
        // item that wrapped afterwards was drawn outside the bubble it belongs
        // to, and the bubble came out narrower than the plain ones above it.
        // A reply with blocks in it takes the full measure instead.
        alignSelf: isRich(turn.text) ? "stretch" : "flex-start",
        maxWidth: "92%",
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderBottomRightRadius: 16,
        borderBottomLeftRadius: 4,
      }}
    >
      <Reply
        text={turn.text}
        className={`font-quiet ${isAndroid ? "text-a-on" : "text-text-primary"}`}
        style={{ fontSize: 16, lineHeight: 24 }}
      />

      {/* A calendar write offload has not made yet.
          **The reply carries the control that answers it**, which is the same
          rule the failure line follows: a sentence cannot be clicked, so the
          thing that acts on it sits next to it. Without this the proposal is
          announced and then expires an hour later having done nothing. */}
      {turn.waiting ? <Waiting turn={turn} /> : null}

    </View>

      {/* The turn's footer, under the thing it describes and **outside the
          bubble**, which is the whole point of it: it is not a quotation and
          nothing in it is offload speaking. Inside, the chips were enclosed by
          the reply and read as part of the sentence.

          The state and the pills come from the message that was sent, not from
          this reply: what offload did is a fact about the turn. */}
      {sent ? <TurnFooter turn={sent} /> : null}

      {/* **Below the bubble, not inside it.** A row's press fill bleeds to its
          pane's padded edge by one space step, which is a turn's own padding,
          so inside a bubble the two cancel and a square fill runs out under a
          rounded corner. The calendar proposal stays inside because it is one
          fixed control acting on the sentence; this is a list with a surface of
          its own. */}
      {turn.found && turn.found.length > 0 ? (
        <AnswerResults
          found={turn.found}
          onToggle={(row) => void tickFound(turn.id, row)}
          onOpenThread={(threadId) => {
            fold();
            router.push({ pathname: "/threads/[id]", params: { id: threadId } });
          }}
        />
      ) : null}
    </View>
  );
}

/** How long a turn runs before it is worth saying anything about it. 017.
 *
 *  Under this, the three dots are the honest answer: a line appearing and being
 *  replaced twice inside a second is noise, and most turns finish here.
 *
 *  **Not the same number as the way out.** Saying what it is doing is
 *  reassurance and comes early; offering to stop is an admission this is taking
 *  too long and comes later. One number for both would either delay the
 *  reassurance or offer the escape to somebody who did not need it. */
const SAY_AFTER_MS = 2500;

/** When the way out appears. The product owner's number. */
const STOP_AFTER_MS = 10_000;

/** What offload is doing, and past ten seconds a way to stop it.
 *
 *  **Both live where the three dots already were**, in the conversation area the
 *  pinned composer has to itself, because the alternative is a toast and a toast
 *  takes the only control away with it when it clears. This has no mock; the
 *  divergence is logged.
 *
 *  It re-renders on a clock rather than on the step, because the two thresholds
 *  are times and nothing else moves them: a turn can sit on one line for eight
 *  seconds and the way out still has to arrive. */
function Working() {
  const { working, stop } = useConversation();
  const [elapsed, setElapsed] = useState(0);

  const since = working?.since ?? null;
  useEffect(() => {
    if (since === null) return;
    setElapsed(Date.now() - since);
    // Half a second. Fine enough that neither threshold lands visibly late,
    // coarse enough not to be a render loop on a screen that is waiting.
    const timer = setInterval(() => setElapsed(Date.now() - since), 500);
    return () => clearInterval(timer);
  }, [since]);

  const step = elapsed >= SAY_AFTER_MS ? working?.step : null;
  const canStop = working !== null && elapsed >= STOP_AFTER_MS;

  // **Falls back to the dots, not to a filler sentence.** A turn with no step is
  // a turn that is thinking rather than looking something up, and inventing a
  // line for it would be offload narrating itself.
  if (!step && !canStop) return <Writing />;

  return (
    // A row, so Stop sits on the line it belongs to rather than under it: it is
    // the way out of the thing on screen, not a second thing that appeared.
    <View
      className="flex-row flex-wrap items-center gap-space-4"
      style={{ alignSelf: "flex-start" }}
    >
      {step ? (
        <Text
          className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
          style={{ fontSize: 13.5 }}
          // The line replaces itself rather than stacking, and a screen reader
          // should hear the change without being interrupted mid-sentence.
          accessibilityLiveRegion="polite"
        >
          {step}
        </Text>
      ) : (
        <Writing />
      )}

      {canStop ? (
        <Pressable
          onPress={stop}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Stop"
          className="min-h-tap-min justify-center"
        >
          <Text className="font-core font-medium text-text-accent" style={{ fontSize: 13.5 }}>
            Stop
          </Text>
        </Pressable>
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
          // `bg-surface-inverse`, not `bg-ink-950`. They resolve to the same
          // colour today, and that is luck rather than design: a filled primary
          // written as a ramp value pairs with `text-inverse` only for as long
          // as the two happen to flip together. The alias is the pair.
          className={`min-h-tap-min items-center justify-center rounded-pill px-space-6 ${
            isAndroid ? "bg-blue-600" : "bg-surface-inverse"
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
