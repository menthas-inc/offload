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
//   a thread      the composer, no tabs, "Add to this"
//
// That last row is the divergence 009 recorded. The kit hides both inside a
// thread; dumping from where you are is the product's core move and a thread is
// the likeliest place to want it.

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "expo-router";
import Animated, { FadeIn, FadeOut, useAnimatedStyle } from "react-native-reanimated";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { Plate, type Tab } from "./Plate";
import { Conversation, ConversationPhotoViewer, ConversationScrim } from "./Conversation";
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
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: keyboardHeight.value }] }));

  // The turn's Undo lives here rather than in the sheet, so folding the
  // conversation cannot take the window away with it. An eight second window
  // that vanishes because somebody tidied the screen was not eight seconds.
  const shownUndo = useRef<string | null>(null);
  useEffect(() => {
    const undoable = conversation.undoable;
    if (!undoable || shownUndo.current === undoable.turnId) return;
    shownUndo.current = undoable.turnId;
    toast.show(undoable.message, { label: "Undo", onPress: () => void conversation.undo() });
  }, [conversation, toast]);

  const onTab = TABS.includes(pathname);
  const inThread = pathname.startsWith("/threads/");
  if (!onTab && !inThread) return null;

  // **A screen's own sheet is modal, and the plate is not part of it.** The
  // plate is mounted above the router so a pushed screen cannot produce a
  // second one, which also means it paints over anything a screen anchors to
  // its own bottom: the row actions opened under it and only the first action
  // showed. The toast stays, because an undo window is not chrome.

  const tabs: Tab[] = onTab
    ? [
        {
          key: "today",
          label: tod.label,
          icon: tod.icon === "moon" ? "moon" : "sun",
          active: pathname === "/today" || pathname === "/",
          onPress: () => router.replace("/today"),
        },
        {
          key: "threads",
          label: "My threads",
          icon: "lasso",
          active: pathname === "/threads",
          onPress: () => router.replace("/threads"),
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
          onPress: () => router.replace("/notes"),
        },
      ]
    : [];

  return (
    <>
      <ConversationScrim />
      {/* The sheet sits on top of the plate rather than beside it. Both were
          anchored to the bottom of the screen and the plate paints later, so
          the tabs covered the sheet's own composer. */}
      {conversation.sheetOpen ? null : (
        <Animated.View
          style={lift}
          className="absolute inset-x-0 bottom-0"
          // On the same beat as the scrim that replaces it. Taken off the
          // screen in one frame, the bottom 120px of the page changed before
          // the sheet had started moving, which is half of what read as a
          // flash on a device.
          entering={FadeIn.duration(140)}
          exiting={FadeOut.duration(140)}
        >
          <Conversation />
          <ConversationPhotoViewer />
          <Plate tabs={tabs} placeholder={inThread ? "Add to this" : undefined} />
        </Animated.View>
      )}
      <ToastHost state={toast} />
    </>
  );
}
