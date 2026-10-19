// 044. Up to two links a PDF carried, offered beside it on the phones. Each is
// a label-only secondary pill with a leaves-offload glyph. offload opens
// nothing: the tap is the person's own, in the system browser (never a webview,
// never a custom tab, so no warmup or long-press preview path).
//
// The pill shows no destination, so a tap shows where it leads first: it takes
// the pills' place with "From the PDF. Open <host>?" and the control that opens
// it. The host is computed here from the url with hostForAction, never a string
// the server sent, so a look-alike shows its true host. The scheme is rechecked
// with isOpenable before anything opens, because the row could be stale.

import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Glyph } from "../Glyph";
import { hostForAction } from "@offload/widgets";
import { isOpenable } from "../../lib/links";
import { useColors } from "../../lib/colors";

export interface PdfAction {
  label: string;
  url: string;
}

export function PdfActions({ actions }: { actions?: PdfAction[] | null }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const COLOR = useColors();
  const usable = (actions ?? []).filter((a) => isOpenable(a.url)).slice(0, 2);
  if (usable.length === 0) return null;

  const open = usable.find((a) => a.url === confirming);
  if (open) {
    const host = hostForAction(open.url);
    return (
      <View className="mt-space-1 flex-row flex-wrap items-center gap-space-2">
        <Text className="font-core text-text-secondary" style={{ fontSize: 13 }}>
          From the PDF. Open {host}?
        </Text>
        <Pressable
          onPress={() => {
            setConfirming(null);
            if (isOpenable(open.url)) void Linking.openURL(open.url);
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Open ${host}`}
          className="flex-row items-center rounded-pill border border-border-strong bg-surface-fill px-space-3 py-space-2"
        >
          <Text className="font-core text-text-accent" style={{ fontSize: 13 }}>
            Open
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setConfirming(null)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          className="py-space-2"
        >
          <Text className="font-core text-text-secondary" style={{ fontSize: 13 }}>
            Cancel
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="mt-space-1 flex-row flex-wrap items-center gap-space-2">
      {usable.map((action) => (
        <Pressable
          key={action.url}
          onPress={() => setConfirming(action.url)}
          hitSlop={10}
          accessibilityRole="button"
          // The host in the accessible name, so a screen reader hears where the
          // tap leads as a sighted reader sees it in the confirm.
          accessibilityLabel={`${action.label}, opens ${hostForAction(action.url)}`}
          className="flex-row items-center gap-space-1 self-start rounded-pill border border-border-strong bg-surface-fill px-space-3 py-space-2"
        >
          <Text className="font-core text-text-primary" style={{ fontSize: 13 }}>
            {action.label}
          </Text>
          <Glyph name="arrow-up-right" size={13} color={COLOR.ink} />
        </Pressable>
      ))}
    </View>
  );
}
