// My people, and the Blocked page behind its last row. 022.
//
// 031, *Settings, tightened*: five sections, each opened by its glyph and
// heading. Waiting on you and Asked by you are drawn only when they hold
// something; Connect with someone is the Share sheet's step in place, so the
// page has a way in on day one.
//
// `SettingsDetail.jsx`'s `people` page, as the 21 September design changed
// it: the cards on top, Connected with the shared threads as the note and
// "Nothing shared yet" for a connection who shares nothing, Pending with the
// mark the shipped row lacked and Withdraw as its value, and Blocked. The
// kit's Defaults toggles are not drawn: one would be a second permission and
// the other a notification, and neither exists.
//
// Withdraw is confirmed, since the lead beside it is a door and a mis-tap
// would cost a week under the seven-day rule.

import { useCallback, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Group, Row, Sections } from "../settings/Rows";
import { Glyph } from "../Glyph";
import { StepResult, useConnectionStep } from "./NewConnection";
import { useColors } from "../../lib/colors";
import { PersonRow } from "./PersonRow";
import { RequestCard } from "./RequestCard";
import { ConfirmSheet } from "./ConfirmSheet";
import { refreshMe } from "../../lib/me";
import {
  dayMonth,
  answerRequest,
  fetchPeople,
  firstNameOf,
  unblockPerson,
  withdrawRequest,
  type ConnectionRow,
  type PeoplePage as Page,
  type RequestCard as Card,
} from "../../lib/people";

const isAndroid = Platform.OS === "android";

/** "Pending since 4 Aug". */
export function sinceLabel(iso: string): string {
  return `Pending since ${dayMonth(iso)}`;
}

function sharedNote(row: ConnectionRow): string {
  if (row.threadCount === 0) return "Nothing shared yet";
  const names = row.threads.map((t) => t.name).join(", ");
  const more = row.threadCount - row.threads.length;
  return more > 0 ? `${names} and ${more} more` : names;
}

function usePeople() {
  const [page, setPage] = useState<Page | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    const next = await fetchPeople();
    if (next) {
      setPage(next);
      setFailed(false);
    } else setFailed(true);
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  return { page, failed, load };
}

export function PeoplePage() {
  const router = useRouter();
  const { page, failed, load } = usePeople();
  const [withdrawing, setWithdrawing] = useState<Card | null>(null);
  const [busy, setBusy] = useState(false);
  const [withdrawFailed, setWithdrawFailed] = useState(false);
  // 031. A request sent from here shows in Asked by you without leaving.
  const step = useConnectionStep(() => void load());
  const quiet = isAndroid ? "text-a-on-var" : "text-text-secondary";

  async function answerCard(requestId: string, answer: "accept" | "dismiss"): Promise<boolean> {
    const ok = await answerRequest(requestId, answer);
    if (ok) {
      await load();
      void refreshMe();
    }
    return ok;
  }

  async function withdraw() {
    if (!withdrawing) return;
    setBusy(true);
    const ok = await withdrawRequest(withdrawing.id);
    setBusy(false);
    if (!ok) {
      setWithdrawFailed(true);
      return;
    }
    setWithdrawing(null);
    setWithdrawFailed(false);
    await load();
  }

  if (failed && !page) {
    return (
      <Text className="pt-space-5 font-core text-text-danger" style={{ fontSize: 13 }} accessibilityRole="alert">
        That didn't go through.{" "}
        <Text className="font-core font-medium text-text-accent" onPress={() => void load()}>
          Try again
        </Text>
      </Text>
    );
  }
  if (!page) return null;

  return (
    <>
      <Sections>
        {page.requestsForYou.length > 0 ? (
          <Group label="Waiting on you" icon="bell" count={String(page.requestsForYou.length)} bare>
            {page.requestsForYou.map((card, i) => (
              <RequestCard
                key={card.id}
                card={card}
                onAnswer={(answer) => answerCard(card.id, answer)}
                last={i === page.requestsForYou.length - 1}
              />
            ))}
          </Group>
        ) : null}

        {/* 031. A way in from here, where connecting used to start only from a
            thread's Share sheet. The same step, in place. */}
        <Group label="Connect with someone" icon="user-plus" bare>
          <ConnectField step={step} />
          <Text className={`font-core ${quiet}`} style={{ fontSize: 12.5, lineHeight: 18, marginTop: 8, marginHorizontal: 4 }}>
            They need to be on offload already. You can also share a thread and ask from there.
          </Text>
          <StepResult step={step} />
        </Group>

        <Group
          label="Connected"
          icon="users"
          count={page.connections.length > 0 ? String(page.connections.length) : undefined}
          caption="Who you can share a thread with."
        >
          {page.connections.length === 0 ? (
            <Row
              title="Nobody yet"
              note="A connection is somebody already on offload. Find them above, or open a thread and tap Share."
              last
            />
          ) : (
            page.connections.map((row, i) => (
              <PersonRow key={row.accountId} person={row} note={sharedNote(row)} last={i === page.connections.length - 1} />
            ))
          )}
        </Group>

        {page.pending.length > 0 ? (
          <Group label="Asked by you" icon="clock" count={String(page.pending.length)}>
            {page.pending.map((card, i) => (
              <PersonRow
                key={card.id}
                person={card}
                note={sinceLabel(card.since)}
                pill="Withdraw"
                onPress={() => {
                  setWithdrawFailed(false);
                  setWithdrawing(card);
                }}
                last={i === page.pending.length - 1}
              />
            ))}
          </Group>
        ) : null}

        <Group label="Blocked" icon="ban">
          <Row title="Blocked" value={page.blocked.length > 0 ? String(page.blocked.length) : "None"} onPress={() => router.push("/settings/blocked")} last />
        </Group>
      </Sections>

      <ConfirmSheet
        open={withdrawing !== null}
        title={withdrawing ? `Withdraw the request to ${firstNameOf(withdrawing)}?` : ""}
        body="They will not see it any more, and nothing tells them it was there."
        action="Withdraw"
        busy={busy}
        failed={withdrawFailed}
        onConfirm={() => void withdraw()}
        onClose={() => setWithdrawing(null)}
      />
    </>
  );
}

/** The field on My people: an address and Find. The add screen draws its own,
 *  larger and alone on its screen. */
function ConnectField({ step }: { step: ReturnType<typeof useConnectionStep> }) {
  const COLOR = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <View className="flex-row items-center gap-space-3">
      <View
        className={`flex-1 flex-row items-center gap-space-3 border bg-surface-raised ${
          focused ? (isAndroid ? "border-blue-600" : "border-ink-950") : isAndroid ? "border-a-outline" : "border-border-strong"
        }`}
        style={{ minHeight: 44, borderRadius: isAndroid ? 4 : 12, paddingHorizontal: 14 }}
      >
        <Glyph name="search" size={16} color={COLOR.quiet} />
        <TextInput
          value={step.email}
          onChangeText={step.setEmail}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={() => void step.look()}
          autoCorrect={false}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="search"
          placeholder="Their email address"
          placeholderTextColor={COLOR.tabOff}
          accessibilityLabel="Their email address"
          className="flex-1 font-core"
          style={{ color: COLOR.ink, fontSize: 15, paddingVertical: 0 }}
        />
      </View>
      <Pressable
        onPress={() => void step.look()}
        disabled={step.state.kind === "looking"}
        accessibilityRole="button"
        className={`items-center justify-center rounded-pill ${isAndroid ? "bg-blue-600" : "bg-surface-inverse"}`}
        style={{ minHeight: 44, paddingHorizontal: 18, opacity: step.state.kind === "looking" ? 0.55 : 1 }}
      >
        <Text className={`font-core font-medium ${isAndroid ? "text-text-on-solid" : "text-text-inverse"}`} style={{ fontSize: 14 }}>
          Find
        </Text>
      </Pressable>
    </View>
  );
}

export function BlockedPage() {
  const { page, failed, load } = usePeople();
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const [unblockFailed, setUnblockFailed] = useState(false);
  if (failed && !page) {
    return (
      <Text className="pt-space-5 font-core text-text-danger" style={{ fontSize: 13 }} accessibilityRole="alert">
        That didn't go through.{" "}
        <Text className="font-core font-medium text-text-accent" onPress={() => void load()}>
          Try again
        </Text>
      </Text>
    );
  }
  if (!page) return null;
  if (page.blocked.length === 0) {
    return (
      <Text className={`pt-space-5 font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 15, lineHeight: 22 }}>
        Nobody is blocked.
      </Text>
    );
  }
  return (
    <Group>
      {page.blocked.map((person, i) => (
        <PersonRow
          key={person.accountId}
          person={person}
          value={unblocking === person.accountId ? "Unblocking" : "Unblock"}
          onPress={() => {
            setUnblocking(person.accountId);
            setUnblockFailed(false);
            void unblockPerson(person.accountId).then(async (ok) => {
              setUnblocking(null);
              if (ok) await load();
              else setUnblockFailed(true);
            });
          }}
          last={i === page.blocked.length - 1}
        />
      ))}
      {unblockFailed ? (
        <Text className="py-space-3 font-core text-text-danger" style={{ fontSize: 13 }} accessibilityRole="alert">
          That didn't go through. Tap Unblock again.
        </Text>
      ) : null}
    </Group>
  );
}
