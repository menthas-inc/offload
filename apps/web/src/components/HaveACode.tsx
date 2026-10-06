"use client";

// 039. A review code, on the no-invite screen.
//
// Shut, it is one line in the caption's voice with the caption's accent. Open,
// it is a field at the buttons' height and the card's secondary button, so the
// card keeps one primary. A refusal is the kit's refusal line, one clause, and
// the control beside it is the way forward: the field and Use code for a code
// that did not work, Sign in for a refusal that has run out.
//
// The proof of who is asking is the refusal's own cookie, sent with
// `credentials: "include"`. Nothing here names an address.

import { useState, type FormEvent } from "react";
import styles from "../app/(app)/auth.module.css";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

type Answer = "in" | "refused" | "sign-in";
/** The request itself did not complete. Not an answer about the code. */
type Shown = Exclude<Answer, "in"> | "failed";

export function HaveACode({ onIn, onSignIn }: { onIn: () => void; onSignIn: () => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Shown | null>(null);

  async function use(event: FormEvent) {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    const response = await fetch(`${API}/api/sign-in/code`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    }).catch(() => null);
    const status: Answer | "failed" = response?.ok ? ((await response.json()) as { status: Answer }).status : "failed";
    setBusy(false);
    if (status === "in") onIn();
    else setAnswer(status);
  }

  if (!open) {
    return (
      <p className={`${styles.caption} ${styles.codeLine}`}>
        <button type="button" className={styles.codeLink} onClick={() => setOpen(true)}>
          Have a code?
        </button>
      </p>
    );
  }

  return (
    <form className={styles.codeForm} onSubmit={(event) => void use(event)}>
      {answer === "refused" ? (
        <p className={styles.refusal} role="alert">
          That code did not work.
        </p>
      ) : answer === "sign-in" ? (
        <p className={styles.refusal} role="alert">
          Sign in again to use a code.
        </p>
      ) : answer === "failed" ? (
        <p className={styles.refusal} role="alert">
          That did not go through, try again.
        </p>
      ) : null}

      {answer === "sign-in" ? (
        <button type="button" className={styles.secondary} onClick={onSignIn}>
          Sign in
        </button>
      ) : (
        <>
          <input
            className={styles.codeField}
            aria-label="Code"
            placeholder="Your code"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              if (answer) setAnswer(null);
            }}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={40}
            autoFocus
          />
          <button type="submit" className={styles.secondary} disabled={busy || !code.trim()}>
            Use code
          </button>
        </>
      )}
    </form>
  );
}
