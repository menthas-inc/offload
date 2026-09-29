// The conversation, as a sheet.
//
// From `LiveConversation.jsx`, and since 30 September 2026 from
// `handoff/APPLY-2026-09-29-conversation-sheet.md`: two states, **raised**
// over the screen with its own composer, and **put away**. There is no fold.
// Put away, it keeps every turn and the draft, and the composer brings it
// back; a conversation put away for thirty minutes ends on the next dump.
//
// Built on Reanimated rather than a sheet library on purpose: the sheet, its
// scrim, the page receding behind it and the tab bar all read one position,
// and a library owns its own.
//
// The turns and the draft live in the provider above this, so putting it
// away cannot lose them, and the Undo toast is rendered above the sheet for
// the same reason: an eight second window that vanishes because somebody
// tidied the screen was not eight seconds.

import { forwardRef, Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type ScrollViewProps,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { KeyboardChatScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Glyph } from "../Glyph";
import { LabelMark } from "../labels/LabelMark";
import { AnswerResults } from "./AnswerResult";
import { Reply } from "./Reply";
import { isRich } from "@offload/markup";
import { atOpacity, useColors } from "../../lib/colors";
import { backPull, progress } from "../../lib/sheet";
import { openSpring } from "../../lib/motion";
import { useSheetBack } from "../../lib/sheet-back";
import { Grabber, useSheetDrag, type SheetScroll } from "./DragSheet";
import { Composer } from "./Composer";
import { PrismField } from "../PrismField";
import { answerPending } from "../../lib/calendars";
import { answerShare } from "../../lib/people";
import { openLink } from "../../lib/links";
import { SHARE_LINE } from "../people/ShareSheet";
import { QuickReplies } from "./QuickReplies";
import { useRouter } from "expo-router";
import { useConversation, type Pin, type Turn } from "./conversation-context";
import { SentPhoto } from "./SentPhoto";
import { VoiceNotePlayer } from "./SentVoice";
import { RowActionSheet } from "./RowActionSheet";
import { PhotoViewer, type ViewerPhoto } from "./PhotoViewer";

/** 020. The viewer for a sent message's photos, mounted by the shell above
 *  the sheet. No row yet, so no tools: the Files grid is where a photo's row
 *  is. */
/** 020, per the 21 September design: the composer's photo sheet, drawn here
 *  above the plate. Library first, then the camera, and no Cancel row. */
export function ConversationPhotoSheet() {
  const { photoSheet, closePhotoSheet, pickPhotos } = useConversation();
  return (
    <RowActionSheet
      open={photoSheet}
      actions={[
        { label: "Choose from library", icon: "image", run: () => void pickPhotos("library") },
        { label: "Take a photo", icon: "camera", run: () => void pickPhotos("camera") },
      ]}
      onClose={closePhotoSheet}
    />
  );
}

export function ConversationPhotoViewer() {
  const { turns, photoOpen, openPhoto, closePhoto } = useConversation();
  if (!photoOpen) return null;
  const turn = turns.find((one) => one.id === photoOpen.turnId);
  const set: ViewerPhoto[] = (turn?.photos ?? []).map((photo) => ({
    blobId: photo.blobId,
    ready: photo.ready,
    width: photo.width,
    height: photo.height,
    title: photo.name ?? "Photo",
  }));
  if (set.length === 0) return null;
  return (
    <PhotoViewer
      photos={set}
      index={Math.min(photoOpen.index, set.length - 1)}
      onIndex={(index) => openPhoto(photoOpen.turnId, index)}
      onClose={closePhoto}
    />
  );
}

const isAndroid = Platform.OS === "android";

/** The dim behind a raised conversation, over the page and the plate and
 *  under the sheet. **Not timed on its own**: it reads the sheet's position,
 *  so while a finger drags the sheet it fades with it. Deeper on Android,
 *  where the page does not recede, to make up for the missing depth. A tap
 *  on the strip it leaves above the sheet puts the conversation away. */
export function ConversationScrim() {
  const COLOR = useColors();
  const { sheetY, sheetTravel, raised, lower } = useConversation();
  const dim = useAnimatedStyle(() => ({ opacity: progress(sheetY.value, sheetTravel.value) }));
  return (
    <Animated.View
      style={[
        { position: "absolute", inset: 0, backgroundColor: atOpacity(COLOR.scrim, isAndroid ? 0.55 : 0.45) },
        dim,
      ]}
      pointerEvents={raised ? "auto" : "none"}
    >
      <Pressable className="flex-1" onPress={lower} accessibilityLabel="Close" />
    </Animated.View>
  );
}

/** The conversation, as a sheet 54 points from the top (30 September 2026).
 *
 *  From `handoff/APPLY-2026-09-29-conversation-sheet.md`. No header: the
 *  grabber is the only thing at the top, and the sheet closes by dragging or
 *  flicking it, by a tap on the scrim above it, or with back on Android.
 *  Closing keeps the conversation; the composer brings it back.
 *
 *  **Always mounted and always the same height**, so the distance it travels
 *  never changes between the start of a close and its end, and nothing in the
 *  shell's layout moves when it opens. One position on the UI thread drives it
 *  and, through the provider, the scrim, the page behind and the tab bar.
 *
 *  **The keyboard moves the composer, not the sheet.** The composer rides it
 *  as a transform and the transcript lifts its content by the same amount, so
 *  a keyboard opening mid-rise costs no layout. */
export function Conversation() {
  const conversation = useConversation();
  const { pin, raised, sheetY, sheetTravel, sheetGoal, settle } = conversation;
  const insets = useSafeAreaInsets();
  const { height: screen } = useWindowDimensions();
  const top = insets.top + 10;
  const travel = screen - top;

  useLayoutEffect(() => {
    sheetTravel.value = travel;
  }, [sheetTravel, travel]);

  // A pin keeps drawing as it leaves: without this the sheet showed the
  // conversation's turns for the length of its own exit.
  const [heldPin, setHeldPin] = useState<Pin | null>(pin);
  useEffect(() => {
    if (pin) setHeldPin(pin);
  }, [pin]);
  const pinNow = useRef(pin);
  pinNow.current = pin;
  const letGo = useCallback(() => {
    if (!pinNow.current) setHeldPin(null);
  }, []);
  useAnimatedReaction(
    () => sheetY.value >= sheetTravel.value && sheetTravel.value > 0,
    (closed, was) => {
      if (closed && !was) runOnJS(letGo)();
    },
  );
  const shownPin = pin ?? heldPin;

  const held = useSharedValue(0);
  const leave = useCallback(() => {
    Keyboard.dismiss();
    sheetGoal.value = sheetTravel.value + 16;
  }, [sheetGoal, sheetTravel]);

  // The transcript's own gesture, so the sheet can take a drag from it at
  // its top and let it scroll everywhere else.
  const native = useMemo(() => Gesture.Native(), []);
  const listRef = useAnimatedRef<Animated.ScrollView>();
  const offset = useSharedValue(0);
  const scroll: SheetScroll = { offset, ref: listRef, native };

  const grab = useSheetDrag({ y: sheetY, travel: sheetTravel, held, onCloseStart: leave, onClosed: settle });
  const pull = useSheetDrag({ y: sheetY, travel: sheetTravel, held, onCloseStart: leave, onClosed: settle, scroll });

  useSheetBack(raised, {
    start: () => cancelAnimation(sheetY),
    progress: (swipe) => {
      sheetY.value = backPull(swipe, sheetTravel.value);
    },
    cancel: () => {
      sheetY.value = withSpring(0, openSpring);
    },
    invoke: conversation.lower,
  });

  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: sheetY.value }] }));

  return (
    <Animated.View
      style={[{ position: "absolute", top, left: 0, right: 0, bottom: 0 }, sheet]}
      // `surface-plate`, the plate's own token: the composer band inside is
      // the same field on the same ground as the plate's.
      className={`bg-surface-plate ${isAndroid ? "rounded-t-a-xl" : "rounded-t-lg"}`}
      pointerEvents={raised ? "auto" : "none"}
      importantForAccessibility={raised ? "auto" : "no-hide-descendants"}
      accessibilityElementsHidden={!raised}
      accessibilityViewIsModal={raised}
    >
      <Grabber held={held} pan={grab} />

      <GestureDetector gesture={pull}>
        <View style={{ flex: 1 }}>
          {shownPin ? <PinnedTarget pin={shownPin} /> : <Turns scroll={scroll} raised={raised} bottom={insets.bottom} />}
        </View>
      </GestureDetector>

      {/* The composer rides the keyboard; below it, the home indicator's
          inset, which the keyboard covers and the offset gives back. **One
          field at a time**: the plate's is covered by this sheet while it is
          up, and the plate's pulse stops, so there is never a second band
          mapping the texture at once. */}
      <KeyboardStickyView offset={{ opened: insets.bottom }} enabled={raised}>
        <View style={{ paddingBottom: insets.bottom }}>
          <View className="overflow-hidden">
            <PrismField variant="band" veil="graded" pulse={raised ? (conversation.filed?.at ?? 0) : 0} />
            <Composer
              inSheet
              placeholder={shownPin ? shownPin.placeholder : "Add to this"}
              maxLength={shownPin?.charLimit}
              showCounter={shownPin?.showCounter}
              submitLabel={shownPin ? "Add" : "Send"}
            />
          </View>
        </View>
      </KeyboardStickyView>
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
    // On the composer, as the turns are: the sheet's height is fixed and
    // what it holds sits at its foot.
    <View className="flex-1 flex-row items-end px-gutter-screen pb-space-4">
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

function Turns({ scroll, raised, bottom }: { scroll: SheetScroll; raised: boolean; bottom: number }) {
  const { turns, writing, finish, openPhoto, retry, recording } = useConversation();
  const { ref, offset, native } = scroll;

  // Opened at its end, and kept there as turns arrive.
  const atEnd = useRef(false);
  useEffect(() => {
    ref.current?.scrollToEnd({ animated: atEnd.current });
    atEnd.current = true;
  }, [turns.length, writing, ref]);

  const onScroll = useAnimatedScrollHandler((event) => {
    offset.value = event.contentOffset.y;
  });

  // The transcript's scroll view, carrying the gesture the sheet's drag
  // runs beside. Made once, so the list is not remounted on a render.
  const ScrollWithGesture = useMemo(
    () =>
      forwardRef<Animated.ScrollView, ScrollViewProps>(function ScrollWithGesture(props, forwarded) {
        return (
          <GestureDetector gesture={native}>
            <Animated.ScrollView ref={forwarded} {...props} />
          </GestureDetector>
        );
      }),
    [native],
  );

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
    // **Lifted by the keyboard, never resized by it.** The chat scroll view
    // moves its content up with the keyboard on the UI thread, so the last
    // turn stays above the composer as it rises, and freezes while the sheet
    // is away so the plate's keyboard does not move a transcript nobody sees.
    <KeyboardChatScrollView
      ref={ref}
      ScrollViewComponent={ScrollWithGesture as never}
      offset={bottom}
      freeze={!raised}
      onScroll={onScroll}
      scrollEventThrottle={16}
      // The sheet takes a drag down from the top; a bounce there would move
      // the two at once.
      bounces={false}
      overScrollMode="never"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1 }}
      // A short conversation sits on the composer, as a chat does.
      contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}
      contentContainerClassName="gap-space-4 px-gutter-screen pb-space-4"
    >
      {turns.map((turn) =>
        turn.from === "you" ? (
          <Fragment key={turn.id}>
            <Yours
              turn={turn}
              // **Only when nothing answered it.** The footer belongs to the turn,
              // and the turn ends at the reply when there is one: drawn on the
              // sent bubble regardless, the sources for an answer sat above the
              // answer they were sources for.
              footer={!replied.has(turn.id) && !turn.question}
              onFinish={() => void finish(turn.id)}
              onOpenPhoto={(index) => openPhoto(turn.id, index)}
              onRetry={() => retry(turn.id)}
              recording={recording}
            />
            {/* 018. A turn that filed silently and asked back has no reply
                bubble to hold the question, so the question gets one of its
                own, in place: offload's sentence and the chips, nothing else.
                After the footer, as on web, in the turn's order: what
                happened, then what is still open. The sent bubble hands its
                footer down so the footer can sit between them. */}
            {!replied.has(turn.id) && turn.question ? (
              <>
                <TurnFooter turn={turn} />
                <Bubble>
                  <Question turn={turn} first />
                </Bubble>
              </>
            ) : null}
            {/* 019. A tapped calendar answer that turned into a proposal: the
                control sits on the person's own turn, in a bubble of its own,
                because the turn that asked has no reply to hold it. As on
                web. */}
            {!replied.has(turn.id) && turn.waiting ? (
              <Bubble>
                <Waiting turn={turn} />
              </Bubble>
            ) : null}
          </Fragment>
        ) : (
          <Theirs key={turn.id} turn={turn} sent={answered.get(turn.id) ?? null} />
        ),
      )}
      {writing ? <Working /> : null}
    </KeyboardChatScrollView>
  );
}

function Yours({
  turn,
  footer,
  onFinish,
  onOpenPhoto,
  onRetry,
  recording,
}: {
  turn: Turn;
  footer: boolean;
  onOpenPhoto: (index: number) => void;
  onFinish: () => void;
  /** The send did not land. Puts the words back in the field. */
  onRetry: () => void;
  /** 021. The composer is recording, so a sent note's row is inert. */
  recording: boolean;
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
        {turn.text ? (
          <Text
            className="font-core text-ink-950"
            style={{ fontSize: 15, lineHeight: 22 }}
          >
            {turn.text}
          </Text>
        ) : null}
        {/* 021. The voice note it carried, between the words and the photos. */}
        {turn.voice ? <VoiceNotePlayer voice={turn.voice} inert={recording} /> : null}
        {/* 020. The photos the message carried, shown rather than named. */}
        {(turn.photos ?? []).map((photo, at) => (
          <SentPhoto key={photo.blobId} photo={photo} onOpen={() => onOpenPhoto(at)} />
        ))}
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
      {/* A send that never reached the server. The failed treatment above,
          with its own words: nothing is saved, and the way forward is the
          words back in the field. */}
      {turn.state === "failed" && turn.unsent ? (
        <View className="mt-space-2 flex-row items-center gap-space-3">
          <Text className="font-core text-text-danger" style={{ fontSize: 13 }}>
            That didn't go through.
          </Text>
          <Pressable onPress={onRetry} hitSlop={8}>
            <Text
              className="font-core font-medium text-text-accent"
              style={{ fontSize: 13 }}
            >
              Try again
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* 021. A voice note the turn could not write down, or could not answer
          once it had. Try again runs the same turn on the same note, since
          the audio is on the server and cannot go back in the row. */}
      {turn.state === "failed" && !turn.unsent && turn.voice ? (
        <View className="mt-space-2 flex-row items-center gap-space-3">
          {/* The line wraps and the control keeps its place beside it; a
              line that cannot shrink pushed Try again off the screen. */}
          <Text className="flex-1 font-core text-text-danger" style={{ fontSize: 13 }}>
            {turn.voice.transcribed
              ? "offload could not answer that one. Your dump is saved."
              : "Couldn't write that one down."}
          </Text>
          <Pressable onPress={onFinish} hitSlop={8}>
            <Text
              className="font-core font-medium text-text-accent"
              style={{ fontSize: 13 }}
            >
              Try again
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* A typed dump whose send landed and whose answer did not. The same
          words as the voice line above once it was written down, with the
          other Try again: the words can go back in the field, so they do. */}
      {turn.state === "failed" && !turn.unsent && !turn.voice ? (
        <View className="mt-space-2 flex-row items-center gap-space-3">
          <Text className="flex-1 font-core text-text-danger" style={{ fontSize: 13 }}>
            offload could not answer that one. Your dump is saved.
          </Text>
          <Pressable onPress={onRetry} hitSlop={8}>
            <Text
              className="font-core font-medium text-text-accent"
              style={{ fontSize: 13 }}
            >
              Try again
            </Text>
          </Pressable>
        </View>
      ) : null}

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
/** One height for everything in the footer.
 *
 *  It held three: 24 for the Done mark, 26 for a thread, 26 for a source. Side
 *  by side on web that read as a mistake, which is what it was, and the phones
 *  had the same shape one pixel apart. 30, because that is the governed `Chip`
 *  the thread pills come from and the height the filter chips already use.
 *
 *  Named rather than repeated, so the next mark added to this row cannot be a
 *  fourth height. */
const CHIP_H = 30;

function TurnFooter({ turn }: { turn: Turn }) {
  const COLOR = useColors();
  const router = useRouter();
  const { lower } = useConversation();

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
  // 025. What the turn applied, after the thread pill at the footer's own
  // height, three and then a count as the sources are.
  const labels = turn.labels ?? [];
  const marks = labels.slice(0, 3);
  const unmarked = labels.length - marks.length;

  // An empty footer is no footer, never a 26px gap.
  if (!state && refs.length === 0 && sources.length === 0 && labels.length === 0) return null;

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
          className="flex-row items-center gap-space-2 rounded-pill bg-moss-600 px-space-4"
          style={{ height: CHIP_H }}
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
        // Tappable, and it puts the conversation away on the way out. A reply
        // naming where it filed something and not taking you there is a
        // sentence about a place rather than a way to it. The conversation is
        // kept: the composer brings it back.
        <Pressable
          key={thread.id}
          onPress={() => {
            lower();
            router.push({ pathname: "/threads/[id]", params: { id: thread.id } });
          }}
          className="flex-row items-center gap-space-2 rounded-pill bg-surface-accent-soft px-space-5"
          style={{ height: CHIP_H }}
        >
          <Glyph name="lasso" size={12} color={COLOR.accent} />
          <Text className="font-core text-text-accent" style={{ fontSize: 12.5 }}>
            {thread.name}
          </Text>
        </Pressable>
      ))}

      {marks.map((label) => (
        <LabelMark key={label.id} color={label.colour} size={30}>
          {label.name}
        </LabelMark>
      ))}
      {unmarked > 0 ? (
        <Text className="font-core text-text-tertiary" style={{ fontSize: 12.5 }}>
          and {unmarked} more
        </Text>
      ) : null}

      {/* **Outline, never moss.** Moss means "offload did this, you didn't"
          everywhere in this system, and a citation is the opposite: evidence of
          where a fact came from rather than something offload worked out.
          It is also the only thing in a conversation that leaves the app, and
          what makes that allowable is the source of the string: a domain from
          the record of what was read, not a word the page chose. */}
      {shown.map((source) => (
        <Pressable
          key={source.url}
          onPress={() => void openLink(source.url)}
          accessibilityRole="link"
          accessibilityLabel={`Open ${source.domain}`}
          className="flex-row items-center gap-space-2 rounded-pill border border-border-strong px-space-4"
          style={{ height: CHIP_H, maxWidth: 220 }}
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
  const { lower, tickFound } = useConversation();
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

      {/* 018. The question, under the sentence and after any proposal, which
          keeps its own life. On the message that was sent, because that is the
          turn that asked. */}
      {sent?.question ? <Question turn={sent} /> : null}

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
            lower();
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
/** 018. The reply bubble's shape with nothing of the reply in it, for a
 *  question on a turn that said nothing. The same measures as `Theirs`. */
function Bubble({ children }: { children: ReactNode }) {
  return (
    <View
      className={`self-start px-space-5 py-space-4 ${isAndroid ? "bg-a-c" : "bg-ink-50"}`}
      style={{
        maxWidth: "92%",
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderBottomRightRadius: 16,
        borderBottomLeftRadius: 4,
      }}
    >
      {children}
    </View>
  );
}

/** 018. A question offload asked back: its sentence, and the chips that
 *  answer it. The sentence is plain text, never markup: it was composed from
 *  a template and a title, and a title has no business becoming a link. */
function Question({ turn, first = false }: { turn: Turn; first?: boolean }) {
  const { answerOpen } = useConversation();
  const [busy, setBusy] = useState(false);
  const [failedToSend, setFailedToSend] = useState(false);
  const question = turn.question;
  if (!question) return null;

  const pick = async (index: number) => {
    if (busy) return;
    setBusy(true);
    setFailedToSend(false);
    try {
      const outcome = await answerOpen(turn.id, index);
      if (outcome === "failed") setFailedToSend(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className={`gap-space-3 ${first ? "" : "mt-space-4"}`}>
      <Text
        className={`font-quiet ${isAndroid ? "text-a-on" : "text-text-primary"}`}
        style={{ fontSize: 16, lineHeight: 24 }}
      >
        {question.text}
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
      <QuickReplies
        options={question.options}
        label={question.text}
        onPick={(index) => void pick(index)}
        disabled={busy}
      />
    </View>
  );
}

function Waiting({ turn }: { turn: Turn }) {
  const { resolveWaiting } = useConversation();
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const [failedToSend, setFailedToSend] = useState(false);

  if (!turn.waiting || gone) return null;

  // 022. A share's tap goes to its own route; the calendar's to 019's.
  const share = turn.waiting.kind === "share";
  const answer = async (choice: "confirm" | "decline") => {
    if (busy) return;
    setBusy(true);
    const ok = share ? await answerShare(turn.waiting!.id, choice) : await answerPending(turn.waiting!.id, choice);
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
      {/* The line a person reads before sharing, here as on the sheet: the
          policy promises it at the moment of sharing. */}
      {share ? (
        <Text className="font-core text-text-tertiary" style={{ fontSize: 12.5, lineHeight: 18 }}>
          {SHARE_LINE}
        </Text>
      ) : null}

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
            {share ? "Share" : "Add it"}
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
