// 034, section C. What offload really costs.
//
// Registered by the admin plugin in the owner scope, so every path here is relative to
// `/v1/admin` and already behind the staff check. Each route that is not a GET
// declares `config: { audit: <kind> }` and writes that entry in its own
// transaction.

import type { App } from "../../app.js";

export async function billingAdminRoutes(_app: App): Promise<void> {}
