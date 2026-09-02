// The two ticks on the consent screen of first run, shared by both platforms.
//
// The copy is in lib/gate.ts with the rest of the gate, so iOS and Android
// cannot say different things. Only the chrome forks, and on this screen that
// is two colours, so it is a `tone` prop rather than a pair of files.
//
// There is no checkbox primitive in React Native, so this is the design
// system's Checkbox drawn by hand: a 20px box at --radius-xs, filled when
// ticked. The strike-through its label gets in the kit is left out, because
// that behaviour is for a task being crossed off and a struck-through consent
// line would read as one that had been withdrawn.

import { Linking, Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { CONSENT } from "../lib/gate";
import { PRIVACY_URL } from "../lib/links";
import { COLOR } from "../lib/colors";

/** The box, from components/forms/Checkbox.jsx, which draws it at this size on
 *  every surface. Not a spacing token: the component contract owns it. */
const BOX = 20;

export type ConsentTone = "ios" | "android";

const TONE = {
  // Ink on iOS, Material's primary on Android, which is the same pair the two
  // gates already use for their filled button.
  ios: { text: "text-text-primary", box: "border-border-strong", fill: "bg-ink-950", link: "text-text-accent" },
  android: { text: "text-a-on", box: "border-a-outline", fill: "bg-blue-600", link: "text-blue-700" },
} as const;

function Box({ tone, on }: { tone: ConsentTone; on: boolean }) {
  const skin = TONE[tone];
  return (
    <View
      className={`items-center justify-center rounded-xs border ${on ? `${skin.fill} border-transparent` : skin.box}`}
      style={{ width: BOX, minHeight: BOX }}
    >
      {on ? (
        <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
          <Path
            d="M20 6L9 17l-5-5"
            stroke={COLOR.onSolid}
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

  return (
    <View className="gap-space-5">
      {/* The whole row is the target, which is how a 20px box gets a 44px hit
          area without being drawn any bigger. */}
      <Pressable
        onPress={() => onReadPolicy(!readPolicy)}
        className="min-h-tap-min flex-row items-center gap-space-5"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: readPolicy }}
      >
        <Box tone={tone} on={readPolicy} />
        <Text className={`flex-1 font-core text-body-sm ${skin.text}`}>
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
        className="min-h-tap-min flex-row items-center gap-space-5"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreeToProcessing }}
      >
        <Box tone={tone} on={agreeToProcessing} />
        <Text className={`flex-1 font-core text-body-sm ${skin.text}`}>{CONSENT.processing}</Text>
      </Pressable>

      <View className="rounded-md bg-surface-attention-soft px-space-6 py-space-5">
        <Text className="font-core text-body-sm text-text-on-attention">{CONSENT.note}</Text>
      </View>
    </View>
  );
}
