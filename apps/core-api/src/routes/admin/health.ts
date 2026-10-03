// 034, section E. Health and alerts.
//
// Registered by the admin plugin, so every path here is relative to
// `/v1/admin` and already behind the staff check. Each route that is not a GET
// declares `config: { audit: <kind> }` and writes that entry in its own
// transaction.
//
// **Two functions, because the file serves two ranks.** Health itself is an
// owner page. Retrying a dead job is also offered on a person's page, which
// support sees, so the job actions register in the support scope: retry is
// support's, and dismiss declares `config: { rank: "owner" }`.

import type { App } from "../../app.js";

/** `/health/*`, in the owner scope. */
export async function healthAdminRoutes(_app: App): Promise<void> {}

/** `/jobs/:id/retry` and `/jobs/:id/dismiss`, in the support scope. */
export async function jobAdminRoutes(_app: App): Promise<void> {}
