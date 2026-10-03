// Every job that runs on a schedule, and not because a person asked (034).
//
// There is no cron in this product: a scheduled job is a row in `jobs` that
// books its own successor (`queue.ts`). That makes "what runs here, and when"
// a question with no single place to read the answer from, so this is that
// place. Health lists one row per entry: what it does, how often, when it
// last ran and when it is next due, which is the queued row's `run_after`. A
// job that has not run by then plus its grace is late.
//
// A daily job has no fixed hour. It drifts from boot, and the page shows the
// real time rather than a schedule nobody set.
//
// `test/schedule.test.ts` greps the scheduling call sites and fails on a kind
// booked on a clock that has no entry here.

export interface Scheduled {
  kind: string;
  /** One line, for the page. What it does, never what it is called. */
  does: string;
  cadence: "minute" | "quarter" | "hourly" | "daily";
  /** How long past due before it is late. */
  graceMinutes: number;
  /** Which process drains it: this one, or the Python worker. */
  runner: "api" | "worker";
  /** One row per account, connection or thread, rather than one for all. */
  perAccount: boolean;
}

const daily = { cadence: "daily", graceMinutes: 120, runner: "api", perAccount: false } as const;

export const SCHEDULED: readonly Scheduled[] = [
  // The chains the server starts at boot.
  { kind: "calendar.supervise", does: "Restarts a calendar sync that stopped, and books each connection's daily full pass.", ...daily },
  { kind: "jobs.purge", does: "Removes finished jobs past 30 days, and everything else kept on a clock.", ...daily },
  { kind: "account.daily", does: "Finds the accounts with something for the nightly pass and books each one.", ...daily },
  { kind: "blob.daily", does: "Books the daily sweeps for files: the purge, transcripts still held, and towns for photos.", ...daily },
  { kind: "places.age", does: "Drops place coordinates past the 30 days they may be kept.", ...daily },
  { kind: "people.daily", does: "Expires connection requests, waiting shares and proposals.", ...daily },
  { kind: "analytics.ship", does: "Ships product events to storage and drops them after 30 days.", ...daily },
  { kind: "digest.schedule", does: "Places each account's morning and evening digest for the hour ahead.", cadence: "hourly", graceMinutes: 20, runner: "api", perAccount: false },
  { kind: "embed.sweep", does: "Finds rows that still need embedding and books them.", cadence: "minute", graceMinutes: 10, runner: "api", perAccount: false },
  { kind: "calendar.sync", does: "Reads one connected calendar for what changed.", cadence: "quarter", graceMinutes: 30, runner: "api", perAccount: true },
  // What those book.
  { kind: "account.daily.run", does: "Books one account's nightly passes, one per thread that changed.", ...daily, perAccount: true },
  { kind: "thread.nightly", does: "The nightly pass: keeps one member's notes in one thread true.", cadence: "daily", graceMinutes: 240, runner: "worker", perAccount: true },
  { kind: "account.digest", does: "Sends one account's morning or evening digest.", cadence: "daily", graceMinutes: 30, runner: "api", perAccount: true },
  { kind: "push.receipts", does: "Reads whether a push was delivered, a quarter of an hour after it was sent.", cadence: "quarter", graceMinutes: 30, runner: "api", perAccount: false },
  { kind: "shared.activity", does: "Tells a shared thread's members what somebody added, ten minutes at a time.", cadence: "quarter", graceMinutes: 30, runner: "api", perAccount: true },
  { kind: "content.purge", does: "Removes what was deleted once its Undo has passed.", ...daily },
  { kind: "voice.forget", does: "Deletes a transcript at the transcription company once it has been read.", cadence: "daily", graceMinutes: 120, runner: "worker", perAccount: false },
  { kind: "blob.locate", does: "Names the town a photo was taken in.", ...daily },
  // 035's.
  { kind: "export.sweep", does: "Destroys a copy of an account once its seven days are up.", cadence: "hourly", graceMinutes: 20, runner: "api", perAccount: false },
  { kind: "connector.revoke", does: "Hands back the calendar grants of deleted accounts, hourly while any is left.", cadence: "hourly", graceMinutes: 60, runner: "api", perAccount: false },
  // 034's own.
  { kind: "health.rollup", does: "Closes the last hour of jobs into the hourly history the plots read.", cadence: "hourly", graceMinutes: 20, runner: "api", perAccount: false },
  // Not a job: it runs from the heartbeat timer, beside the minute's beat.
  { kind: "alerts.check", does: "Checks the alert conditions and emails every owner when one opens or clears.", cadence: "minute", graceMinutes: 5, runner: "api", perAccount: false },
  { kind: "billing.pull", does: "Reads each company's bill for the month and writes the fixed amounts.", ...daily },
];

export function scheduled(kind: string): Scheduled | undefined {
  return SCHEDULED.find((one) => one.kind === kind);
}
