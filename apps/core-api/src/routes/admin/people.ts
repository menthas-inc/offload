// 034, section A. People and a person.
//
// Registered by the admin plugin in the support scope, so every path here is relative to
// `/v1/admin` and already behind the staff check. Each route that is not a GET
// declares `config: { audit: <kind> }` and writes that entry in its own
// transaction. Owner-only routes here (an override, delete and its cancel)
// declare `config: { rank: "owner" }` and the prefix guard enforces it.

import type { App } from "../../app.js";

export async function peopleAdminRoutes(_app: App): Promise<void> {}
