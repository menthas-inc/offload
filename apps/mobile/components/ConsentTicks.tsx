// The two ticks on the consent screen of first run, shared by both platforms.
//
// The copy is in lib/gate.ts with the rest of the gate, so iOS and Android
// cannot say different things. Only the chrome forks, and on this screen that
// is two colours, so it is a `tone` prop rather than a pair of files.
//
// There is no checkbox primitive in React Native, so this is the design
// system's Checkbox drawn by hand, filled when ticked. 033 draws it larger than
// the contract's 20px on iOS, 24 at radius 7, with the labels at 16px, because
// first run is the one place it has the room and the most to say; Android
// keeps Material's 20 at radius 3. The strike-through its label gets in the kit is left out, because
// that behaviour is for a task being crossed off and a struck-through consent
// line would read as one that had been withdrawn.

import { Linking, Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { CONSENT } from "../lib/gate";
import { PRIVACY_URL, TERMS_URL } from "../lib/links";
import { useColors } from "../lib/colors";
import { Glyph } from "./Glyph";

/** The box, per platform. 033's first-run sizes, logged in the design log. */
const BOX = { ios: { size: 24, radius: 7 }, android: { size: 20, radius: 3 } } as const;

export type ConsentTone = "ios" | "android";

const TONE = {
  // Ink on iOS, Material's primary on Android, which is the same pair the two
  // gates already use for their filled button. The box edge is the shared
  // --border-strong on both: --a-outline is Material's divider, and a control
  // drawn with it measured 1.29:1 where --border-strong gives 3.2.
  ios: { text: "text-text-primary", box: "border-border-strong", fill: "bg-ink-950", link: "text-text-accent" },
  android: { text: "text-a-on", box: "border-border-strong", fill: "bg-blue-600", link: "text-blue-700" },
} as const;

function Box({ tone, on }: { tone: ConsentTone; on: boolean }) {
  const COLOR = useColors();
  const skin = TONE[tone];
  const box = BOX[tone];
  return (
    <View
      className={`items-center justify-center ${on ? `${skin.fill} border-transparent` : skin.box}`}
      style={{ width: box.size, height: box.size, borderRadius: box.radius, borderWidth: tone === "ios" ? 1.5 : 2, marginTop: 1 }}
    >
      {on ? (
        <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
          <Path
            d="M20 6L9 17l-5-5"
            stroke={tone === "android" ? COLOR.onBrand : COLOR.onSolid}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
    </View>
  );
}

export interface ConsentTicksProps {
  tone: ConsentTone;
  readPolicy: boolean;
  agreeToProcessing: boolean;
  onReadPolicy: (next: boolean) => void;
  onAgreeToProcessing: (next: boolean) => void;
}

export function ConsentTicks({
  tone,
  readPolicy,
  agreeToProcessing,
  onReadPolicy,
  onAgreeToProcessing,
}: ConsentTicksProps) {
  const skin = TONE[tone];
  const COLOR = useColors();
  const label = { fontSize: 16, lineHeight: 23 };

  return (
    <View>
      {/* The whole row is the target, which is how a small box gets a 44px hit
          area without being drawn any bigger. */}
      <Pressable
        onPress={() => onReadPolicy(!readPolicy)}
        className="min-h-tap-min flex-row items-start"
        style={{ gap: 14, paddingVertical: 12 }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: readPolicy }}
      >
        <Box tone={tone} on={readPolicy} />
        <Text className={`flex-1 font-core ${skin.text}`} style={label}>
          {CONSENT.termsBefore}
          <Text
            className={`font-medium ${skin.link}`}
            onPress={() => void Linking.openURL(TERMS_URL)}
          >
            {CONSENT.termsLink}
          </Text>
          {CONSENT.policyBefore}
          <Text
            className={`font-medium ${skin.link}`}
            onPress={() => void Linking.openURL(PRIVACY_URL)}
          >
            {CONSENT.policyLink}
          </Text>
          {CONSENT.policyAfter}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => onAgreeToProcessing(!agreeToProcessing)}
        className="min-h-tap-min flex-row items-start border-t border-border-hairline"
        style={{ gap: 14, paddingVertical: 12 }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreeToProcessing }}
      >
        <Box tone={tone} on={agreeToProcessing} />
        <Text className={`flex-1 font-core ${skin.text}`} style={label}>
          {CONSENT.processing}
        </Text>
      </Pressable>

      <View
        className="flex-row items-start bg-surface-attention-soft"
        style={{ gap: 10, marginTop: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12 }}
      >
        <View style={{ marginTop: 2 }}>
          <Glyph name="lock" size={16} color={COLOR.textOnAttention} />
        </View>
        <Text className="flex-1 font-core text-text-on-attention" style={{ fontSize: 14.5, lineHeight: 20 }}>
          {CONSENT.note}
        </Text>
      </View>
    </View>
  );
}
