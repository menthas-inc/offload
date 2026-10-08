// Making a new connection, the step itself. 022, pulled out of the add screen
// by 031 so My people can draw it in place.
//
// One full address, matched exactly and case-insensitively, returns one
// account or none: no partial match, no name search, no suggestions, because a
// name search over real people is a directory whether or not it is called one.
// The found row shows the address as the account stores it, which is what
// confirms the match was case-insensitive rather than lucky. A typo and a
// non-account look identical, and no wording can distinguish them; the not
// found copy is the honest limit of the no-invite rule.
//
// The field is the caller's, since the add screen and My people draw it
// differently; the lookup, the found row, its refusals and every line under it
// are this one piece.

import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Avatar } from "../Avatar";
import { useColors } from "../../lib/colors";
import { refreshMe } from "../../lib/me";
import {
  LOOKUP_LIMITED,
  answerRequest,
  dayMonth,
  firstNameOf,
  lookup,
  nameOf,
  requestConnection,
  stateOfLookup,
  type Found,
} from "../../lib/people";

const isAndroid = Platform.OS === "android";

export type StepState =
  | { kind: "empty" }
  | { kind: "looking" }
  | { kind: "found"; found: Found; line?: string; answered?: "dismissed" }
  | { kind: "none" }
  | { kind: "limited" }
  | { kind: "failed" };

/** "Pending since 4 Aug". */
function since(iso: string | null): string {
  if (!iso) return "Pending";
  return `Pending since ${dayMonth(iso)}`;
}

/** The step's state and its three writes. `onChanged` runs after anything
 *  that changes who the person is to you, so a page listing them can read
 *  again. */
export function useConnectionStep(onChanged?: () => void) {
  const [email, setEmailRaw] = useState("");
  const [state, setState] = useState<StepState>({ kind: "empty" });
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);

  function setEmail(next: string) {
    setEmailRaw(next);
    if (state.kind !== "empty") setState({ kind: "empty" });
  }

  async function look() {
    const address = email.trim();
    if (!address.includes("@")) return;
    setState({ kind: "looking" });
    setSendFailed(false);
    setState(stateOfLookup(await lookup(address)));
  }

  async function ask(found: Found) {
    setSending(true);
    setSendFailed(false);
    const outcome = await requestConnection(found.accountId);
    setSending(false);
    if (outcome.ok) {
      setState({ kind: "found", found: { ...found, relation: "you_asked", requestId: outcome.requestId, since: outcome.since } });
      onChanged?.();
      return;
    }
    // The server said what the person already is to us; the row says it.
    if (outcome.error === "connected") setState({ kind: "found", found: { ...found, relation: "connected" } });
    else if (outcome.error === "pending") setState({ kind: "found", found: { ...found, relation: "you_asked", requestId: outcome.requestId ?? null } });
    // A request to this person ended in the last week. What is refused is
    // said, and the row keeps its control for when the week is up.
    else if (outcome.error === "too_soon") setState({ kind: "found", found, line: "You asked recently. Try again in a week." });
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
    onChanged?.();
    // Not now leaves the request pending on their side, so the row says so
    // rather than offering Ask to connect, which the server would refuse.
    setState(which === "accept" ? { kind: "found", found: { ...found, relation: "connected" } } : { kind: "found", found, answered: "dismissed" });
  }

  return { email, setEmail, state, look, ask, answer, sending, sendFailed };
}

/** Everything under the field: the not-found lines, the refusals, and the
 *  found row. Nothing while the field is empty or looking. */
export function StepResult({ step }: { step: ReturnType<typeof useConnectionStep> }) {
  const { state } = step;
  const quiet = isAndroid ? "text-a-on-var" : "text-text-secondary";
  const ink = isAndroid ? "text-a-on" : "text-text-primary";

  if (state.kind === "none") {
    return (
      <View className="pt-space-6">
        <Text className={`font-core font-medium ${ink}`} style={{ fontSize: 15, lineHeight: 20 }}>
          No offload account for that
        </Text>
        <Text className={`pt-space-2 font-core ${quiet}`} style={{ fontSize: 14, lineHeight: 20 }}>
          Check the spelling. If they are not on offload, there is nothing here that can add them.
        </Text>
      </View>
    );
  }
  if (state.kind === "limited") {
    return (
      <Text className="pt-space-5 font-core text-text-danger" style={{ fontSize: 13 }} accessibilityRole="alert">
        {LOOKUP_LIMITED}
      </Text>
    );
  }
  if (state.kind === "failed") {
    return (
      <Text className="pt-space-5 font-core text-text-danger" style={{ fontSize: 13 }} accessibilityRole="alert">
        That didn&apos;t go through.{" "}
        <Text className="font-core font-medium text-text-accent" onPress={() => void step.look()}>
          Try again
        </Text>
      </Text>
    );
  }
  if (state.kind !== "found") return null;
  return (
    <FoundRow
      found={state.found}
      sending={step.sending}
      failed={step.sendFailed}
      line={state.line}
      dismissed={state.answered === "dismissed"}
      onRequest={() => void step.ask(state.found)}
      onAnswer={(which) => void step.answer(state.found, which)}
    />
  );
}

function FoundRow({
  found,
  sending,
  failed,
  line,
  dismissed,
  onRequest,
  onAnswer,
}: {
  found: Found;
  sending: boolean;
  failed: boolean;
  line?: string | undefined;
  dismissed: boolean;
  onRequest: () => void;
  onAnswer: (which: "accept" | "dismiss") => void;
}) {
  const router = useRouter();
  const COLOR = useColors();
  const first = firstNameOf(found);
  const trailing = (() => {
    if (dismissed) return <Value>Not now</Value>;
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
        return <AnswerChip label={failed ? "Try again" : "Ask to connect"} filled onPress={onRequest} disabled={sending} />;
    }
  })();

  return (
    <View className="pt-space-6">
      {/* Dark theme: edges (design decisions, 2026-10-07). */}
      <View
        className={`flex-row items-center gap-space-4 rounded-lg px-space-4 py-space-3 ${isAndroid ? "bg-a-c-low" : "bg-surface-fill"}`}
        style={{ minHeight: 56, boxShadow: `inset 0 0 0 1px ${COLOR.edgeCard}` }}
      >
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
      {line ? (
        <Text className="pt-space-3 font-core text-text-danger" style={{ fontSize: 13 }} accessibilityRole="alert">
          {line}
        </Text>
      ) : null}
      {!dismissed && (found.relation === "none" || found.relation === "you_asked") ? (
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
      // Drawn at 30, hit at 44.
      hitSlop={{ top: 7, bottom: 7 }}
      className={`items-center justify-center rounded-pill px-space-5 ${filled ? "bg-moss-600" : "border border-border-strong"}`}
      style={{ minHeight: 30, marginVertical: 7, opacity: disabled ? 0.55 : 1 }}
    >
      <Text className={`font-core font-medium ${filled ? "text-text-on-solid" : isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );
}
