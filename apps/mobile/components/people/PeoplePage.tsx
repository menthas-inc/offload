// My people, and the Blocked page behind its last row. 022.
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
import { Platform, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Group, Row } from "../settings/Rows";
import { PersonRow } from "./PersonRow";
import { RequestCard } from "./RequestCard";
import { ConfirmSheet } from "./ConfirmSheet";
import { refreshMe } from "../../lib/me";
import {
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
  const at = new Date(iso);
  return `Pending since ${at.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
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
      {page.requestsForYou.map((card) => (
        <RequestCard key={card.id} card={card} onAnswer={(answer) => answerCard(card.id, answer)} />
      ))}

      <Group label="Connected">
        {page.connections.length === 0 ? (
          <Text className={`py-space-4 font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 14, lineHeight: 20 }}>
            Nobody yet. A connection is somebody already on offload; open a thread and tap Share to ask.
          </Text>
        ) : (
          page.connections.map((row, i) => (
            <PersonRow key={row.accountId} person={row} note={sharedNote(row)} last={i === page.connections.length - 1} />
          ))
        )}
      </Group>

      {page.pending.length > 0 ? (
        <Group label="Pending">
          {page.pending.map((card, i) => (
            <PersonRow
              key={card.id}
              person={card}
              note={sinceLabel(card.since)}
              value="Withdraw"
              onPress={() => {
                setWithdrawFailed(false);
                setWithdrawing(card);
              }}
              last={i === page.pending.length - 1}
            />
          ))}
        </Group>
      ) : null}

      <Group label="Blocked">
        <Row title="Blocked" value={page.blocked.length > 0 ? String(page.blocked.length) : "None"} onPress={() => router.push("/settings/blocked")} last />
      </Group>

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

export function BlockedPage() {
  const { page, load } = usePeople();
  const [unblocking, setUnblocking] = useState<string | null>(null);
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
            void unblockPerson(person.accountId).then(async () => {
              setUnblocking(null);
              await load();
            });
          }}
          last={i === page.blocked.length - 1}
        />
      ))}
    </Group>
  );
}
