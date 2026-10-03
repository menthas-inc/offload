// Settings the owner changes while offload runs, stored in `app_settings`
// (0073) and read through a short cache, so a read on every dump costs nothing
// and a change lands within seconds on every instance.
//
// 034 made this a registry: one table of every key, its kind, its default and
// its bounds. The registry is the closed set. A key it does not name is never
// read and never saved, and **a stored value it cannot make sense of reads as
// the default**, so a cap can never quietly stop existing because a row was
// edited by hand or written by an older build.

import { sql, type Transaction } from "kysely";
import { db } from "./db.js";
import type { Database } from "./schema.js";
import { mapsConfig } from "./places/resolve.js";
import { DAILY_MODEL_BUDGET_MICROS, DAILY_TURNS } from "./budget.js";
import { DAILY_BYTES, DAILY_PHOTOS } from "./blobs/photos.js";
import { DAILY_VOICE_MS, DAILY_VOICE_NOTES } from "./blobs/audio.js";
import { DAILY_MAIL, HOURLY_MAIL } from "./mail-in/caps.js";
import { audit } from "./admin/audit.js";

/** How long a read is trusted. Another instance sees a change within this
 *  long; the instance that saved clears its own at once. */
const CACHE_MS = 15_000;

/** How many people "Invite the next N" lets in, until Limits says otherwise. */
export const WEEKLY_BATCH = 25;

/** What each key reads as. `null` is off, and only where off is a value. */
interface SettingTypes {
  "cap.spend_micros": number;
  "cap.turns": number;
  "cap.photos": number;
  "cap.photo_bytes": number;
  "cap.voice_notes": number;
  "cap.voice_ms": number;
  "cap.mail_day": number;
  "cap.mail_hour": number;
  "platform.spend_micros": number | null;
  "budget.month_micros": number | null;
  "waitlist.batch": number;
  "switch.web_maps": boolean;
  "switch.maps": boolean;
  "switch.web_search": boolean;
  "switch.web_links": boolean;
  "switch.nightly": boolean;
  "costs.fixed": Record<string, number>;
}

export type SettingKey = keyof SettingTypes;
export type SettingValue = number | boolean | null | Record<string, number>;

/** The per-person caps: the keys an account can carry its own value for. */
export type CapKey = Extract<SettingKey, `cap.${string}`>;

export type SettingKind = "int" | "micros" | "bool" | "money-map";

export interface SettingDef {
  key: SettingKey;
  kind: SettingKind;
  default: SettingValue;
  /** Bounds for a number, and for each amount in a map. Inclusive. */
  min?: number;
  max?: number;
  /** Whether null is a value, meaning off. */
  nullable?: boolean;
  /** The key the row is stored under, where it differs. */
  stored?: string;
}

const DOLLAR = 1_000_000;

/** Built on first use, not at import: the defaults are the constants the caps
 *  were before 034, and `budget.ts` imports this module back. */
let registry: Map<SettingKey, SettingDef> | null = null;

function defs(): Map<SettingKey, SettingDef> {
  if (registry) return registry;
  const count = { min: 1, max: 10_000 };
  const list: SettingDef[] = [
    { key: "cap.spend_micros", kind: "micros", default: DAILY_MODEL_BUDGET_MICROS, min: DOLLAR / 10, max: 1_000 * DOLLAR },
    { key: "cap.turns", kind: "int", default: DAILY_TURNS, ...count },
    { key: "cap.photos", kind: "int", default: DAILY_PHOTOS, ...count },
    { key: "cap.photo_bytes", kind: "int", default: DAILY_BYTES, min: 1024 * 1024, max: 50 * 1024 * 1024 * 1024 },
    { key: "cap.voice_notes", kind: "int", default: DAILY_VOICE_NOTES, ...count },
    { key: "cap.voice_ms", kind: "int", default: DAILY_VOICE_MS, min: 60_000, max: 24 * 60 * 60 * 1000 },
    { key: "cap.mail_day", kind: "int", default: DAILY_MAIL, ...count },
    { key: "cap.mail_hour", kind: "int", default: HOURLY_MAIL, ...count },
    // Off until an owner sets it, and off is not zero.
    { key: "platform.spend_micros", kind: "micros", default: null, nullable: true, min: DOLLAR, max: 100_000 * DOLLAR },
    // A figure Costs measures the month against. Nothing enforces it.
    { key: "budget.month_micros", kind: "micros", default: null, nullable: true, min: DOLLAR, max: 1_000_000 * DOLLAR },
    { key: "waitlist.batch", kind: "int", default: WEEKLY_BATCH, min: 1, max: 100 },
    // 0073 stored this one as `web_maps`, and the row is read where it is.
    { key: "switch.web_maps", kind: "bool", default: true, stored: "web_maps" },
    { key: "switch.maps", kind: "bool", default: true },
    { key: "switch.web_search", kind: "bool", default: true },
    { key: "switch.web_links", kind: "bool", default: true },
    { key: "switch.nightly", kind: "bool", default: true },
    // Vendor to a monthly amount, for the subscriptions no interface bills.
    { key: "costs.fixed", kind: "money-map", default: {}, min: 0, max: 100_000 * DOLLAR },
  ];
  registry = new Map(list.map((def) => [def.key, def]));
  return registry;
}

export const SETTING_KEYS: readonly SettingKey[] = [
  "cap.spend_micros",
  "cap.turns",
  "cap.photos",
  "cap.photo_bytes",
  "cap.voice_notes",
  "cap.voice_ms",
  "cap.mail_day",
  "cap.mail_hour",
  "platform.spend_micros",
  "budget.month_micros",
  "waitlist.batch",
  "switch.web_maps",
  "switch.maps",
  "switch.web_search",
  "switch.web_links",
  "switch.nightly",
  "costs.fixed",
];

export function isSettingKey(key: string): key is SettingKey {
  return defs().has(key as SettingKey);
}

export function settingDef(key: SettingKey): SettingDef {
  return defs().get(key)!;
}

/** A company's slug in the fixed-cost map. */
const VENDOR = /^[a-z0-9-]{1,40}$/;

/** How many entries a money map may hold. A page of fixed costs, not a table. */
const MONEY_MAP_ENTRIES = 50;

function wholeWithin(def: SettingDef, raw: unknown): raw is number {
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= def.min! && raw <= def.max!;
}

/** Whether `raw` is a value this setting may hold. The one rule, used by the
 *  read (anything else is the default) and by the save (anything else is
 *  refused). */
export function validSetting(def: SettingDef, raw: unknown): raw is SettingValue {
  if (raw === null || raw === undefined) return raw === null && def.nullable === true;
  if (def.kind === "bool") return typeof raw === "boolean";
  if (def.kind === "money-map") {
    if (typeof raw !== "object" || Array.isArray(raw)) return false;
    const entries = Object.entries(raw as Record<string, unknown>);
    return entries.length <= MONEY_MAP_ENTRIES && entries.every(([vendor, amount]) => VENDOR.test(vendor) && wholeWithin(def, amount));
  }
  return wholeWithin(def, raw);
}

interface Stored {
  value: unknown;
  updatedAt: Date;
}

let cached: { rows: Map<string, Stored>; at: number } | null = null;
const overrides = new Map<string, { values: Map<string, number>; at: number }>();

/** Forget what was read. Called after a save, and by tests. */
export function clearSettingsCache(): void {
  cached = null;
  overrides.clear();
}

/** Forget one account's own values, and nothing else. Called after an
 *  override is set or cleared, so this instance's next check reads it. */
export function clearOverrides(accountId: string): void {
  overrides.delete(accountId);
}

async function stored(): Promise<Map<string, Stored>> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.rows;
  const rows = await db.selectFrom("app_settings").select(["key", "value", "updated_at"]).execute();
  const fresh = new Map(rows.map((row) => [row.key, { value: row.value, updatedAt: row.updated_at }]));
  cached = { rows: fresh, at: Date.now() };
  return fresh;
}

function read(def: SettingDef, rows: Map<string, Stored>): { value: SettingValue; malformed: boolean; updatedAt: Date | null } {
  const row = rows.get(def.stored ?? def.key);
  if (!row) return { value: def.default, malformed: false, updatedAt: null };
  return validSetting(def, row.value)
    ? { value: row.value, malformed: false, updatedAt: row.updatedAt }
    : { value: def.default, malformed: true, updatedAt: row.updatedAt };
}

/** One setting, as it stands: the stored value when it is one the registry
 *  allows, the default otherwise. */
export async function setting<K extends SettingKey>(key: K): Promise<SettingTypes[K]> {
  return read(settingDef(key), await stored()).value as SettingTypes[K];
}

/** A per-person cap for one account: their own value when an owner set one
 *  inside the setting's bounds, else the global setting. */
export async function limitFor(accountId: string, key: CapKey): Promise<number> {
  let own = overrides.get(accountId);
  if (!own || Date.now() - own.at >= CACHE_MS) {
    const rows = await db.selectFrom("account_limits").select(["key", "value"]).where("account_id", "=", accountId).execute();
    // Bounded without bookkeeping: past a few thousand accounts, start over.
    if (overrides.size > 5_000) overrides.clear();
    own = { values: new Map(rows.map((row) => [row.key, Number(row.value)])), at: Date.now() };
    overrides.set(accountId, own);
  }
  const value = own.values.get(key);
  return value !== undefined && wholeWithin(settingDef(key), value) ? value : setting(key);
}

export interface SettingRow {
  key: SettingKey;
  kind: SettingKind;
  value: SettingValue;
  default: SettingValue;
  min: number | null;
  max: number | null;
  nullable: boolean;
  /** The stored row made no sense and the default is what is in force. */
  malformed: boolean;
  updatedAt: string | null;
}

/** Every setting with its bounds, for the Limits page. */
export async function listSettings(): Promise<SettingRow[]> {
  const rows = await stored();
  return SETTING_KEYS.map((key) => {
    const def = settingDef(key);
    const now = read(def, rows);
    return {
      key,
      kind: def.kind,
      value: now.value,
      default: def.default,
      min: def.min ?? null,
      max: def.max ?? null,
      nullable: def.nullable === true,
      malformed: now.malformed,
      updatedAt: now.updatedAt?.toISOString() ?? null,
    };
  });
}

/** Why a save was refused. Nothing was written. */
export class SettingsRefused extends Error {
  constructor(
    readonly code: "unknown_key" | "out_of_bounds" | "conflict",
    readonly key: string,
    readonly min: number | null = null,
    readonly max: number | null = null,
  ) {
    super(code);
  }
}

/** A value in one spelling, so two maps with their keys in another order
 *  compare equal. */
function canonical(value: unknown): string {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
  }
  return JSON.stringify(value ?? null);
}

/** One arbitrary constant: saves are serialised, so two owners saving at once
 *  cannot both pass the comparison below. A row lock would not do it, since a
 *  setting nobody has saved yet has no row. */
const SAVE_LOCK = 4700_0034;

/** Save the Limits page: every change or none.
 *
 *  `expected` is what the page showed for each key it is changing. A key whose
 *  value has moved since is a conflict and nothing is written, so one owner
 *  never overwrites another's change without seeing it. One audit entry per
 *  setting that actually changed, in the caller's transaction.
 *
 *  The caller clears the cache once its transaction has committed. */
export async function saveSettings(
  changes: Record<string, unknown>,
  expected: Record<string, unknown>,
  staff: { accountId: string },
  tx: Transaction<Database>,
): Promise<{ changed: SettingKey[] }> {
  for (const [key, value] of Object.entries(changes)) {
    if (!isSettingKey(key)) throw new SettingsRefused("unknown_key", key);
    const def = settingDef(key);
    if (!validSetting(def, value)) throw new SettingsRefused("out_of_bounds", key, def.min ?? null, def.max ?? null);
  }

  await sql`select pg_advisory_xact_lock(${SAVE_LOCK})`.execute(tx);
  const rows = await tx.selectFrom("app_settings").select(["key", "value", "updated_at"]).execute();
  const now = new Map(rows.map((row) => [row.key, { value: row.value, updatedAt: row.updated_at }]));

  const keys = Object.keys(changes) as SettingKey[];
  const current = new Map(keys.map((key) => [key, read(settingDef(key), now).value]));
  for (const key of keys) {
    if (!(key in expected) || canonical(expected[key]) !== canonical(current.get(key))) {
      throw new SettingsRefused("conflict", key);
    }
  }

  const changed: SettingKey[] = [];
  for (const key of keys) {
    const before = current.get(key)!;
    const after = changes[key] as SettingValue;
    if (canonical(before) === canonical(after)) continue;
    const value = JSON.stringify(after);
    await tx
      .insertInto("app_settings")
      .values({ key: settingDef(key).stored ?? key, value, updated_by_account_id: staff.accountId })
      .onConflict((oc) => oc.column("key").doUpdateSet({ value, updated_at: sql`now()`, updated_by_account_id: staff.accountId }))
      .execute();
    await audit(tx, { staff, kind: "setting.changed", settingKey: key, old: before, new: after });
    changed.push(key);
  }
  return { changed };
}

/** Whether the map is on: configured in the environment, and not switched off
 *  by an owner. */
export async function mapsOn(): Promise<boolean> {
  return mapsConfig().on && (await setting("switch.maps"));
}

/** The web's map is drawn only while the map itself is on and the owner has
 *  not turned the web's off. */
export async function webMapsOn(): Promise<boolean> {
  return (await mapsOn()) && (await setting("switch.web_maps"));
}
