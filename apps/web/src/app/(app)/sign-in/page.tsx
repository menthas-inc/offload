"use client";

// The gate. Two buttons and one line of copy, because there is no third way in
// and nothing here to configure.
//
// Apple is listed above Google on web. On iOS that ordering is an App Store
// requirement, and matching it everywhere means the screen a person sees on
// their phone is the screen they see on their laptop.

import { useState } from "react";
import { Logo } from "../../../components/Logo";
import { signIn, WEB_PROVIDER_ORDER, type Provider } from "../../../lib/auth-client";
import styles from "../auth.module.css";

const LABEL: Record<Provider, string> = {
  apple: "Continue with Apple",
  google: "Continue with Google",
};

export default function SignInPage() {
  const [pending, setPending] = useState<Provider | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function go(provider: Provider) {
    setRefusal(null);
    setPending(provider);
    const { error } = await signIn(provider);
    // On success the browser has already left for the provider, so reaching
    // here at all means it did not.
    if (error) {
      setPending(null);
      setRefusal("That did not go through. Try again.");
    }
  }

  return (
    <main className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.mark}>
          <Logo size={44} />
        </div>

        <h1 className={styles.claim}>Offload what you would otherwise forget.</h1>
        <p className={styles.quiet}>
          Invite only for now. Sign in with the address your invite went to.
        </p>

        <div className={styles.actions}>
          {refusal ? (
            <p className={styles.refusal} role="alert">
              {refusal}
            </p>
          ) : null}

          {WEB_PROVIDER_ORDER.map((provider) => (
            <button
              key={provider}
              type="button"
              className={styles.provider}
              onClick={() => void go(provider)}
              disabled={pending !== null}
            >
              {pending === provider ? "Taking you there…" : LABEL[provider]}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
