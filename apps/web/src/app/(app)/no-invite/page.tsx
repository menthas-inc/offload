"use client";

// The screen for someone who signed in successfully and still cannot come in.
//
// Authentication worked. Authorization did not. That distinction is invisible
// to the person standing here, so the screen does not explain it. It says
// which address it looked at, offers the one useful next step, and gets out of
// the way.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "../../../components/Logo";
import styles from "../auth.module.css";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

type Status = "reading" | "ready" | "joined";

export default function NoInvitePage() {
  const [email, setEmail] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("reading");

  useEffect(() => {
    // Read once, and the server clears the cookie as it answers. A reload
    // after that shows the screen without the address rather than a stale one.
    fetch(`${API}/api/sign-in/attempt`, { credentials: "include" })
      .then((response) => (response.ok ? response.json() : { email: null }))
      .then((data: { email: string | null }) => setEmail(data.email))
      .catch(() => setEmail(null))
      .finally(() => setStatus("ready"));
  }, []);

  async function join() {
    if (!email) return;
    setStatus("joined");
    // Deliberately not awaited for its verdict. The endpoint answers the same
    // way for every address by design, so there is nothing to branch on and
    // showing a spinner would imply otherwise.
    void fetch(`${API}/v1/waitlist`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
  }

  return (
    <main className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.mark}>
          <Logo size={44} />
        </div>

        {status === "joined" ? (
          <>
            <h1 className={styles.claim}>You are on the list.</h1>
            <p className={styles.quiet}>
              We are letting people in weekly. You will get an email the moment it is your turn.
            </p>
          </>
        ) : (
          <>
            <h1 className={styles.claim}>offload is invite only right now.</h1>
            <p className={styles.quiet}>
              That account does not have an invite yet.
            </p>
            {email ? <p className={styles.address}>{email}</p> : null}

            <div className={styles.actions}>
              {email ? (
                <button type="button" className={styles.primary} onClick={() => void join()}>
                  Join the waitlist
                </button>
              ) : (
                <Link href="/#waitlist" className={styles.primary} style={{ display: "grid", placeItems: "center" }}>
                  Join the waitlist
                </Link>
              )}
              <Link href="/sign-in" className={styles.secondary} style={{ textAlign: "center" }}>
                Use a different account
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
