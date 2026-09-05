// The shell.
//
// Three tabs, and the bar is not the framework's: `M3App.jsx` draws one raised
// plate holding the folded conversation header, the composer and the tabs, and
// they move together when the keyboard comes up. So `Tabs` supplies the routing
// and `Plate` supplies the chrome.
//
// The first tab is time-aware and its label changes on its own, which is easier
// to get right from the start than to retrofit.

import { Tabs, usePathname, useRouter } from "expo-router";
import { View } from "react-native";
import { Plate, type Tab } from "../../components/shell/Plate";
import { Conversation } from "../../components/shell/Conversation";
import {
  ConversationProvider,
  useConversation,
} from "../../components/shell/conversation-context";
import { ToastHost, useToast } from "../../components/shell/Toast";
import { timeOfDay } from "../../lib/sun";
import { useEffect, useRef } from "react";

export default function TabsLayout() {
  return (
    // Above the tabs, because a conversation outlives the screen it was
    // started from: you dump from My threads, walk into a thread while offload
    // is still writing, and it is still yours.
    <ConversationProvider>
      <Shell />
    </ConversationProvider>
  );
}

function Shell() {
  const router = useRouter();
  const pathname = usePathname();
  const tod = timeOfDay();
  const conversation = useConversation();
  const toast = useToast();

  // The turn's Undo, held here rather than in the sheet, so folding the
  // conversation cannot take the window away with it.
  const shownUndo = useRef<string | null>(null);
  useEffect(() => {
    const undoable = conversation.undoable;
    if (!undoable || shownUndo.current === undoable.turnId) return;
    // Guarded on the turn rather than a narrowed dependency list, so the effect
    // can depend on the whole value and still offer each window once.
    shownUndo.current = undoable.turnId;
    toast.show(undoable.message, { label: "Undo", onPress: () => void conversation.undo() });
  }, [conversation, toast]);

  const tabs: Tab[] = [
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
      active: pathname.startsWith("/threads"),
      onPress: () => router.replace("/threads"),
    },
    {
      key: "memories",
      label: "Memories",
      icon: "cloudy",
      active: pathname === "/memories",
      onPress: () => router.replace("/memories"),
    },
  ];

  return (
    <View className="flex-1">
      <Tabs
        screenOptions={{ headerShown: false }}
        // The framework's bar is replaced entirely: the composer and the tabs
        // are one surface, and the keyboard moves both.
        tabBar={() => null}
      >
        <Tabs.Screen name="today" />
        <Tabs.Screen name="threads" />
        <Tabs.Screen name="memories" />
      </Tabs>

      <Plate tabs={tabs} />
      <Conversation />
      <ToastHost state={toast} />
    </View>
  );
}
