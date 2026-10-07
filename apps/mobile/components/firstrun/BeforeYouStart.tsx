// 033. Before you start: the name and the consent, on one screen.
//
// The only two things first run has to ask, so they share a screen and a
// button, and neither can be skipped: one button, disabled until the name has
// a character and both ticks are on. On the plain page, never on the prism.
//
// The name-only path, for an account that finished first run before there
// were names, is this screen with the name alone. Asked again, for an active
// account whose policy or terms moved, it is the ticks under a line that says
// so, with the name only when there is none yet.

import { Linking, ScrollView, Text, View } from "react-native";
import { BEFORE, GATE, NAME_STEP, RECONSENT, WAY_OUT } from "../../lib/gate";
import { PRIVACY_URL, TERMS_URL } from "../../lib/links";
import { ConsentTicks } from "../ConsentTicks";
import { NameField } from "../NameField";
import { RunFooter } from "./RunFooter";
import { GUTTER, SKIN, titleStyle, type Tone } from "./skin";

/** The links' colour, as the ticks draw theirs. */
const LINK = { ios: "text-text-accent", android: "text-blue-700" } as const;

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
  onWayOut,
  again = false,
  askName = true,
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
  /** Asked again only: to My account, where the copy and the delete are,
   *  without agreeing first. */
  onWayOut?: () => void;
  again?: boolean;
  askName?: boolean;
}) {
  const skin = SKIN[tone];
  const ready = (!askName || name.trim().length > 0) && (nameOnly || (readPolicy && agreeToProcessing));

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 22, paddingHorizontal: GUTTER, paddingBottom: 8 }}
      >
        <Text className={`font-core font-semibold ${skin.text}`} style={titleStyle(tone)} accessibilityRole="header">
          {nameOnly ? NAME_STEP.title : again ? BEFORE.again : BEFORE.title}
        </Text>

        {askName ? (
          <View style={{ marginTop: 28 }}>
            {nameOnly ? null : <Head tone={tone}>{BEFORE.name}</Head>}
            <NameField
              tone={tone}
              large
              value={name}
              onChange={onName}
              onSubmit={() => {
                if ((nameOnly || again) && ready) onContinue();
              }}
            />
            <Text className={`font-core ${skin.quiet}`} style={{ fontSize: 14, lineHeight: 20, marginTop: 8, marginHorizontal: 2 }}>
              {NAME_STEP.sub}
            </Text>
          </View>
        ) : null}

        {nameOnly ? null : (
          <View style={{ marginTop: 28 }}>
            <Head tone={tone}>{BEFORE.agree}</Head>
            {again ? (
              <Text className={`font-core ${skin.quiet}`} style={{ fontSize: 14, lineHeight: 20, marginBottom: 4, marginHorizontal: 2 }}>
                {RECONSENT.before}
                <Text className={`font-medium ${LINK[tone]}`} onPress={() => void Linking.openURL(TERMS_URL)}>
                  {RECONSENT.terms}
                </Text>
                {RECONSENT.middle}
                <Text className={`font-medium ${LINK[tone]}`} onPress={() => void Linking.openURL(PRIVACY_URL)}>
                  {RECONSENT.policy}
                </Text>
                {RECONSENT.after}
              </Text>
            ) : null}
            <ConsentTicks
              tone={tone}
              readPolicy={readPolicy}
              agreeToProcessing={agreeToProcessing}
              onReadPolicy={onReadPolicy}
              onAgreeToProcessing={onAgreeToProcessing}
            />
            {/* The way out the terms promise, quiet, under the ticks. */}
            {again ? (
              <Text className={`font-core ${skin.quiet}`} style={{ fontSize: 14, lineHeight: 20, marginTop: 12, marginHorizontal: 2 }}>
                <Text className={`font-medium ${LINK[tone]}`} onPress={onWayOut} accessibilityRole="link">
                  {WAY_OUT}
                </Text>
              </Text>
            ) : null}
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
          {GATE.failed}
        </Text>
      ) : null}
      <RunFooter tone={tone} main={{ label: BEFORE.next, onPress: onContinue, disabled: !ready || working }} />
    </View>
  );
}
