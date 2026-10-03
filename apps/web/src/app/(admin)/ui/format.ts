// How the panel writes a figure, in one place so six pages agree.

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const COUNT = new Intl.NumberFormat("en-GB");
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const MOMENT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const CLOCK = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** Money is dollars, to the cent. The ledger counts millionths. */
export function dollars(micros: number): string {
  return MONEY.format(micros / 1_000_000);
}

export function count(n: number): string {
  return COUNT.format(n);
}

/** A UTC day, as plots and daily figures are. */
export function day(iso: string | Date): string {
  return DAY.format(new Date(iso));
}

/** A moment, in the reader's own clock. */
export function moment(iso: string | Date): string {
  return MOMENT.format(new Date(iso));
}

export function clock(at: Date): string {
  return CLOCK.format(at);
}

/** Whether what is typed in a number field is outside its bounds, or not a
 *  number at all. The server refuses it too; this is so the field says so. */
export function outOfBounds(value: string, min?: number, max?: number): boolean {
  if (min === undefined && max === undefined) return false;
  const n = Number(value);
  if (value.trim() === "" || !Number.isFinite(n)) return true;
  return (min !== undefined && n < min) || (max !== undefined && n > max);
}
