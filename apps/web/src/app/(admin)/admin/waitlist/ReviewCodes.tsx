"use client";

// 039. Review codes, a section of the Waitlist page.
//
// A code lets in whoever just signed in and was refused, as an invite would,
// for a store reviewer nobody can name in advance. No kit draws it, so it is
// the page's own pieces: a section title, a small button, the dialog invite by
// address uses (three fields here), the table, and the toast.
//
// The code is in the answer to the write and nowhere else: the server keeps a
// hash. So it is shown once, here, beside Copy, until Done.

import { useState } from "react";
import styles from "../../admin.module.css";
import {
  Confirm,
  Empty,
  Failed,
  Field,
  Row as TableRow,
  Section,
  StatusPill,
  Table,
  adminWrite,
  count,
  day,
  outOfBounds,
  useAdminRead,
  useSay,
  type Col,
} from "../../ui";

interface Code {
  id: string;
  note: string;
  uses: number;
  maxUses: number;
  expiresAt: string;
  state: "live" | "expired" | "used" | "revoked";
}

const COLS: Col[] = [{ label: "Note" }, { label: "Used", w: 90 }, { label: "Expires", w: 100 }, { label: "State", w: 100 }, { label: "", w: 96, right: true }];

const STATE_LABEL: Record<Code["state"], string> = { live: "live", expired: "expired", used: "used up", revoked: "revoked" };

const DEFAULTS = { uses: "5", days: "30" } as const;

export function ReviewCodes() {
  const codes = useAdminRead<{ rows: Code[] }>("/codes");
  const { toast, say } = useSay();
  const [making, setMaking] = useState(false);
  const [note, setNote] = useState("");
  const [uses, setUses] = useState<string>(DEFAULTS.uses);
  const [days, setDays] = useState<string>(DEFAULTS.days);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<Code | null>(null);

  const ready = note.trim().length > 0 && note.trim().length <= 80 && !outOfBounds(uses, 1, 50) && !outOfBounds(days, 1, 90);

  async function make() {
    setBusy(true);
    const response = await adminWrite("/codes", "POST", { note: note.trim(), maxUses: Number(uses), days: Number(days) }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      say("That did not go through. No code was made");
      return;
    }
    const body = (await response.json()) as { code: string };
    setMade(body.code);
    setNote("");
    setUses(DEFAULTS.uses);
    setDays(DEFAULTS.days);
    codes.reload();
  }

  async function revoke(code: Code) {
    const response = await adminWrite(`/codes/${code.id}/revoke`, "POST").catch(() => null);
    if (!response?.ok) {
      say("That did not go through");
      return;
    }
    say("Code revoked");
    codes.reload();
  }

  function copy(code: string) {
    void navigator.clipboard
      ?.writeText(code)
      .then(() => say("Copied"))
      .catch(() => say("That did not go through"));
  }

  const rows = codes.data?.rows ?? [];

  return (
    <>
      <Section note="for the store reviews">Review codes</Section>
      <div className={styles.codesTools}>
        <button type="button" className={styles.small} onClick={() => setMaking(true)} disabled={busy}>
          New code
        </button>
      </div>

      {made ? (
        <div className={styles.codeShown}>
          <b className={styles.codeValue}>{made}</b>
          <span className={styles.quiet}>Shown once. Paste it into the review notes.</span>
          <span className={styles.rowActions}>
            <button type="button" className={styles.small} onClick={() => copy(made)}>
              Copy
            </button>
            <button type="button" className={styles.ghost} onClick={() => setMade(null)}>
              Done
            </button>
          </span>
        </div>
      ) : null}

      {making ? (
        <Confirm
          title="New review code"
          body="Each use lets in the account that just signed in and was refused, as an invite would. The code is shown once."
          confirmLabel="Make code"
          ready={ready}
          busy={busy}
          onConfirm={() => void make()}
          onClose={() => setMaking(false)}
        >
          <Field label="Note" value={note} onChange={setNote} width="100%" hint="Such as App Store review 1.0" />
          <Field label="Uses" value={uses} onChange={setUses} min={1} max={50} />
          <Field label="Days" value={days} onChange={setDays} min={1} max={90} />
        </Confirm>
      ) : null}

      {revoking ? (
        <Confirm
          danger
          title={`Revoke ${revoking.note}?`}
          body="Nobody else gets in with it. Accounts it already let in stay."
          confirmLabel="Revoke"
          onConfirm={() => void revoke(revoking)}
          onClose={() => setRevoking(null)}
        />
      ) : null}

      {codes.state === "failed" && !codes.data ? (
        <Failed what="the review codes" onRetry={codes.reload} />
      ) : codes.data && rows.length === 0 ? (
        <Empty>No codes yet.</Empty>
      ) : rows.length > 0 ? (
        <Table cols={COLS}>
          {rows.map((code, index) => (
            <TableRow
              key={code.id}
              cols={COLS}
              last={index === rows.length - 1}
              muted={code.state !== "live"}
              cells={[
                <span key="note">{code.note}</span>,
                <span key="used" className={styles.quiet}>
                  {`${count(code.uses)} of ${count(code.maxUses)}`}
                </span>,
                <span key="expires" className={styles.quiet}>
                  {day(code.expiresAt)}
                </span>,
                <StatusPill key="state" value={code.state} label={STATE_LABEL[code.state]} />,
                code.state === "live" ? (
                  <button key="revoke" type="button" className={styles.danger} onClick={() => setRevoking(code)}>
                    Revoke
                  </button>
                ) : (
                  <span key="revoke" />
                ),
              ]}
            />
          ))}
        </Table>
      ) : null}

      {toast}
    </>
  );
}
