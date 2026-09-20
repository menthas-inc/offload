// 021. Record, from a long press on the app icon.
//
// One static item on both platforms, a home screen quick action on iOS and
// an app shortcut on Android, and choosing it opens offload with the plate's
// composer already in the recording row, on whatever screen is up, so one
// press and a sentence is the whole of it. The order on arrival is the
// feature spec's: the gate, first run and the name screen come first and
// the shortcut is forgotten, since there is nothing to keep; a send in
// flight is waited for, as a share is; an existing draft keeps its words
// and chips and gains the recording; a pinned + is released; already
// recording, nothing more happens. If the microphone has never been asked
// for, the recording starts on yes.
//
// Android's shortcut intent can be fired by any app. Accepted: nothing sends
// without a tap, and the screen shows the recording.

import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as QuickActions from "expo-quick-actions";
import { useQuickActionCallback } from "expo-quick-actions/hooks";
import { usePathname } from "expo-router";
import { useConversation } from "./conversation-context";

/** Where the plate's composer is, and so where a recording can start. */
const HOME = ["/today", "/threads", "/notes"];

export function RecordArrival() {
  const { startRecording, dismissPin, writing, recording, note } = useConversation();
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  // The item itself. Set once; the plugin's icons are keyed on `record`.
  useEffect(() => {
    void QuickActions.isSupported().then((supported) => {
      if (!supported) return;
      void QuickActions.setItems([
        {
          id: "record",
          title: "Record",
          icon: Platform.OS === "ios" ? "symbol:mic" : "record",
        },
      ]);
    });
  }, []);

  useQuickActionCallback((action) => {
    if (action.id === "record") setPending(true);
  });

  // Runs on arrival and again as the things it waits on change: the route,
  // for the gate; `writing`, for a send in flight.
  useEffect(() => {
    if (!pending) return;
    const home = HOME.includes(pathname) || pathname.startsWith("/threads/");
    if (!home) {
      // "/" is the app deciding where to open; anywhere else off the home
      // routes is the gate, first run or the name screen, which come first,
      // and the shortcut is forgotten.
      if (pathname !== "/") setPending(false);
      return;
    }
    if (writing) return;
    setPending(false);
    if (recording || note) return;
    // No sheet raised: the plate's composer takes the row on whatever
    // screen is up. A pinned + is released first, as a share does.
    dismissPin();
    void startRecording();
  }, [pending, pathname, writing, recording, note, dismissPin, startRecording]);

  return null;
}
