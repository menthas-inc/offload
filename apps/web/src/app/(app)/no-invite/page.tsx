"use client";

// Authentication worked, authorization did not.
//
// From the kit: the address is named inside the sentence rather than on a line
// of its own, both actions are full-width buttons rather than one button and a
// quiet link, and the footer answers the question the screen provokes, which is
// "but I was invited".
//
// 039. Under the caption, *Have a code?*: a store reviewer signs in like
// anybody, lands here, and types the code from the review notes. No kit draws
// it, so it is the card's own pieces: the caption's accent, the kit's refusal
// line, a field at the buttons' height, and the secondary button.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GateCard, GateChrome } from "../../../components/GateChrome";
import { HaveACode } from "../../../components/HaveACode";
import styles from "../auth.module.css";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

export default function NoInvitePage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  // The account exists and is disabled: by staff, or for the day before it is
  // deleted. There is no invite to look for and no waitlist to join, so the
  // screen says what is true and where to write.
  const [disabled, setDisabled] = useState(false);
  // 039. A review code let them in; the next sign-in opens first run.
  const [admitted, setAdmitted] = useState(false);

  useEffect(() => {
    // The cookie runs out on its own after ten minutes. It is not cleared by
    // this read, because a review code typed below is checked against it.
    fetch(`${API}/api/sign-in/attempt`, { credentials: "include" })
      .then((response) => (response.ok ? response.json() : { email: null }))
      .then((data: { email: string | null; reason?: "disabled" | null }) => {
        setEmail(data.email);
        setDisabled(data.reason === "disabled");
      })
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

  if (admitted) {
    return (
      <GateChrome>
        <GateCard>
          <h1 className={styles.title}>You are in</h1>
          <p className={styles.sub}>Sign in once more with the same account.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => router.replace("/sign-in")}>
              Sign in
            </button>
          </div>
        </GateCard>
      </GateChrome>
    );
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
          <p className={styles.toast} role="status" aria-live="polite">
            Added to the waitlist
          </p>
        </div>
      </GateChrome>
    );
  }

  if (disabled) {
    return (
      <GateChrome>
        <GateCard>
          <h1 className={styles.title}>Your account is disabled</h1>
          <p className={styles.sub}>
            <span className={styles.subStrong}>{email}</span> cannot sign in. Write to{" "}
            <a href="mailto:hello@offload.club">hello@offload.club</a> about it.
          </p>

          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => router.replace("/sign-in")}>
              Use a different account
            </button>
          </div>
        </GateCard>
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

        {email ? <HaveACode onIn={() => setAdmitted(true)} onSignIn={() => router.replace("/sign-in")} /> : null}
      </GateCard>
    </GateChrome>
  );
}
