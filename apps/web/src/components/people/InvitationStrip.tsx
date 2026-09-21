"use client";

// A shared thread, waiting at the top of the threads pane. 022. The web
// kit's `WPendingInvite`: the sharer's mark at 28, "Ana shared Lisbon trip
// with you", and Look.

import { Avatar } from "../Avatar";
import { nameOf, type Invitation } from "../../lib/people";
import styles from "./people.module.css";

export function InvitationStrip({ invitation, onLook }: { invitation: Invitation; onLook: () => void }) {
  return (
    <button type="button" className={styles.strip} onClick={onLook}>
      <Avatar uid={invitation.from.accountId} initials={invitation.from.initials} name={invitation.from.displayName ?? undefined} size={28} />
      <span className={styles.stripText}>
        {nameOf(invitation.from)} shared {invitation.threadName} with you
      </span>
      <span className={styles.stripLook}>Look</span>
    </button>
  );
}
