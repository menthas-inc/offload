// 034, section C. What offload really costs: `billing.pull`, daily.
//
// `jobs/handlers.ts` spreads `billingHandlers` into the runner's registry and
// `server.ts` calls `startBillingJobs()` at boot, so this file is the only
// place either has to be written. Empty until the section lands.

import type { Handler } from "../jobs/handlers.js";

export const billingHandlers: Record<string, Handler> = {};

/** Start the daily pull. Called once at boot, after the daily chains. */
export async function startBillingJobs(): Promise<void> {}
