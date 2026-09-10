// The job runner.
//
// Polls the jobs table, claims one row at a time with SKIP LOCKED, runs its
// handler, and records the outcome. Deliberately dull: the interesting
// decisions (one transaction with the write that caused it, priority ordering)
// live in the queue and in the callers.

import { claim, complete, fail, type ClaimedJob } from "./queue.js";
import { handlers } from "./handlers.js";
import { createMailer as defaultMailer, type Mailer } from "../mail/index.js";

export interface RunnerOptions {
  mailer: Mailer;
  /** How long to wait when the queue is empty. */
  idleMs?: number;
  log?: (level: "info" | "error", fields: Record<string, unknown>, msg: string) => void;
}

export class JobRunner {
  private running = false;
  private timer: NodeJS.Timeout | undefined;
  private readonly workerId = `api-${process.pid}`;

  constructor(private readonly options: RunnerOptions) {}

  /** Run exactly one job if there is one. Returns whether it did anything,
   *  which is what makes the runner testable without timers. */
  async tick(): Promise<boolean> {
    const job = await claim(this.workerId, Object.keys(handlers));
    if (!job) return false;
    await this.run(job);
    return true;
  }

  private async run(job: ClaimedJob): Promise<void> {
    const handler = handlers[job.kind];
    const log = this.options.log ?? (() => {});

    if (!handler) {
      // An unknown kind is a deploy problem, not a transient one, so it does
      // not deserve five retries.
      await fail({ ...job, attempts: job.max_attempts }, new Error(`No handler for job kind ${job.kind}`));
      log("error", { jobId: job.id, kind: job.kind }, "job kind has no handler");
      return;
    }

    try {
      const payload = (typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload) as Record<
        string,
        unknown
      >;
      await handler(payload, { mailer: this.options.mailer }, job.account_id);
      await complete(job.id);
      log("info", { jobId: job.id, kind: job.kind, attempts: job.attempts }, "job done");
    } catch (error) {
      await fail(job, error);
      // Ids and counts only. The error text is scrubbed inside fail(); this
      // line does not repeat it at all.
      log("error", { jobId: job.id, kind: job.kind, attempts: job.attempts }, "job failed");
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const idle = this.options.idleMs ?? 1000;

    const loop = async (): Promise<void> => {
      if (!this.running) return;
      let worked = false;
      try {
        worked = await this.tick();
      } catch (error) {
        this.options.log?.("error", { err: String(error).slice(0, 120) }, "runner tick failed");
      }
      // Drain greedily while there is work, then back off. A queue that is
      // empty most of the time should not poll a database every 50ms.
      this.timer = setTimeout(() => void loop(), worked ? 0 : idle);
    };

    void loop();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
  }
}

/** The runner the API process actually uses.
 *
 *  A factory rather than a `new` at the call site, so a test can assert the
 *  production wiring exists. It did not for a while: enqueueing worked, the
 *  handlers were tested, and nothing drained the table, because every test
 *  built its own runner by hand and the server built none. A suite cannot see
 *  a missing call it never makes itself.
 */
export function createJobRunner(
  log?: RunnerOptions["log"],
  mailerFactory: () => Mailer = defaultMailer
): JobRunner {
  return new JobRunner(log ? { mailer: mailerFactory(), log } : { mailer: mailerFactory() });
}
