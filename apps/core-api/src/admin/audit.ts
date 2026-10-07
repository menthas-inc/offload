// What staff did, written in the same transaction as the write itself.
//
// Every write under `/v1/admin` records one entry (AC-52). An entry names
// accounts by id and never by address, and carries no free text: a kind from
// the closed set below, ids, and for a setting its key with the old and new
// values (OFF-1). The table refuses an update and a delete (0075), so this
// module only ever inserts.

import type { Executor } from "../threads/access.js";

/** Every kind of staff write. A route declares its own in `config.audit`,
 *  and the route-table test fails on a write route that declares none. */
export const AUDIT_KINDS = [
  "invited",
  "resent",
  "waitlist.removed",
  "disabled",
  "enabled",
  "deletion.scheduled",
  "deletion.cancelled",
  "deleted",
  "signed_out",
  "override.set",
  "override.cleared",
  "setting.changed",
  "job.retried",
  "job.dismissed",
  "staff.added",
  "staff.role_changed",
  "staff.removed",
  "person.viewed",
  "panel.opened",
  // 039. A review code made, and revoked. The code's id rides in the value.
  "code.created",
  "code.revoked",
  // A code let somebody in at sign-in, recorded against the staff member who
  // made it, on the account it let in.
  "code.redeemed",
  // Going-public 17c. Who has access, downloaded as a file, and the log
  // itself for a period, which rides in the value as `from/to` UTC days.
  "staff.exported",
  "audit.exported",
] as const;

export type AuditKind = (typeof AUDIT_KINDS)[number];

/** What an entry may hold as a value: a number, a switch, a role's name, or
 *  nothing. The one map is the fixed costs setting, vendor to amount, which
 *  the settings validation bounds in keys, entries and size. */
export type AuditValue = number | boolean | string | null | Record<string, number>;

export interface AuditEntry {
  staff: { accountId: string };
  kind: AuditKind;
  targetAccountId?: string | null;
  settingKey?: string | null;
  /** A setting's, an override's or a role's value before and after. Never
   *  content, and the type leaves no room for any. */
  old?: AuditValue;
  new?: AuditValue;
  jobId?: string | null;
}

/** Record one staff write. `tx` is the transaction the write itself is in, so
 *  the two land together or not at all.
 *
 *  A conflict is ignored, and only one can happen: a person's page opened is
 *  recorded once per staff member, person and day. */
export async function audit(tx: Executor, entry: AuditEntry): Promise<void> {
  await tx
    .insertInto("staff_audit")
    .values({
      staff_account_id: entry.staff.accountId,
      kind: entry.kind,
      target_account_id: entry.targetAccountId ?? null,
      setting_key: entry.settingKey ?? null,
      old_value: entry.old === undefined ? null : JSON.stringify(entry.old),
      new_value: entry.new === undefined ? null : JSON.stringify(entry.new),
      job_id: entry.jobId ?? null,
    })
    .onConflict((oc) => oc.doNothing())
    .execute();
}
