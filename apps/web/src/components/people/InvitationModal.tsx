"use client";

// A shared thread, before it is yours. 022. The web kit's `WInviteModal`,
// with the snapshot the server took when the share was made: nothing here
// reads the thread. Not now closes it; the strip waits.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../Icon";
import { Avatar } from "../Avatar";
import { Modal } from "./Modal";
import { acceptInvitation, firstNameOf, nameOf, type Invitation } from "../../lib/people";
import styles from "./people.module.css";

function withNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return ` With ${names[0]}.`;
  if (names.length === 2) return ` With ${names[0]} and ${names[1]}.`;
  return ` With ${names[0]}, ${names[1]} and ${names.length - 2} more.`;
}

export function InvitationModal({ invitation, onClose, onGone }: { invitation: Invitation; onClose: () => void; onGone: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [gone, setGone] = useState(false);

  async function add() {
    setBusy(true);
    setFailed(false);
    const result = await acceptInvitation(invitation.memberId);
    setBusy(false);
    if (result === "gone") {
      setGone(true);
      onGone();
      return;
    }
    if (!result) {
      setFailed(true);
      return;
    }
    onClose();
    router.push(`/threads/${result.threadId}`);
  }

  const first = firstNameOf(invitation.from);
  return (
    <Modal label={`${nameOf(invitation.from)} shared ${invitation.threadName} with you`} wide onClose={onClose}>
      {gone ? (
        <p className={styles.gone}>Not here any more.</p>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
            <Avatar uid={invitation.from.accountId} initials={invitation.from.initials} name={invitation.from.displayName ?? undefined} size={56} />
            <h2 className={styles.modalTitle} style={{ flex: 1, lineHeight: 1.25 }}>
              {nameOf(invitation.from)} shared {invitation.threadName} with you
            </h2>
          </div>
          <p className={styles.modalBody} style={{ marginTop: "var(--space-4)" }}>
            {invitation.preview.count} in it. You can add to it, and you cannot delete anything of {first}&rsquo;s.
            {withNames(invitation.members)}
          </p>
          {invitation.preview.titles.length > 0 ? (
            <div className={styles.preview}>
              {invitation.preview.titles.map((title, i) => (
                <div key={`${title}-${i}`} className={styles.previewRow}>
                  <Icon name="square-check-big" size={16} />
                  <span className={styles.previewTitle}>{title}</span>
                  <span className={styles.previewMeta}>{first} added it</span>
                </div>
              ))}
            </div>
          ) : null}
          {failed ? (
            <p className={styles.failed} role="alert">
              That didn&rsquo;t go through.
            </p>
          ) : null}
          <div className={styles.modalActions}>
            <button type="button" className={styles.ghost} onClick={onClose} disabled={busy}>
              Not now
            </button>
            <button type="button" className={styles.primary} onClick={() => void add()} disabled={busy}>
              {failed ? "Try again" : "Add it to my threads"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
