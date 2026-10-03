"use client";

// Subscriptions (034, section 4.1). The companies no interface bills and no
// ledger meters: an owner types what each charges a month, once, and it
// stands until changed. Costs reads them as its fixed rows.
//
// Self-contained, and it saves itself: the amounts are one setting,
// `costs.fixed`, a map of company to millionths of a dollar. The save goes
// through the same route as the rest of Limits, with what this section showed
// as `expected`, so another owner's change is never overwritten unseen.

import { useState } from "react";
import { Failed, Field, Section, adminWrite, outOfBounds, useAdminRead, useSay } from "../../ui";
import styles from "../../admin.module.css";

const KEY = "costs.fixed";
const DOLLAR = 1_000_000;

/** The companies with nothing in the ledger, by the slug Costs lists them
 *  under (`apps/core-api/src/billing/vendors.ts`). */
const SUBSCRIPTIONS: ReadonlyArray<{ slug: string; name: string }> = [
  { slug: "voyage", name: "Voyage AI" },
  { slug: "google-maps", name: "Google Maps Platform" },
  { slug: "google-workspace", name: "Google Workspace" },
  { slug: "resend", name: "Resend" },
  { slug: "expo", name: "Expo" },
  { slug: "railway", name: "Railway" },
  { slug: "cloudflare", name: "Cloudflare" },
  { slug: "apple-developer", name: "Apple Developer" },
  { slug: "google-play", name: "Google Play" },
];

interface SettingRow {
  key: string;
  value: unknown;
  min: number | null;
  max: number | null;
}

type Amounts = Record<string, number>;

/** One spelling of a map, so key order never reads as a change. */
function spelled(map: Amounts): string {
  return JSON.stringify(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
}

export function FixedCosts() {
  const read = useAdminRead<{ settings: SettingRow[] }>("/settings");
  const { toast, say } = useSay();
  // What has been typed, against the read it was typed over. A newer read
  // drops it, which is how a save and a conflict both show what is there now.
  const [typed, setTyped] = useState<{ over: unknown; values: Record<string, string> }>({ over: null, values: {} });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const row = read.data?.settings.find((one) => one.key === KEY);
  const stored = (row?.value ?? {}) as Amounts;
  const min = (row?.min ?? 0) / DOLLAR;
  const max = (row?.max ?? 0) / DOLLAR;
  const values = typed.over === read.data ? typed.values : {};

  const known = new Set(SUBSCRIPTIONS.map((one) => one.slug));
  const fields = [...SUBSCRIPTIONS, ...Object.keys(stored).filter((slug) => !known.has(slug)).sort().map((slug) => ({ slug, name: slug }))];
  const shown = (slug: string): string => values[slug] ?? String((stored[slug] ?? 0) / DOLLAR);

  const invalid = fields.some((one) => outOfBounds(shown(one.slug), min, max));
  // Nothing is the absence of the company, not a zero in the map.
  const next: Amounts = {};
  for (const one of fields) {
    const micros = Math.round(Number(shown(one.slug)) * DOLLAR);
    if (micros > 0) next[one.slug] = micros;
  }
  const before: Amounts = Object.fromEntries(Object.entries(stored).filter(([, micros]) => micros > 0));
  const changed = !invalid && spelled(next) !== spelled(before);

  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const response = await adminWrite("/settings", "PATCH", { changes: { [KEY]: next }, expected: { [KEY]: stored } });
      if (response.ok) {
        say("Saved");
        read.reload();
      } else if (response.status === 409) {
        setProblem("Someone else changed this. These are the amounts now.");
        read.reload();
      } else {
        setProblem("Couldn't save.");
      }
    } catch {
      setProblem("Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <Section note="Dollars a month. Used from the month an amount is set in.">Subscriptions</Section>

      {read.state === "loading" && !read.data ? (
        <p className={styles.srOnly} role="status">
          Loading
        </p>
      ) : null}
      {read.state === "failed" ? <Failed what="subscriptions" onRetry={read.reload} /> : null}

      {row ? (
        <>
          <div className={styles.billingFields}>
            {fields.map((one) => (
              <Field
                key={one.slug}
                label={one.name}
                prefix="$"
                value={shown(one.slug)}
                min={min}
                max={max}
                onChange={(value) => {
                  setProblem(null);
                  setTyped({ over: read.data, values: { ...values, [one.slug]: value } });
                }}
              />
            ))}
          </div>
          <div className={styles.billingSave}>
            <button type="button" className={styles.primary} disabled={!changed || busy} onClick={save}>
              Save subscriptions
            </button>
            {problem ? (
              <p className={styles.billingLine} role="alert">
                {problem}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
      {toast}
    </section>
  );
}
