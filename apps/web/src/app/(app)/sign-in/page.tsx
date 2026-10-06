"use client";

// The gate. From ui_kits/web_app/WFirstRunGate.jsx: one 440px card on a sunken
// page.
//
// The copy is deliberately not the phones'. Web opens on "Sign in to offload",
// an instruction for someone who came here on purpose; the phones open on the
// claim, because an app icon is not a page someone chose. Both are faithful to
// their own kit, so do not sync one to the other on sight.
//
// Apple is the filled button and Google the outlined one, and Google is first:
// more people arrive with a Google account. The treatment is what stops the
// pair reading as an arbitrary choice between two identical things, and it is
// also the App Store's prominence requirement met without Apple being first.
//
// 039. *Have a code?* under the caption, for store reviewers: a line in the
// caption's accent that opens a field above the two providers. The code rides
// with whichever is picked. Not drawn once the switch is off.

import { useEffect, useState } from "react";
import { AppleMark, GateCard, GateChrome, GoogleMark } from "../../../components/GateChrome";
import { signIn, WEB_PROVIDER_ORDER, type Provider } from "../../../lib/auth-client";
import styles from "../auth.module.css";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

const LABEL: Record<Provider, string> = {
  apple: "Continue with Apple",
  google: "Continue with Google",
};

export default function SignInPage() {
  const [pending, setPending] = useState<Provider | null>(null);
  const [refused, setRefused] = useState(false);
  const [deleted, setDeleted] = useState(false);
  // Sent here by the admin panel, which opens only for a sign-in made a few
  // minutes ago. The one value read; anything else in its place is ignored.
  const [toAdmin, setToAdmin] = useState(false);
  // 039. Whether codes are on, and the one typed, if any.
  const [codes, setCodes] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  useEffect(() => {
    fetch(`${API}/api/sign-in/options`)
      .then((response) => (response.ok ? response.json() : { codes: false }))
      .then((data: { codes?: boolean }) => setCodes(data.codes === true))
      .catch(() => setCodes(false));
  }, []);
  useEffect(() => {
    // Better Auth bounces a failed callback back here with a code in the query
    // string. Showing the banner is the whole point of being bounced somewhere
    // real rather than to a 404 on the API.
    //
    // Read off location rather than through useSearchParams, which wanted a
    // Suspense boundary while this page was prerendered. Every page renders
    // per request now (src/middleware.ts); location is still the simpler read.
    const query = new URLSearchParams(window.location.search);
    if (query.has("error")) setRefused(true);
    // 035. Arriving from a deleted account. Said once, plainly, where the
    // invite line would be, and not as a failure: nothing went wrong.
    if (query.has("deleted")) setDeleted(true);
    if (query.get("to") === "admin") setToAdmin(true);
    // 039. Back from "Try another code": the field is already open.
    if (query.get("code") === "1") setCodeOpen(true);
  }, []);

  async function go(provider: Provider) {
    setRefused(false);
    setPending(provider);
    const { error } = await signIn(provider, toAdmin ? "admin" : null, codes ? code : "");
    // On success the browser has already left for the provider, so reaching
    // here at all means it did not.
    if (error) {
      setPending(null);
      setRefused(true);
    }
  }

  return (
    <GateChrome>
      <GateCard>
        <h1 className={styles.title}>Sign in to offload</h1>
        {deleted ? (
          <p className={styles.sub} role="status">
            Your account is deleted.
          </p>
        ) : toAdmin ? (
          <p className={styles.sub}>Sign in again to open the admin panel.</p>
        ) : (
          <p className={styles.sub}>Use the account your invite was sent to.</p>
        )}

        {refused ? (
          <p className={styles.refusal} role="alert">
            That did not go through. Nothing was sent, try again.
          </p>
        ) : null}

        <div className={`${styles.providers} ${refused ? styles.providersTight : ""}`}>
          {codes && codeOpen ? (
            <input
              className={styles.codeField}
              aria-label="Code"
              placeholder="Your code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={40}
              autoFocus
            />
          ) : null}
          {WEB_PROVIDER_ORDER.map((provider) => (
            <button
              key={provider}
              type="button"
              className={`${styles.provider} ${provider === "apple" ? styles.providerDark : styles.providerLight}`}
              onClick={() => void go(provider)}
              disabled={pending !== null}
            >
              {provider === "apple" ? <AppleMark /> : <GoogleMark />}
              {pending === provider ? "Taking you there…" : LABEL[provider]}
            </button>
          ))}
        </div>

        <p className={styles.caption}>
          offload is invite only.{" "}
          <a href="/#waitlist" className={styles.captionLink}>
            Join the waitlist
          </a>
        </p>

        {codes && !codeOpen ? (
          <p className={`${styles.caption} ${styles.codeLine}`}>
            <button type="button" className={styles.codeLink} onClick={() => setCodeOpen(true)}>
              Have a code?
            </button>
          </p>
        ) : null}
      </GateCard>
    </GateChrome>
  );
}
