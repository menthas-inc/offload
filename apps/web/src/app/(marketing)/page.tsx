"use client";

import { useState } from "react";
import { Logo } from "@/components/Logo";
import styles from "./page.module.css";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

type State = "idle" | "sending" | "sent";

export default function Landing() {
  const [state, setState] = useState<State>("idle");
  const [email, setEmail] = useState("");
  // A honeypot. Real people never see it; scripts fill everything.
  const [company, setCompany] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state === "sending") return;
    setState("sending");

    try {
      await fetch(`${API}/v1/waitlist`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, company }),
      });
    } catch {
      // Deliberately swallowed. The server answers identically whatever
      // happens, so surfacing a network error here would be the one thing on
      // this page that tells someone which branch ran.
    }

    setState("sent");
  }

  return (
    <>
      <header className={styles.header}>
        <div className={styles.wrap}>
          <div className={styles.bar}>
            <Logo />
            <a className={styles.signin} href="/sign-in">
              Sign in
            </a>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.wrap}>
          <div className={styles.hero}>
            <h1 className={styles.title}>Offload what you would otherwise forget.</h1>
            <p className={styles.sub}>
              Dump half a thought, a photo, a voice note. offload sorts it into things and speaks up
              when one of them needs you.
            </p>

            {state === "sent" ? (
              <p className={styles.done} role="status">
                You are on the list. We will email you when your account is ready to use.
              </p>
            ) : (
              <>
                <form className={styles.form} onSubmit={submit} noValidate>
                  <label htmlFor="email" className="sr-only" style={{ position: "absolute", left: -9999 }}>
                    Email address
                  </label>
                  <input
                    id="email"
                    className={styles.input}
                    type="email"
                    name="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <input
                    type="text"
                    name="company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
                  />
                  <button className={styles.button} type="submit" disabled={state === "sending"}>
                    Join the waitlist
                  </button>
                </form>
                <p className={styles.note}>Invite only. We are letting people in weekly.</p>
              </>
            )}
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <div className={styles.wrap}>
          <div className={styles.frow}>
            <span>offload</span>
            <span>
              hello@offload.club <span aria-hidden="true">·</span>{" "}
              <a href="/privacy">Privacy</a>
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}
