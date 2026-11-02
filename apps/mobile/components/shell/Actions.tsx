// 044, 050. Up to two things a dump carried that one tap can act on, offered
// on its row on the phones: a link to open, a number to call, an address to
// write to, plus Directions when the row has a place offload resolved (030).
// Secondary pills, never the moss or attention tone. offload opens nothing:
// the tap is the person's own, through the platform (never a webview, never a
// custom tab, so no warmup or long-press preview path).
//
// The kind decides what the pill shows, never the scheme alone:
// - Open shows the label only, so a tap shows where it leads first: it takes
//   the pills' place with "From the picture. Open <host>?" and the control
//   that opens it. The host is computed here with hostForAction, never a
//   string the server sent, so a look-alike shows its true host.
// - Call and Email show the label and the destination, formatted here, and
//   open on the tap: the destination is on screen before anything happens,
//   and the dialer or the mail draft sends nothing by itself. A device with
//   nothing to open it rejects; that is swallowed and the pill stays readable.
// - Directions is 030's own link to the place.
// Every entry is re-checked with isActionUrl before it draws and again before
// it opens, because the row could be stale. `isOpenable` stays http(s) only
// for every other link in the app (security review L21).

import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Glyph } from "../Glyph";
import { actionKind, directionsUrl, hostForAction, isActionUrl, shownDestination } from "@offload/widgets";
import { useColors } from "../../lib/colors";

export interface Action {
  label: string;
  url: string;
  kind?: "open" | "call" | "email";
  source?: "pdf" | "picture" | "voice" | "typed" | "mail";
  sender?: string | null;
}

/** Where an Open came from, in the confirm's first words. */
function fromWhere(action: Action): string {
  switch (action.source) {
    case "picture":
      return "From the picture.";
    case "voice":
      return "From your voice note.";
    case "typed":
      return "From what you typed.";
    case "mail":
      return action.sender ? `From a mail from ${action.sender}.` : "From the mail.";
    default:
      return "From the PDF.";
  }
}

const PILL = "flex-row items-center gap-space-1 self-start rounded-pill border border-border-strong bg-surface-fill px-space-3 py-space-2";

export function Actions({
  actions,
  place,
  canRemove = false,
  onRemove,
  removeHere = false,
}: {
  actions?: Action[] | null | undefined;
  /** 050. The row's place, for Directions when it has coordinates. */
  place?: { lat: number | null; lng: number | null } | null | undefined;
  /** 044. The row is the viewer's own, so they may correct a wrong action.
   *  Author only (OFF-3), the same gate the row's delete uses. */
  canRemove?: boolean | undefined;
  onRemove?: ((url: string) => void) | undefined;
  /** 050. Where the row is edited: Remove beside a Call or an Email, which
   *  have no confirm to hold it. */
  removeHere?: boolean | undefined;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const COLOR = useColors();
  // A kind the server sent must be the url's own: the pill follows the kind,
  // and a mismatch is a stale or hand-made entry, dropped rather than drawn.
  const usable = (actions ?? [])
    .filter((a) => isActionUrl(a.url) && (a.kind === undefined || a.kind === actionKind(a.url)))
    .slice(0, 2);
  const there = place && place.lat !== null && place.lng !== null ? { lat: place.lat, lng: place.lng } : null;
  if (usable.length === 0 && !there) return null;
  const mayRemove = canRemove && onRemove !== undefined;

  const open = usable.find((a) => a.url === confirming);
  if (open) {
    const host = hostForAction(open.url);
    return (
      <View className="mt-space-1 flex-row flex-wrap items-center gap-space-2">
        <Text className="font-core text-label text-text-secondary">
          {fromWhere(open)} Open {host}?
        </Text>
        <Pressable
          onPress={() => {
            setConfirming(null);
            if (isActionUrl(open.url)) void Linking.openURL(open.url).catch(() => {});
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Open ${host}`}
          className="flex-row items-center rounded-pill border border-border-strong bg-surface-fill px-space-3 py-space-2"
        >
          <Text className="font-core text-label text-text-accent">Open</Text>
        </Pressable>
        {mayRemove ? (
          // 044. Correcting a wrong Open lives here, in the confirm, not a
          // separate sheet: quiet, author only, with the row's own Undo.
          <Pressable
            onPress={() => {
              setConfirming(null);
              onRemove!(open.url);
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Remove"
            className="py-space-2"
          >
            <Text className="font-core text-label text-text-tertiary">Remove</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => setConfirming(null)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          className="py-space-2"
        >
          <Text className="font-core text-label text-text-secondary">Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="mt-space-1 flex-row flex-wrap items-center gap-space-2">
      {usable.map((action) => {
        const kind = actionKind(action.url);
        if (kind === "open") {
          return (
            <Pressable
              key={action.url}
              onPress={() => setConfirming(action.url)}
              hitSlop={10}
              accessibilityRole="button"
              // The host in the accessible name, so a screen reader hears where
              // the tap leads as a sighted reader sees it in the confirm.
              accessibilityLabel={`${action.label}, opens ${hostForAction(action.url)}`}
              className={PILL}
            >
              <Text className="font-core text-label text-text-primary">{action.label}</Text>
              <Glyph name="arrow-up-right" size={13} color={COLOR.ink} />
            </Pressable>
          );
        }
        const shown = shownDestination(action.url);
        return (
          <View key={action.url} className="flex-row items-center gap-space-1">
            <Pressable
              onPress={() => {
                if (isActionUrl(action.url)) void Linking.openURL(action.url).catch(() => {});
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`${action.label}, ${shown}`}
              className={PILL}
            >
              <Glyph name={kind === "call" ? "phone" : "mail"} size={13} color={COLOR.accent} />
              <Text className="font-core text-label text-text-primary">{action.label}</Text>
              <Text className="font-core text-label text-text-secondary" style={{ fontVariant: ["tabular-nums"] }}>
                {shown}
              </Text>
            </Pressable>
            {removeHere && mayRemove ? (
              <Pressable
                onPress={() => onRemove!(action.url)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${action.label}`}
                className="py-space-2"
              >
                <Text className="font-core text-label text-text-tertiary">Remove</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
      {there ? (
        <Pressable
          onPress={() => void Linking.openURL(directionsUrl({ ...there, googlePlaceId: null })).catch(() => {})}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Directions"
          className={PILL}
        >
          <Glyph name="map-pin" size={13} color={COLOR.accent} />
          <Text className="font-core text-label text-text-primary">Directions</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
