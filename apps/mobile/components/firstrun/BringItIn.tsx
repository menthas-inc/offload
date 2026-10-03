// 033. Bring it all in: Mail, Calendar and notifications as optional cards.
//
// After the account is active, so leaving here costs nothing: every card is
// also in Settings. Only the cards that can apply are drawn (the screen decides
// that before it opens; see `bringCards`), and Skip for now and Done both go
// to Today, Done requiring nothing.
//
// **The notification dialog fires from its card and nowhere else in first
// run.** Asked straight after consent it was a dialog about nothing.

import { useState, type ReactNode } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Notifications from "expo-notifications";
import * as WebBrowser from "expo-web-browser";
import { Glyph } from "../Glyph";
import { ProviderMark } from "../ConnectStep";
import { StatusPill } from "../settings/Rows";
import type { ToastState } from "../shell/Toast";
import { useColors } from "../../lib/colors";
import { googleCalendarMark } from "../../lib/brands";
import { API_URL } from "../../lib/auth";
import { WEB_URL } from "../../lib/links";
import { register } from "../../lib/notifications";
import { BRING, CONNECT_STEP, MAIL_ADDRESS, MAIL_CARD_URL } from "../../lib/gate";
import type { Card as CardKind } from "../../lib/firstRun";
import { RunFooter } from "./RunFooter";
import { GUTTER, SIZE, SKIN, titleStyle, type Tone } from "./skin";

function Offer({
  tone,
  mark,
  title,
  line,
  children,
}: {
  tone: Tone;
  mark: ReactNode;
  title: string;
  line: ReactNode;
  children: ReactNode;
}) {
  const skin = SKIN[tone];
  return (
    <View className={skin.card} style={{ borderRadius: SIZE[tone].cardRadius, padding: 16 }}>
      <View className="flex-row items-start" style={{ gap: 14 }}>
        {mark}
        <View className="flex-1">
          <Text className={`font-core font-semibold ${skin.text}`} style={{ fontSize: 17, lineHeight: 21 }}>
            {title}
          </Text>
          <Text className={`font-core ${skin.quiet}`} style={{ fontSize: 14.5, lineHeight: 20, marginTop: 4 }}>
            {line}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center" style={{ gap: 8, marginTop: 14 }}>
        {children}
      </View>
    </View>
  );
}

function Mark({ glyph, ground, color }: { glyph: string; ground: string; color: string }) {
  return (
    <View className={`items-center justify-center ${ground}`} style={{ width: 44, height: 44, borderRadius: 12 }}>
      <Glyph name={glyph} size={21} color={color} />
    </View>
  );
}

/** A card's button. They share the card's width equally; the calendar's is
 *  filled, the rest outlined. */
function CardButton({
  tone,
  label,
  glyph,
  filled = false,
  onPress,
}: {
  tone: Tone;
  label: string;
  glyph?: string;
  filled?: boolean;
  onPress: () => void;
}) {
  const COLOR = useColors();
  const skin = SKIN[tone];
  const height = SIZE[tone].cardButton;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // 38 or 40 drawn, 44 to the touch.
      hitSlop={(44 - height) / 2}
      className={`flex-1 flex-row items-center justify-center rounded-pill active:opacity-90 ${
        filled ? skin.main : skin.outline
      }`}
      style={{ minHeight: height, paddingHorizontal: 10, gap: 6 }}
    >
      {glyph ? <Glyph name={glyph} size={15} color={tone === "android" ? COLOR.sectionGlyph : COLOR.ink} /> : null}
      <Text
        className={`font-core font-medium ${filled ? skin.mainText : skin.outlineText}`}
        style={{ fontSize: 14 }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function BringItIn({
  tone,
  cards,
  email,
  connected,
  onCalendarReturn,
  toast,
  onLeave,
}: {
  tone: Tone;
  /** Decided once, before the screen opens, so a card never vanishes from
   *  under the thumb after it is answered. */
  cards: readonly CardKind[];
  email: string;
  connected: boolean;
  onCalendarReturn: () => void;
  toast: ToastState;
  onLeave: () => void;
}) {
  const COLOR = useColors();
  const skin = SKIN[tone];
  const [permission, setPermission] = useState<"ask" | "granted" | "denied">("ask");

  async function allow() {
    const answer = await Notifications.requestPermissionsAsync().catch(() => null);
    if (answer?.status === "granted") {
      setPermission("granted");
      void register();
    } else setPermission("denied");
  }

  function connect() {
    // The same flow Settings runs, returning to the web's Bring it all in
    // rather than the Calendar page. The browser session closes on its own or
    // by hand; either way this screen is still here and reads the calendars
    // again, so Connected is what the server says rather than what the URL did.
    void WebBrowser.openAuthSessionAsync(
      `${API_URL}/api/connectors/google/start?landing=first-run-bring`,
      `${WEB_URL}/welcome/bring`,
    ).then(onCalendarReturn);
  }

  return (
    <View className="flex-1">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: 22, paddingHorizontal: GUTTER, paddingBottom: 8 }}>
        <Text className={`font-core font-semibold ${skin.text}`} style={titleStyle(tone)} accessibilityRole="header">
          {BRING.title}
        </Text>
        <Text className={`font-core ${skin.quiet}`} style={{ fontSize: 17, lineHeight: 25, marginTop: 12 }}>
          {BRING.lead}
        </Text>

        <View style={{ gap: 12, marginTop: 24 }}>
          {cards.includes("mail") ? (
            <Offer
              tone={tone}
              mark={<Mark glyph="mail" ground="bg-surface-accent-soft" color={COLOR.accentInk} />}
              title={BRING.mail.title}
              line={BRING.mail.line(email).map((part) =>
                part === MAIL_ADDRESS ? (
                  <Text key={part} className={`font-medium ${skin.text}`}>
                    {part}
                  </Text>
                ) : (
                  part
                ),
              )}
            >
              <CardButton
                tone={tone}
                label={BRING.mail.copy}
                glyph="copy"
                onPress={() => void Clipboard.setStringAsync(MAIL_ADDRESS).then(() => toast.show(BRING.mail.copied))}
              />
              <CardButton tone={tone} label={BRING.mail.contacts} onPress={() => void WebBrowser.openBrowserAsync(MAIL_CARD_URL)} />
            </Offer>
          ) : null}

          {cards.includes("calendar") ? (
            <Offer
              tone={tone}
              mark={<ProviderMark tone={tone} source={googleCalendarMark} size={44} radius={12} />}
              title={BRING.calendar.title}
              line={CONNECT_STEP.sub}
            >
              {connected ? (
                <StatusPill label={BRING.calendar.connected} />
              ) : (
                <CardButton tone={tone} label={BRING.calendar.connect} filled onPress={connect} />
              )}
            </Offer>
          ) : null}

          {cards.includes("notifications") ? (
            <Offer
              tone={tone}
              mark={<Mark glyph="bell" ground="bg-surface-attention-soft" color={COLOR.textOnAttention} />}
              title={BRING.notifications.title}
              line={BRING.notifications.line}
            >
              {permission === "granted" ? (
                <StatusPill label={BRING.notifications.allowed} />
              ) : permission === "denied" ? (
                <CardButton tone={tone} label={BRING.notifications.settings} onPress={() => void Linking.openSettings()} />
              ) : (
                <CardButton tone={tone} label={BRING.notifications.allow} onPress={() => void allow()} />
              )}
            </Offer>
          ) : null}
        </View>
      </ScrollView>

      <RunFooter
        tone={tone}
        skip={{ label: BRING.skip, onPress: onLeave }}
        main={{ label: BRING.done, onPress: onLeave }}
      />
    </View>
  );
}
