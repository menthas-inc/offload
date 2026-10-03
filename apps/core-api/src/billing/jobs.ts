// 034, section C. What offload really costs: `billing.pull`, daily.
//
// `jobs/handlers.ts` spreads `billingHandlers` into the runner's registry and
// `server.ts` calls `startBillingJobs()` at boot, so this file is the only
// place either has to be written.

import type { Handler } from "../jobs/handlers.js";
import { scheduleDaily, startDaily } from "../jobs/queue.js";
import { pullBilling } from "./pull.js";

/** Tomorrow's run is booked before the work, as every daily job here does:
 *  a pull that fails must not be the last one. A failure is `vendor_error` on
 *  the job's row, and a run that never happens is a late job on Health. */
const billingPull: Handler = async () => {
  await scheduleDaily("billing.pull");
  await pullBilling();
};

export const billingHandlers: Record<string, Handler> = {
  "billing.pull": billingPull,
};

/** Start the daily pull. Called once at boot, after the daily chains. */
export async function startBillingJobs(): Promise<void> {
  await startDaily("billing.pull");
}
