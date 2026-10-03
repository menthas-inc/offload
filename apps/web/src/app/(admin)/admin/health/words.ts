// How Health says a figure, and what it calls a job (034, section E).
//
// A job kind the panel has no name for shows its kind.

import { count, day } from "../../ui";
import type { Range } from "../../ui";

const JOB_NAMES: Record<string, string> = {
  "dump.answer": "Answering a dump",
  "thread.nightly": "The nightly pass",
  "account.daily": "Nightly pass, finding accounts",
  "account.daily.run": "Nightly pass, one account",
  "account.digest": "A digest",
  "digest.schedule": "Placing digests",
  "calendar.sync": "Calendar sync",
  "calendar.supervise": "Calendar sync, supervising",
  "jobs.purge": "The daily purge",
  "content.purge": "Purging what was deleted",
  "blob.daily": "File sweeps",
  "blob.purge": "Removing a file from storage",
  "blob.locate": "Naming a photo's town",
  "places.age": "Ageing place coordinates",
  "people.daily": "Expiring requests and shares",
  "analytics.ship": "Shipping product events",
  "embed.sweep": "Finding rows to embed",
  "embed.content": "Embedding",
  "embed.note": "Embedding a note",
  "embed.message": "Embedding a message",
  "push.receipts": "Push receipts",
  "people.notify": "Telling a person",
  "shared.activity": "Shared thread activity",
  "voice.forget": "Forgetting a transcript",
  "location.resolve": "Looking up a place",
  "link.place": "Reading a link for a place",
  "health.rollup": "Hourly job history",
  "alerts.check": "Checking the alerts",
  "billing.pull": "Reading the bills",
  "email.invited": "The invite email",
  "email.waitlist_joined": "The waitlist email",
  "email.alert": "An alert email",
  "account.delete": "Deleting an account",
};

export function jobName(kind: string): string {
  return JOB_NAMES[kind] ?? kind;
}

export const SERVICE_NAMES: Record<string, string> = {
  "core-api": "Core API",
  worker: "The worker",
  web: "The web",
  database: "The database",
};

export const VENDOR_NAMES: Record<string, string> = {
  model: "The model",
  transcription: "Transcription",
  embeddings: "Embeddings",
  search: "Search",
  reads: "Reading links",
  maps: "Maps",
  calendar: "The calendar",
  mail: "Mail",
  push: "Push",
  storage: "File storage",
};

export const CADENCE: Record<string, string> = {
  minute: "every minute",
  quarter: "every 15 minutes",
  hourly: "hourly",
  daily: "daily",
};

export const RANGE_WORDS: Record<Range, string> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};

/** A length of time, in its two largest units. */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days} d ${hours % 24} h` : `${days} d`;
}

/** Milliseconds, as the reader would say them. */
export function millis(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return duration(ms / 1000);
}

export function percent(share: number): string {
  // Floored, so 99.996% never reads as a hundred.
  return `${(Math.floor(share * 10_000) / 100).toFixed(2)}%`;
}

export function bytes(n: number): string {
  if (n < 1024) return `${count(n)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

const HOUR = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/** A plot point's label: the hour over a day, the UTC day otherwise. */
export function bucket(range: Range, iso: string): string {
  return range === "24h" ? HOUR.format(new Date(iso)) : day(iso);
}

/** Said under a plot whose history is shorter than the range asked for. */
export function startsNote(historyStarts: string | null, firstPoint: string | undefined): string | undefined {
  if (!historyStarts || !firstPoint) return undefined;
  return new Date(historyStarts).getTime() > new Date(firstPoint).getTime() ? `History starts ${day(historyStarts)}.` : undefined;
}
