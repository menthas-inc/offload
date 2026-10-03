// 034, section E. Health's own jobs: `health.rollup`, hourly, and
// `email.alert`.
//
// `jobs/handlers.ts` spreads `healthHandlers` into the runner's registry and
// `server.ts` calls `startHealthJobs()` at boot, so this file is the only
// place either has to be written. Empty until the section lands.

import type { Handler } from "../jobs/handlers.js";

export const healthHandlers: Record<string, Handler> = {};

/** Start Health's chains. Called once at boot, after the daily chains. */
export async function startHealthJobs(): Promise<void> {}
