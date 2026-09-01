"use client";

// The gate. From ui_kits/web_app/WFirstRunGate.jsx: one 440px card on a sunken
// page.
//
// The copy is deliberately not the phones'. Web opens on "Sign in to offload",
// an instruction for someone who came here on purpose; the phones open on the
// claim, because an app icon is not a page someone chose. Both are faithful to
// their own kit, so do not sync one to the other on sight.
//
// Apple is the filled button and Google the outlined one. That is not only the
// App Store's prominence requirement, it is what stops the pair reading as an
// arbitrary choice between two identical things.

import { useState } from "react";
import { AppleMark, GateCard, GateChrome, GoogleMark } from "../../../components/GateChrome";
import { signIn, WEB_PROVIDER_ORDER, type Provider } from "../../../lib/auth-client";
import styles from "../auth.module.css";

const LABEL: Record<Provider, string> = {
  apple: "Continue with Apple",
  google: "Continue with Google",
};

export default function SignInPage() {
  const [pending, setPending] = useState<Provider | null>(null);
  const [refused, setRefused] = useState(false);

  async function go(provider: Provider) {
    setRefused(false);
    setPending(provider);
    const { error } = await signIn(provider);
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
        <p className={styles.sub}>Use the account your invite was sent to.</p>

        {refused ? (
          <p className={styles.refusal} role="alert">
            That did not go through. Nothing was sent, try again.
          </p>
        ) : null}

        <div className={`${styles.providers} ${refused ? styles.providersTight : ""}`}>
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
      </GateCard>
    </GateChrome>
  );
}
