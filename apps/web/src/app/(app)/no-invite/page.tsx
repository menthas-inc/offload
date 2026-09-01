"use client";

// Authentication worked, authorization did not.
//
// From the kit: the address is named inside the sentence rather than on a line
// of its own, both actions are full-width buttons rather than one button and a
// quiet link, and the footer answers the question the screen provokes, which is
// "but I was invited".

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GateCard, GateChrome } from "../../../components/GateChrome";
import styles from "../auth.module.css";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

export default function NoInvitePage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    // Read once; the server clears the cookie as it answers, so a reload shows
    // the screen without the address rather than a stale one.
    fetch(`${API}/api/sign-in/attempt`, { credentials: "include" })
      .then((response) => (response.ok ? response.json() : { email: null }))
      .then((data: { email: string | null }) => setEmail(data.email))
      .catch(() => setEmail(null));
  }, []);

  function join() {
    if (!email) return;
    setJoined(true);
    // Not awaited for a verdict. The endpoint answers identically for every
    // address by design, so there is nothing to branch on.
    void fetch(`${API}/v1/waitlist`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
  }

  if (joined) {
    return (
      <GateChrome>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
          <GateCard>
            <h1 className={styles.title}>You are on the list</h1>
            <p className={styles.sub}>
              We will email {email ? <span className={styles.subStrong}>{email}</span> : "you"} when your
              account is ready to use.
            </p>
          </GateCard>
          <p className={styles.toast}>Added to the waitlist</p>
        </div>
      </GateChrome>
    );
  }

  return (
    <GateChrome>
      <GateCard>
        <h1 className={styles.title}>You are not on the list yet</h1>
        <p className={styles.sub}>
          offload is invite only right now.{" "}
          {email ? (
            <>
              We checked <span className={styles.subStrong}>{email}</span> and found no invite.
            </>
          ) : (
            "We found no invite for that account."
          )}
        </p>

        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={join} disabled={!email}>
            Join the waitlist with this email
          </button>
          <button type="button" className={styles.secondary} onClick={() => router.replace("/sign-in")}>
            Use a different account
          </button>
        </div>

        <p className={styles.caption}>Invited on another address? Sign in with that one instead.</p>
      </GateCard>
    </GateChrome>
  );
}
