"use client";

// A connection request, answered on the card. 022. The kit's `PendingInvite`
// with the two chips on their own line; the mark is a door to the person.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "../Avatar";
import { nameOf, type RequestCard as Card } from "../../lib/people";
import styles from "./people.module.css";

export function RequestCard({
  card,
  onAnswer,
}: {
  card: Card;
  onAnswer: (answer: "accept" | "dismiss") => Promise<boolean>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "dismiss" | null>(null);
  const [failed, setFailed] = useState<"accept" | "dismiss" | null>(null);

  async function answer(which: "accept" | "dismiss") {
    setBusy(which);
    setFailed(null);
    const ok = await onAnswer(which);
    setBusy(null);
    if (!ok) setFailed(which);
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardLine}>
        <button type="button" className={styles.door} onClick={() => router.push(`/people/${card.accountId}`)} aria-label={nameOf(card)}>
          <Avatar uid={card.accountId} initials={card.initials} name={card.displayName ?? undefined} size={28} />
        </button>
        <span className={styles.cardText}>{nameOf(card)} wants to connect</span>
      </div>
      <div className={styles.cardChips}>
        <button type="button" className={styles.chip} onClick={() => void answer("accept")} disabled={busy !== null}>
          {failed === "accept" ? "Try again" : "Accept"}
        </button>
        <button type="button" className={styles.chipOutlined} onClick={() => void answer("dismiss")} disabled={busy !== null}>
          {failed === "dismiss" ? "Try again" : "Not now"}
        </button>
        {failed ? (
          <span className={styles.failed} role="alert" style={{ margin: 0 }}>
            That didn&rsquo;t go through.
          </span>
        ) : null}
      </div>
    </div>
  );
}
