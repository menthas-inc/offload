// The plate, the conversation and the turn's Undo, rendered once.
//
// **Once, above the router, rather than per screen.** The plate is one surface
// in the kit and the conversation outlives every screen, so mounting either of
// them inside a route means two of them the moment a route pushes another: a
// thread screen sits on top of the tabs and both stay mounted.
//
// What it shows is decided from the route rather than passed down:
//
//   the gate      nothing at all
//   a tab         the composer and the tabs
//   a thread      the composer, "Add to this", and the tabs
//
// The kit hides both inside a thread; dumping from where you are is the
// product's core move and a thread is the likeliest place to want it (009).
// The tabs joined it on 30 September: every screen draws Today, My threads and
// Notes, and they leave only under the conversation or the keyboard.
//
// Stacked, bottom to top: the plate, the conversation's scrim, the sheet, then
// the composer's photo sheet and the toast.

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "expo-router";
import Animated, { useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { plateAway, plateBack } from "../../lib/motion";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { Plate, type Tab } from "./Plate";
import { Conversation, ConversationPhotoSheet, ConversationPhotoViewer, ConversationScrim } from "./Conversation";
import { useConversation } from "./conversation-context";
import { ToastHost, useToast } from "./Toast";
import { timeOfDay } from "../../lib/sun";

/** Where the composer belongs, and where it does not. */
const TABS = ["/today", "/threads", "/notes", "/"];

export function Shell() {
  const router = useRouter();
  const pathname = usePathname();
  const tod = timeOfDay();
  const conversation = useConversation();
  const toast = useToast();

  // One translate, on the whole bottom column. The sheet and the plate are
  // stacked in it, so moving them separately let the keyboard put them at
  // different heights, and moving the column keeps them a single surface.
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  //
  // **While a screen sheet is open the plate slides off the bottom** on the
  // sheet's beat, and back as it goes, rather than being unmounted: taken off
  // in one frame the page changed before the sheet moved, and a plate
  // remounted under a closing sheet was handed its field's focus.
  //
  // **It rides the keyboard only while its own field has focus.** Any other
  // keyboard is a sheet's, and a plate lifted by it rose over the sheet. The
  // focus comes from the field itself, which is on time; a count set by the
  // sheet reached the UI thread only after the sheet had rendered, a few
  // hundred milliseconds late in a development build.
  const sheetOpen = conversation.sheetOpen;
  const sheetCount = conversation.sheetCount;
  const composerFocused = conversation.composerFocused;
  const away = useSharedValue(0);
  const plateHeight = useSharedValue(0);
  useAnimatedReaction(
    () => sheetCount.value > 0,
    (open, was) => {
      if (open === was) return;
      away.value = withTiming(open ? 1 : 0, open ? plateAway : plateBack);
    },
  );
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: away.value * plateHeight.value + composerFocused.value * keyboardHeight.value }],
  }));

  // The turn's Undo lives here rather than in the sheet, so putting the
  // conversation away cannot take the window away with it. An eight second window
  // that vanishes because somebody tidied the screen was not eight seconds.
  const shownUndo = useRef<string | null>(null);
  useEffect(() => {
    const undoable = conversation.undoable;
    if (!undoable || shownUndo.current === undoable.turnId) return;
    shownUndo.current = undoable.turnId;
    toast.show(undoable.message, { label: "Undo", onPress: () => void conversation.undo() });
  }, [conversation, toast]);

  // A word from the conversation that is not an Undo: a `+`'s write that did
  // not land, a tick inside an answer the server refused. Here for the same
  // reason the Undo is: the composer belongs to the shell and the screen that
  // drew the row may already be gone.
  const shownNotice = useRef<number | null>(null);
  useEffect(() => {
    const notice = conversation.notice;
    if (!notice || shownNotice.current === notice.at) return;
    shownNotice.current = notice.at;
    toast.show(notice.message, notice.action);
  }, [conversation, toast]);

  const onTab = TABS.includes(pathname);
  const inThread = pathname.startsWith("/threads/");
  if (!onTab && !inThread) return null;

  // From a tab, the tabs swap; from a thread, back down to the tabs first,
  // so a tab never lands on top of the thread it left.
  const go = (href: "/today" | "/threads" | "/notes"): void => {
    if (inThread) router.dismissTo(href);
    else router.replace(href);
  };

  // **A screen's own sheet is modal, and the plate is not part of it.** The
  // plate is mounted above the router so a pushed screen cannot produce a
  // second one, which also means it paints over anything a screen anchors to
  // its own bottom: the row actions opened under it and only the first action
  // showed. The toast stays, because an undo window is not chrome.

  const tabs: Tab[] = [
        {
          key: "today",
          label: tod.label,
          icon: tod.icon === "moon" ? "moon" : "sun",
          active: pathname === "/today" || pathname === "/",
          onPress: () => go("/today"),
        },
        {
          key: "threads",
          label: "My threads",
          icon: "lasso",
          // A thread is somewhere inside My threads.
          active: pathname === "/threads" || inThread,
          onPress: () => go("/threads"),
        },
        {
          // `cloudy` was chosen for the word Memories and is kept for Notes:
          // the screen is still what offload has collected about you, and the
          // glyph was never about the noun. Looked at rather than inherited,
          // per 014's task list.
          key: "notes",
          label: "Notes",
          icon: "cloudy",
          active: pathname === "/notes",
          onPress: () => go("/notes"),
        },
      ];

  return (
    <>
      {/* Always mounted, and slid off the bottom while a screen sheet is
          open (see `away` above). Unmounted, it used to leave in one frame
          and come back holding a closing sheet's focus. */}
      <Animated.View
        className="absolute inset-x-0 bottom-0"
        style={lift}
        onLayout={(event) => {
          plateHeight.value = event.nativeEvent.layout.height;
        }}
        pointerEvents={sheetOpen ? "none" : "auto"}
        importantForAccessibility={sheetOpen ? "no-hide-descendants" : "auto"}
        accessibilityElementsHidden={sheetOpen}
      >
        <Plate tabs={tabs} placeholder={inThread ? "Add to this" : undefined} />
      </Animated.View>
      <ConversationScrim />
      <Conversation />
      <ConversationPhotoViewer />
      {/* The composer's photo sheet is a screen sheet, so it takes the plate
          off the screen like any other; it lives outside the plate's block
          for exactly that reason, since a sheet that unmounts itself on open
          reopens the plate, which unmounts the sheet, forever. */}
      <ConversationPhotoSheet />
      <ToastHost state={toast} />
    </>
  );
}
