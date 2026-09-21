// Add a connection. 022.
//
// The exploration's three states, and the one the field starts in. One full
// address, matched exactly and case-insensitively, returns one account or
// none: no partial match, no name search, no suggestions, because a name
// search over real people is a directory whether or not it is called one.
// The found row shows the address as the account stores it, which is what
// confirms the match was case-insensitive rather than lucky. A typo and a
// non-account look identical, and no wording can distinguish them; the not
// found copy is the honest limit of the no-invite rule.
//
// Reached from the share sheet's last row and nowhere else: sharing starts
// from a thread, and My people lists people rather than adding them.

import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Glyph } from "../../components/Glyph";
import { Avatar } from "../../components/Avatar";
import { useColors } from "../../lib/colors";
import { refreshMe } from "../../lib/me";
import { dayMonth, answerRequest, firstNameOf, lookup, nameOf, requestConnection, type Found } from "../../lib/people";

const isAndroid = Platform.OS === "android";

type State =
  | { kind: "empty" }
  | { kind: "looking" }
  | { kind: "found"; found: Found }
  | { kind: "none" }
  | { kind: "failed" };

/** "Pending since 4 Aug". */
function since(iso: string | null): string {
  if (!iso) return "Pending";
  return `Pending since ${dayMonth(iso)}`;
}

export default function AddConnection() {
  const router = useRouter();
  const COLOR = useColors();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "empty" });
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);

  async function look() {
    const address = email.trim();
    if (!address.includes("@")) return;
    setState({ kind: "looking" });
    setSendFailed(false);
    const result = await lookup(address);
    if (result.kind === "found") setState(result.found ? { kind: "found", found: result.found } : { kind: "none" });
    else setState({ kind: "failed" });
  }

  async function ask(found: Found) {
    setSending(true);
    setSendFailed(false);
    const outcome = await requestConnection(found.accountId);
    setSending(false);
    if (outcome.ok) {
      setState({ kind: "found", found: { ...found, relation: "you_asked", requestId: outcome.requestId, since: outcome.since } });
      return;
    }
    // The server said what the person already is to us; the row says it.
    if (outcome.error === "connected") setState({ kind: "found", found: { ...found, relation: "connected" } });
    else if (outcome.error === "pending" || outcome.error === "too_soon") setState({ kind: "found", found: { ...found, relation: "you_asked", requestId: outcome.requestId ?? null } });
    else if (outcome.error === "asked_you") setState({ kind: "found", found: { ...found, relation: "asked_you", requestId: outcome.requestId ?? null } });
    else if (outcome.error === "not_found") setState({ kind: "none" });
    else setSendFailed(true);
  }

  async function answer(found: Found, which: "accept" | "dismiss") {
    if (!found.requestId) return;
    setSending(true);
    const ok = await answerRequest(found.requestId, which);
    setSending(false);
    if (!ok) {
      setSendFailed(true);
      return;
    }
    void refreshMe();
    setState({ kind: "found", found: { ...found, relation: which === "accept" ? "connected" : "none" } });
  }

  const skin = isAndroid
    ? { idle: "border-a-outline", on: "border-blue-600", radius: "rounded-xs", bg: "bg-a-surface" }
    : { idle: "border-border-strong", on: "border-ink-950", radius: "rounded-md", bg: "bg-surface-raised" };

  return (
    <SafeAreaView className={`flex-1 ${isAndroid ? "bg-a-surface" : "bg-surface-page"}`} edges={["top"]}>
      <View className="h-appbar-height flex-row items-center gap-space-4 px-gutter-screen">
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <Glyph name="chevron-left" size={22} color={COLOR.iconOnWell} />
        </Pressable>
        <Text className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 17 }}>
          Add a connection
        </Text>
      </View>

      {/* "padding" on both, as the waitlist form learned on a device: this
          app is edge to edge and Android ignores adjustResize, so the field
          sat under the keyboard. The content here is short, so nothing
          below the field needs the room; the field itself does. */}
      <KeyboardAvoidingView className="flex-1" behavior="padding">
      <ScrollView contentContainerClassName="px-gutter-screen pb-space-9 pt-space-3" keyboardShouldPersistTaps="handled">
        <View className={`flex-row items-center border px-space-5 ${skin.radius} ${skin.bg} ${focused ? skin.on : skin.idle}`} style={{ minHeight: 52 }}>
          <TextInput
            value={email}
            onChangeText={(next) => {
              setEmail(next);
              if (state.kind !== "empty") setState({ kind: "empty" });
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={() => void look()}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            returnKeyType="search"
            placeholder="Their email address"
            placeholderTextColor={COLOR.tabOff}
            accessibilityLabel="Their email address"
            className="flex-1 font-core text-body"
            style={{ color: COLOR.ink, paddingVertical: 0 }}
          />
          {state.kind === "looking" ? <ActivityIndicator size="small" color={COLOR.iconOnWell} /> : null}
        </View>

        {state.kind === "empty" || state.kind === "looking" ? (
          <View className="pt-space-7">
            <Text className={`font-core font-medium ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 15, lineHeight: 20 }}>
              You need their offload email
            </Text>
            <Text className={`pt-space-2 font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 14, lineHeight: 20 }}>
              Sharing does not invite anyone in, so there is nobody to look up who is not already here. Ask them which email they signed up with.
            </Text>
          </View>
        ) : null}

        {state.kind === "none" ? (
          <View className="pt-space-7">
            <Text className={`font-core font-medium ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 15, lineHeight: 20 }}>
              No offload account for that
            </Text>
            <Text className={`pt-space-2 font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 14, lineHeight: 20 }}>
              Check the spelling. If they are not on offload, there is nothing here that can add them.
            </Text>
          </View>
        ) : null}

        {state.kind === "failed" ? (
          <Text className="pt-space-5 font-core text-text-danger" style={{ fontSize: 13 }} accessibilityRole="alert">
            That didn't go through.{" "}
            <Text className="font-core font-medium text-text-accent" onPress={() => void look()}>
              Try again
            </Text>
          </Text>
        ) : null}

        {state.kind === "found" ? (
          <FoundRow
            found={state.found}
            sending={sending}
            failed={sendFailed}
            onRequest={() => void ask(state.found)}
            onAnswer={(which) => void answer(state.found, which)}
          />
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FoundRow({
  found,
  sending,
  failed,
  onRequest,
  onAnswer,
}: {
  found: Found;
  sending: boolean;
  failed: boolean;
  onRequest: () => void;
  onAnswer: (which: "accept" | "dismiss") => void;
}) {
  const router = useRouter();
  const first = firstNameOf(found);
  const trailing = (() => {
    switch (found.relation) {
      case "you":
        return <Value>That's you</Value>;
      case "connected":
        return <Value>Already connected</Value>;
      case "you_asked":
        return <Value>{since(found.since)}</Value>;
      case "asked_you":
        return (
          <View className="flex-row items-center gap-space-2">
            <AnswerChip label={failed ? "Try again" : "Accept"} filled onPress={() => onAnswer("accept")} disabled={sending} />
            <AnswerChip label="Not now" onPress={() => onAnswer("dismiss")} disabled={sending} />
          </View>
        );
      case "none":
        return <AnswerChip label={failed ? "Try again" : "Request"} filled onPress={onRequest} disabled={sending} />;
    }
  })();

  return (
    <View className="pt-space-6">
      <View className={`flex-row items-center gap-space-4 rounded-lg px-space-4 py-space-3 ${isAndroid ? "bg-a-c-low" : "bg-surface-fill"}`} style={{ minHeight: 56 }}>
        <Pressable
          onPress={() => (found.relation === "you" ? undefined : router.push(`/people/${found.accountId}`))}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={nameOf(found)}
        >
          <Avatar uid={found.accountId} initials={found.initials} name={found.displayName ?? undefined} size={36} />
        </Pressable>
        <View className="flex-1">
          <Text className={`font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 15, lineHeight: 20 }} numberOfLines={1}>
            {nameOf(found)}
          </Text>
          <Text className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 12.5, marginTop: 2 }} numberOfLines={1}>
            {found.email}
          </Text>
        </View>
        {trailing}
      </View>
      {found.relation === "none" || found.relation === "you_asked" ? (
        <Text className="pt-space-4 font-core text-text-tertiary" style={{ fontSize: 12.5, lineHeight: 18 }}>
          {first} decides whether to accept. Until then you cannot share anything with them, and they are not told what you wanted to share.
        </Text>
      ) : null}
      {failed ? (
        <Text className="pt-space-3 font-core text-text-danger" style={{ fontSize: 13 }} accessibilityRole="alert">
          That didn't go through.
        </Text>
      ) : null}
    </View>
  );
}

function Value({ children }: { children: string }) {
  return (
    <Text className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 13 }}>
      {children}
    </Text>
  );
}

/** The design's `Chip`, accent or outlined, as the request card draws it.
 *  Its own name here since the contract's is `children` and `onClick`. */
function AnswerChip({ label, filled, onPress, disabled }: { label: string; filled?: boolean; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={`items-center justify-center rounded-pill px-space-5 ${filled ? "bg-moss-600" : "border border-border-strong"}`}
      style={{ height: 30, marginVertical: 7, opacity: disabled ? 0.55 : 1 }}
    >
      <Text className={`font-core font-medium ${filled ? "text-text-on-solid" : isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );
}
