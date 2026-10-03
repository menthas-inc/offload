"use client";

// Staff. Who can open this panel, from the kit's `StaffPage`.
//
// 034, section F. The kit's table, roles table and rules, with what 034
// changed: any address with an active account that signs in one way, nothing
// emailed on adding, access that ends on the next request, and roles that are
// no longer only about money. An action the server would refuse is not drawn:
// your own role is one fixed pill and your own row offers no Remove.

import { useCallback, useRef, useState } from "react";
import { Icon } from "../../../../components/Icon";
import styles from "../../admin.module.css";
import { Confirm, Failed, Field, Lines, Loading, Notes, PaneHead, Row, Section, Table, adminWrite, count, day, moment, useAdminRead, useSay, type Col } from "../../ui";

type Role = "owner" | "support";

interface Member {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  added: string;
  /** Their newest audit entry. Null when they have written nothing. */
  lastHere: string | null;
  you: boolean;
}

interface StaffList {
  staff: Member[];
  owners: number;
}

const ROLE_LABEL: Record<Role, string> = { owner: "Owner", support: "Support" };

const COLS: Col[] = [{ label: "Person" }, { label: "Role", w: 170 }, { label: "Added", w: 80 }, { label: "Last here", w: 120, right: true }, { label: "", w: 170, right: true }];
const ROLE_COLS: Col[] = [{ label: "Role", w: 120 }, { label: "Can" }];

/** What each role sees, as the panel's own rules have it. */
const ROLES: ReadonlyArray<{ role: Role; can: string }> = [
  { role: "owner", can: "Everything support can, and also Health, Costs, Limits, Staff and Audit" },
  { role: "support", can: "Waitlist, People and a person's page. Does not see the owner pages" },
];

const RULES = [
  "Anyone with an active offload account that signs in one way, Apple or Google, can be added. An account with both linked is refused, so use one that has one. Adding someone creates no password and sends no email.",
  "There is always at least one owner. The last one cannot be demoted or removed.",
  "Nobody changes or removes their own role: yours is fixed here and Remove is not offered. Ask another owner.",
  "Removing someone ends their access on their next request. Their own offload account is untouched.",
  "Support does not see the owner pages at all: Health, Costs, Limits, Staff and Audit are not in their nav, and are not shown and then refused.",
] as const;

/** Why adding was refused, one plain line each. */
const REFUSED: Record<string, string> = {
  no_account: "No active account has that address.",
  two_sign_ins: "That account signs in two ways. Use one that signs in one way.",
  already_staff: "They are already staff.",
};

/** Enough to stop a slip of the hand. The server decides what an address is. */
const LOOKS_LIKE_AN_ADDRESS = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

const called = (member: Member) => member.name ?? member.email;
const first = (member: Member) => (member.name ? member.name.split(" ")[0]! : member.email);

async function codeOf(response: Response | null): Promise<string | null> {
  if (!response) return null;
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : null;
}

/** Two pills, the one in force pressed. */
function RolePills({ value, onPick, disabled, label }: { value: Role; onPick: (role: Role) => void; disabled?: boolean; label: string }) {
  return (
    <span className={styles.rolePills} role="group" aria-label={label}>
      {(["owner", "support"] as const).map((role) => (
        <button
          key={role}
          type="button"
          className={styles.rolePill}
          aria-pressed={role === value}
          disabled={disabled}
          onClick={() => (role === value ? undefined : onPick(role))}
        >
          {ROLE_LABEL[role]}
        </button>
      ))}
    </span>
  );
}

export default function StaffPage() {
  const list = useAdminRead<StaffList>("/staff");
  const { toast, say } = useSay();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("support");
  const [problem, setProblem] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  // The dialog closes itself when its button is pressed. Adding has an answer
  // to wait for, and a refusal belongs on the dialog, so the close that comes
  // with the press is the one close this ignores.
  const sending = useRef(false);

  const closeAdd = useCallback(() => {
    if (sending.current) return;
    setAdding(false);
    setEmail("");
    setRole("support");
    setProblem(null);
  }, []);

  async function add() {
    sending.current = true;
    setBusy(true);
    setProblem(null);
    const response = await adminWrite("/staff", "POST", { email: email.trim(), role }).catch(() => null);
    sending.current = false;
    setBusy(false);

    if (response?.ok) {
      closeAdd();
      say("Added to staff");
      list.reload();
      return;
    }
    const code = await codeOf(response);
    setProblem(
      (response?.status === 409 && code ? REFUSED[code] : undefined) ??
        (response?.status === 400 ? "That address was refused. Nobody was added." : "That did not go through. Nobody was added.")
    );
  }

  async function switchRole(member: Member, next: Role) {
    setBusy(true);
    const response = await adminWrite(`/staff/${member.id}`, "PATCH", { role: next }).catch(() => null);
    setBusy(false);

    if (response?.ok) {
      say(`${first(member)} is now ${next}`);
      list.reload();
      return;
    }
    const code = await codeOf(response);
    say(code === "last_owner" ? "There has to be an owner. The role is unchanged." : "That did not go through. The role is unchanged.");
    list.reload();
  }

  async function remove(member: Member) {
    setBusy(true);
    const response = await adminWrite(`/staff/${member.id}`, "DELETE").catch(() => null);
    setBusy(false);

    if (response?.ok) {
      say(`${first(member)} no longer has access`);
      list.reload();
      return;
    }
    const code = await codeOf(response);
    say(code === "last_owner" ? "There has to be an owner. Nobody was removed." : "That did not go through. Nobody was removed.");
    list.reload();
  }

  const data = list.data;

  return (
    <>
      <PaneHead
        title="Staff"
        sub={
          data
            ? `${count(data.staff.length)} ${data.staff.length === 1 ? "person" : "people"} can open this panel · ${count(data.owners)} ${data.owners === 1 ? "owner" : "owners"}`
            : undefined
        }
        tools={
          <button type="button" className={`${styles.smallPrimary} ${styles.withIcon}`} onClick={() => setAdding(true)} disabled={busy}>
            <Icon name="plus" size={15} />
            Add someone
          </button>
        }
      />

      {!data && list.state === "failed" ? (
        <Failed what="staff" onRetry={list.reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <Table cols={COLS}>
            {data.staff.map((member, index) => (
              <Row
                key={member.id}
                cols={COLS}
                last={index === data.staff.length - 1}
                cells={[
                  <Lines
                    key="who"
                    main={
                      <>
                        {called(member)}
                        {member.you ? <span className={styles.quiet}> · you</span> : null}
                      </>
                    }
                    sub={member.name ? member.email : undefined}
                  />,
                  member.you ? (
                    <span key="role" className={styles.rolePills}>
                      <span className={`${styles.rolePill} ${styles.rolePillFixed}`}>{ROLE_LABEL[member.role]}</span>
                      <span className={styles.aside}>fixed</span>
                    </span>
                  ) : (
                    <RolePills key="role" value={member.role} disabled={busy} label={`Role for ${called(member)}`} onPick={(next) => void switchRole(member, next)} />
                  ),
                  <span key="added" className={styles.quiet}>
                    {day(member.added)}
                  </span>,
                  <span key="last" className={styles.quiet}>
                    {member.lastHere ? moment(member.lastHere) : "never"}
                  </span>,
                  member.you ? (
                    <span key="act" className={styles.aside}>
                      you cannot remove yourself
                    </span>
                  ) : (
                    <button key="act" type="button" className={styles.danger} onClick={() => setRemoving(member)} disabled={busy}>
                      Remove
                    </button>
                  ),
                ]}
              />
            ))}
          </Table>

          <Section>What the two roles can do</Section>
          <Table cols={ROLE_COLS}>
            {ROLES.map((one, index) => (
              <Row
                key={one.role}
                cols={ROLE_COLS}
                last={index === ROLES.length - 1}
                cells={[
                  <b key="role" className={styles.email}>
                    {ROLE_LABEL[one.role]}
                  </b>,
                  <span key="can" className={styles.quiet}>
                    {one.can}
                  </span>,
                ]}
              />
            ))}
          </Table>

          <Section>Rules</Section>
          <Notes items={RULES} />
        </>
      )}

      {adding ? (
        <Confirm
          title="Add someone to staff"
          body="They sign in with Apple or Google on this address. Nothing is emailed, so tell them yourself."
          confirmLabel="Add to staff"
          ready={LOOKS_LIKE_AN_ADDRESS.test(email.trim())}
          busy={busy}
          onConfirm={() => void add()}
          onClose={closeAdd}
        >
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={(next) => {
              setEmail(next);
              setProblem(null);
            }}
            error={problem}
            width="100%"
          />
          <div className={styles.dialogForm}>
            <span className={styles.field}>
              <span className={styles.fieldLabel}>Role</span>
              <RolePills value={role} onPick={setRole} disabled={busy} label="Role" />
            </span>
          </div>
        </Confirm>
      ) : null}

      {removing ? (
        <Confirm
          danger
          title={`Remove ${called(removing)}?`}
          body="They lose this panel on their next request. Their own offload account is untouched, and nothing they did here is undone."
          confirmLabel="Remove"
          onConfirm={() => void remove(removing)}
          onClose={() => setRemoving(null)}
        />
      ) : null}

      {toast}
    </>
  );
}
