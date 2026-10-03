// 033. Before you start: the name and the consent, on one screen.
//
// The only two things first run has to ask, so they share a screen and a
// button, and neither can be skipped: one button, disabled until the name has
// a character and both ticks are on. On the plain page, never on the prism.
//
// The name-only path, for an account that finished first run before there
// were names, is this screen with the name alone.

import { ScrollView, Text, View } from "react-native";
import { BEFORE, NAME_STEP } from "../../lib/gate";
import { ConsentTicks } from "../ConsentTicks";
import { NameField } from "../NameField";
import { RunFooter } from "./RunFooter";
import { GUTTER, SKIN, titleStyle, type Tone } from "./skin";

function Head({ tone, children }: { tone: Tone; children: string }) {
  return (
    <Text className={`font-core font-semibold ${SKIN[tone].text}`} style={{ fontSize: 18, lineHeight: 23, marginBottom: 12 }}>
      {children}
    </Text>
  );
}

export function BeforeYouStart({
  tone,
  nameOnly,
  name,
  onName,
  readPolicy,
  agreeToProcessing,
  onReadPolicy,
  onAgreeToProcessing,
  working,
  failed,
  onContinue,
}: {
  tone: Tone;
  nameOnly: boolean;
  name: string;
  onName: (next: string) => void;
  readPolicy: boolean;
  agreeToProcessing: boolean;
  onReadPolicy: (next: boolean) => void;
  onAgreeToProcessing: (next: boolean) => void;
  working: boolean;
  failed: boolean;
  onContinue: () => void;
}) {
  const skin = SKIN[tone];
  const ready = name.trim().length > 0 && (nameOnly || (readPolicy && agreeToProcessing));

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 22, paddingHorizontal: GUTTER, paddingBottom: 8 }}
      >
        <Text className={`font-core font-semibold ${skin.text}`} style={titleStyle(tone)} accessibilityRole="header">
          {nameOnly ? NAME_STEP.title : BEFORE.title}
        </Text>

        <View style={{ marginTop: 28 }}>
          {nameOnly ? null : <Head tone={tone}>{BEFORE.name}</Head>}
          <NameField
            tone={tone}
            large
            value={name}
            onChange={onName}
            onSubmit={() => {
              if (nameOnly && ready) onContinue();
            }}
          />
          <Text className={`font-core ${skin.quiet}`} style={{ fontSize: 14, lineHeight: 20, marginTop: 8, marginHorizontal: 2 }}>
            {NAME_STEP.sub}
          </Text>
        </View>

        {nameOnly ? null : (
          <View style={{ marginTop: 28 }}>
            <Head tone={tone}>{BEFORE.agree}</Head>
            <ConsentTicks
              tone={tone}
              readPolicy={readPolicy}
              agreeToProcessing={agreeToProcessing}
              onReadPolicy={onReadPolicy}
              onAgreeToProcessing={onAgreeToProcessing}
            />
          </View>
        )}
      </ScrollView>

      {/* Announced, because the button simply stops working otherwise and
          nothing on screen says why. Same copy as the web. */}
      {failed ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="text-center font-core text-body-sm text-text-on-attention"
          style={{ paddingTop: 12, paddingHorizontal: GUTTER }}
        >
          That did not go through. Check your connection and try again.
        </Text>
      ) : null}
      <RunFooter tone={tone} main={{ label: BEFORE.next, onPress: onContinue, disabled: !ready || working }} />
    </View>
  );
}
