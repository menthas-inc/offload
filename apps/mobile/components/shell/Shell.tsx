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
import { Plate, type Tab } from "./Plate";
import { Conversation } from "./Conversation";
import { useConversation } from "./conversation-context";
import { ToastHost, useToast } from "./Toast";
import { timeOfDay } from "../../lib/sun";

/** Where the composer belongs, and where it does not. */
const TABS = ["/today", "/threads", "/memories", "/"];

export function Shell() {
  const router = useRouter();
  const pathname = usePathname();
  const tod = timeOfDay();
  const conversation = useConversation();
  const toast = useToast();

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
          key: "memories",
          label: "Memories",
          icon: "cloudy",
          active: pathname === "/memories",
          onPress: () => router.replace("/memories"),
        },
      ]
    : [];

  return (
    <>
      <Conversation />
      <Plate tabs={tabs} placeholder={inThread ? "Add to this" : undefined} />
      <ToastHost state={toast} />
    </>
  );
}
