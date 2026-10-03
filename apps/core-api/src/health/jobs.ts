// 034, section E. Health's own jobs: `health.rollup`, hourly, and
// `email.alert`.
//
// `jobs/handlers.ts` spreads `healthHandlers` into the runner's registry and
// `server.ts` calls `startHealthJobs()` at boot, so this file is the only
// place either has to be written.

import type { Handler } from "../jobs/handlers.js";
import { scheduleHourly, startHourly } from "../jobs/queue.js";
import { rollup } from "./rollup.js";
import { emailAlert } from "./mail.js";

/** Booked for the next hour before the work, as every chain here is: a run
 *  that fails still has a successor. */
const healthRollup: Handler = async () => {
  await scheduleHourly("health.rollup");
  const rows = await rollup();
  console.log(JSON.stringify({ level: "info", msg: "job history rolled up", rows }));
};

export const healthHandlers: Record<string, Handler> = {
  "health.rollup": healthRollup,
  "email.alert": emailAlert,
};

/** Start Health's chains. Called once at boot, after the daily chains. */
export async function startHealthJobs(): Promise<void> {
  await startHourly("health.rollup");
}
