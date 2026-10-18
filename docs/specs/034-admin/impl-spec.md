# 034 The admin panel: implementation

Reads with `feature-spec.md`. CA is `apps/core-api`, AG is `apps/agent/src/offload_agent`, WEB is `apps/web/src/app/(admin)`.

## Constitution check

| Principle | How it is met |
| --- | --- |
| DEV-1 | The owner chose the full scope on 2026-10-03 over the project lead's cuts. Inside it: no new service, no new vendor, no chart library, one settings store. |
| DEV-2 | Amendments are listed at the top of the feature spec and land in the same change. |
| QUAL-1 | Every task names its ACs; each test is written first and seen red. The cross-section tests are written red in groundwork and go green at the merge. |
| SEC-1 | Billing keys and the internal token come from the environment. Search input is escaped for `like`. A name or address is rendered as text and never reaches an email or a CSV. |
| SEC-2 | One `onRequest` staff guard on the `/v1/admin` prefix, an owner guard on the owner scope, a route-table test (AC-3). Every guard in sections 2 and 8 is enforced in the route, not the page. |
| OFF-1 | No content in any admin response, CSV, alert or audit entry (AC-4). The column table below is the rule. No admin route reads `analytics_events`. History tables have no account column. |
| OFF-2 | No new content column and no blob. Deletion destroys keys through `blobs/keys.ts`, not ad hoc SQL. |
| OFF-3 | Deletion follows the destruction table: private things go, shared-thread content stays authorless, a thread dies with its last member. |
| OFF-4 | Deletion removes derived calendar rows and revokes the grant at Google. |
| OFF-5 | Not applicable: no model output. |
| OFF-6 | Diverges on purpose: the panel has no eight-second Undo. Recorded in `docs/tech/decisions.md`. Delete's 24 hour hold is its undo. Alerts are outward facing and go only to owners, about conditions, with no person in them. |
| OFF-7 | Twenty one divergences, one design decisions entry each, written at the merge. |
| OFF-8 | Not applicable: nothing reaches a prompt. |

`GATE: PASS`, with one SHOULD flag: DEV-1 against the full scope, justified by the owner's explicit choice.

## Volume and access

| | |
| --- | --- |
| Accounts | Tens today, a few hundred through the alpha. Design point: 1,000. |
| `llm_usage` | About 60 rows per active account per day heavy, 10 typical. At 300 accounts typical: 3,000 a day, about 1M a year. Never purged. |
| `jobs` | Embeds, syncs every 15 minutes per connection, sweeps every minute: about 2,000 a day now, 30,000 a day at 300 accounts. Kept 30 days once done or dead: under 1M live rows. |
| `heartbeats` | 4 services, one row a minute: 5,760 a day, 518,000 at 90 days. |
| `job_stats_hourly` | About 40 kinds by 3 outcomes by 24 hours: under 3,000 a day, 260,000 at 90 days. |
| `staff_audit` | Tens a day. Under 50,000 in two years. |
| `limit_hits` | One row per account, cap, scope and day. Tens a month. |
| `vendor_costs` | About 12 vendors by 2 sources a month. |
| Readers | A handful of staff, one page at a time, by hand. No page is polled. |

What follows:

- **Pagination.** People, a person's timeline, Audit and dead jobs are server-side by cursor, 50 a page, on the row id (UUIDv7), as the waitlist already does. People sorted by spend or last active is not cursor-paged: it returns the top 200 and says so.
- **Aggregates are computed live.** No spend column on `accounts`, no daily rollup of the ledger. At 1M ledger rows a 90 day group-by on an indexed `created_at` is tens of milliseconds. The breaking point is about 10M rows or a page read by something other than a person; a daily per-account rollup is the answer then.
- **Indexes added:** `llm_usage (created_at)`; `lookups (created_at)`; `jobs (state, updated_at)` for dead and stuck lists; `staff_audit (at desc)`, `(target_account_id, at desc)`, `(staff_account_id, at desc)`; `limit_hits (day desc)`; `heartbeats` by its primary key `(service, minute)`.
- **The platform's 24 hour spend** is read on every dump. It is one indexed sum, cached in-process for 15 seconds beside the settings.
- **Denormalised on purpose:** `job_stats_hourly`, because the job table is purged at 30 days and the plots go to 90. Written by an hourly job from rows whose hour has closed, upserted, so a re-run is harmless.
- **Partitioning:** none.

## Columns the panel may never return

AC-4 seeds a mark in each and AC-5 a token in each.

| Table | Never selected by an admin route |
| --- | --- |
| `jobs` | `payload`, `last_error` |
| `messages`, `conversations`, `content`, `notes`, `questions`, all `*_chunks` | every text column; counts only |
| `threads`, `labels`, `thread_proposals`, `suggestions` | `name`, `title`; counts only |
| `activity`, `activity_mentions` | `title`, `body` |
| `blobs` | `name`, `town`, `latitude`, `longitude`, `taken_at`, `device`; count and summed bytes only |
| `turn_sources`, `domain_reads` | everything. Vendor figures for reads come from `lookups` and `domain_reads_visible` counts only. |
| `connector_calendars`, `connector_events`, `connector_pending_writes` | `summary`, `title`, `location`, `attendees`, `payload` |
| `connector_connections` | `external_account_email` |
| `connector_secrets`, `account_identities` tokens, `sessions.token`, `sessions.ip_address`, `sessions.user_agent`, `push_tokens.token`, `account_keys`, `thread_keys`, `blob_keys` | everything but a count, a platform or a timestamp |
| `accounts` | `avatar_png`, `today_layout`, `provider_name`, `analytics_subject_id` |
| `analytics_events` | the whole table |
| `lookups` | `label` is a closed set and may be shown |

No admin query uses `selectAll()`.

## Data model

Six migrations, all written in groundwork so no section adds one. Numbers start at 0074 and are renumbered at the merge if main has moved.

**0074_settings_registry.sql**
- `app_settings`: drop the `key in ('web_maps')` check. The registry in code is the closed set; the route refuses an unknown key.
- `account_limits (account_id uuid references accounts on delete cascade, key text, value bigint not null, set_by_account_id uuid references accounts on delete set null, updated_at timestamptz default now(), primary key (account_id, key))`.
- `grant select on app_settings to offload_agent`. `agent-role.test.ts` gains the line.

**0075_staff_audit.sql**
- `staff_audit (id uuid pk, at timestamptz default now(), staff_account_id uuid not null, kind text not null, target_account_id uuid, setting_key text, old_value jsonb, new_value jsonb, job_id uuid, day date generated)`. **No foreign keys**: an entry outlives both accounts. No address, no free text.
- Unique `(staff_account_id, target_account_id, day) where kind = 'person.viewed'`.
- A `before update or delete` trigger that raises, except a delete of a row older than two years.
- No last-seen column on `staff`: a stamp on `/v1/admin/me` would be a read that writes. Staff's *last here* is the newest audit entry by that person.
- A trigger on `insert into staff` that raises when the account has more than one `account_identities` row, the mirror of 0007.

**0076_ledger_survives.sql**
- `llm_usage.account_id` and `lookups.account_id`: drop not null, `on delete set null`. 0018's reasoning, one table over.
- `turn_sources` keeps its cascade: an address a person's turn read is theirs.
- The two `created_at` indexes.
- `llm_usage.job_id uuid`, nullable, **no foreign key**, with an index where it is set. Added at the merge for AC-20: the job a call was made for, written by `turn-result`, `nightly-result` and the transcript route, and read only by a person's timeline. No key because the job table is purged at 30 days and the ledger never is. Rows written before it have none.

**0077_health.sql**
- `jobs`: `error_code text`, `retried_at timestamptz`, `dismissed_at timestamptz`; index `(state, updated_at)`; `grant update (error_code) on jobs to offload_agent`.
- `heartbeats (service text, minute timestamptz, ok boolean, commit text, started_at timestamptz, primary key (service, minute))`. Services: `core-api`, `worker`, `web`, `database`.
- `job_stats_hourly (hour timestamptz, kind text, outcome text, count int, wait_ms_sum bigint, wait_ms_p95 int, run_ms_sum bigint, run_ms_p95 int, primary key (hour, kind, outcome))`. No account.
- `backup_runs (id uuid pk, finished_at timestamptz, bytes bigint, ok boolean)`.
- `alert_states (condition text pk, opened_at, cleared_at, last_sent_at)` and `alert_sends (day date pk, count int)`.
- `limit_hits (account_id uuid references accounts on delete cascade, cap text, scope text check (scope in ('account','platform')), day date, count int default 1, last_at timestamptz, primary key (account_id, cap, scope, day))`.

**0078_account_deletion.sql**
- `accounts.delete_after timestamptz`, `accounts.delete_requested_by uuid`.

**0079_vendor_costs.sql**
- `vendor_costs (vendor text, month date, source text check (source in ('billed','fixed')), amount_micros bigint, final boolean, read_at timestamptz, primary key (vendor, month, source))`.

## Groundwork modules

**Settings registry, `CA/src/settings.ts`.** One table of `{key, kind: 'int' | 'micros' | 'bool' | 'money-map', default, min, max}`. Keys: `cap.spend_micros`, `cap.turns`, `cap.photos`, `cap.photo_bytes`, `cap.voice_notes`, `cap.voice_ms`, `cap.mail_day`, `cap.mail_hour`, `platform.spend_micros` (null is off), `budget.month_micros` (null is unset), `waitlist.batch`, `switch.web_maps`, `switch.maps`, `switch.web_search`, `switch.web_links`, `switch.nightly`, `costs.fixed` (a map of vendor to micros). `web_maps` keeps its stored key through an alias so the existing row is read.
- `setting(key)`: the 15 second cache that exists, the value parsed against its kind and bounds, **the default on anything unexpected**.
- `limitFor(accountId, key)`: the account's `account_limits` row, else `setting(key)`. Overrides are cached per account for the same 15 seconds.
- `saveSettings(changes, expected, staff, tx)`: compares `expected` to the stored values and refuses on a mismatch; one audit entry per key.
- The constants in `budget.ts`, `blobs/photos.ts`, `blobs/audio.ts`, `mail-in/receive.ts` and `routes/admin.ts` stay as the registry's defaults and stop being read at call sites.

**Caps, `CA/src/budget.ts`.** `requireBudget` reads through `limitFor`, then checks the platform: `platformSpent()` (the cached 24 hour sum) against `platform.spend_micros`. `OverBudget` gains `scope`. Every refusal calls `recordHit(accountId, cap, scope)`, an upsert on `limit_hits`. The 429 body becomes `{error: "daily_limit", scope?: "account" | "platform"}`; both clients branch on the status alone, so shipped phones are unaffected. The same `recordHit` goes into the photo, voice and mail refusals. Mail in's handler catches `OverBudget` from the turns cap, which answers 500 today.

**Scheduled work for an account, `CA/src/accounts/active.ts`.** `worksInBackground(accountId)` and a SQL fragment for joins: `state = 'active' and deleted_at is null and delete_after is null`. Used by the five enqueuers that do not check today: `calendar.sync`, `superviseSyncs`, `scheduleFullSyncs`, mail in's `accountFor`, and `shared.activity` recipients. `account.daily.run` also skips booking `thread.nightly` when `switch.nightly` is off or the platform cap is reached.

**Switches.** `mapsConfig().on` and `webMapsOn()` read `switch.maps`. The worker reads the three it needs with its per-turn `_MAY_REACH` query (`context.py:740`), joined to `app_settings`: `may_search` and `may_read_links` are the account's column and the switch together, and `maps_on` is `cfg.maps_on` and the switch. `link_place.py` does the same in its SQL. No worker cache: it is one query per turn that already runs.

**Error codes, `CA/src/jobs/errors.ts`.** The closed set: the worker's existing strings (`stale`, `nightly_error`, `nightly_unparseable`, `link_place_error`, `forget_error`, `embed_error`, `embed_unavailable`, `undeliverable`, `invalid_output`, `model_error`, `transcription_failed`, `timeout`) plus the Core API's (`no_handler`, `mail_failed`, `vendor_error`, `handler_error`, `stale`). `fail()` writes `error_code` from a `JobError` carrying one, else `handler_error`, beside the scrubbed `last_error` it already writes. The worker writes the same string to both columns. `turn-result` writes the failure reason to `error_code` when it closes a failed turn `done`, so a failed dump is visible on a timeline; the dead list reads `state = 'dead'`, and the failures filter reads `error_code is not null`.

**Stale reclaim.** `claim()` in `queue.ts` gains the worker's branch: a `running` row locked more than 15 minutes ago with attempts left is claimable, and one with none is marked `dead` with `stale`.

**Audit, `CA/src/admin/audit.ts`.** `audit(tx, {staff, kind, targetAccountId?, settingKey?, old?, new?, jobId?})`. Kinds are a union. Routes declare `config: {audit: kind}`; AC-52 walks the route table and fails on a non-GET admin route without one.

**The guard, when it cannot look.** A session lookup that throws, or a session row that went mid-request, is answered 404 like anybody else the panel cannot place. The admin prefix is left out of 033's consent hook (`refuseWritesBeforeConsent`), whose own lookup would otherwise answer first: the staff guard already requires an active account.

**The guard.** `adminRoutes` becomes a plugin with `addHook('onRequest', requireStaff())`, and registers one file per section: `routes/admin/{waitlist,people,costs,billing,limits,health,staff,audit}.ts`. Owner sections register inside a nested scope with `requireStaff('owner')`. Owner-only routes inside support sections (override set and clear, delete and cancel) carry `config: {rank: 'owner'}` and their own check. `requireStaff` compares ranks from `['support', 'owner']`.

**Heartbeats, `CA/src/health/heartbeat.ts`.** A timer in `server.ts`, every 60 seconds: upsert `core-api` for this minute with `process.env.RAILWAY_GIT_COMMIT_SHA` and the boot time; `select 1` for `database`; `fetch(WEB_URL + '/healthz')` with a 5 second timeout for `web`. The worker posts `/internal/v1/heartbeat` each minute from its loop, behind the private host and the bearer that exist. The web gains `app/healthz/route.ts` returning its commit. **To verify on the platform, not from documentation:** that Railway sets `RAILWAY_GIT_COMMIT_SHA` at runtime on all three services; if not, the commit reads as unknown.

**Scheduled registry, `CA/src/jobs/schedule.ts`.** One entry per scheduled kind: `{kind, does, cadence: 'minute' | 'quarter' | 'hourly' | 'daily', graceMinutes, runner: 'api' | 'worker', perAccount}`. Kinds: `calendar.supervise`, `jobs.purge`, `account.daily`, `blob.daily`, `places.age`, `people.daily`, `digest.schedule`, `analytics.ship`, `embed.sweep`, `calendar.sync`, and the kinds they book (`account.daily.run`, `thread.nightly`, `account.digest`, `push.receipts`, `shared.activity`, `content.purge`, `voice.forget`, `blob.locate`), plus this spec's `health.rollup` (hourly), `alerts.check` (every minute, from the heartbeat timer, not a job) and `billing.pull` (daily). AC-39's test greps `scheduleDaily`, `scheduleHourly`, `startDaily`, `startHourly` and `runAfterSeconds` call sites and fails on a kind missing here. Next run is the queued row's `run_after`; daily jobs have no fixed hour, they drift from boot, and the page shows the real time.

**`jobs.purge`** also removes heartbeats and hourly stats past 90 days, limit hits past 30, and audit entries past two years.

**Backup.** `backup.sh` ends with a `psql` insert into `backup_runs` on success and on failure. It already holds a database URL.

**Web pieces, `WEB/ui/`.** `Table` (a `cols` contract as `A.jsx`), `RowLink`, `Stats` and `Stat` with `tone`, `Confirm` with `confirmWord`, `Field` with bounds, error and reset, `Diff`, `Plot` (SVG, bars or a line, one series, focusable points with labels, an empty range, a history-starts note), `RangePicker` (a segmented control writing `?range=`), `StatusPill` with one enum-to-tone map, `Loading`, `Failed`, `Empty`, `Back`, `Section`, `Notes`, `useAdminRead` (one fetch helper with `credentials: 'include'`, the failed state and the as-of time). The nav uses `Icon` with `inbox`, `users`, `monitor`, `blend`, `lock`, `group`, `list`. One hit-area rule: controls drawn at 32 carry a `::after` to 44. `.note` is declared once; section labels follow the kit. The shell sets `data-theme="light"`. Page files carry no colour; every colour is a class in `admin.module.css` using semantic aliases. Two tokens are added on main at the merge (`--surface-danger`, `--plot-height`); until then the branch uses the nearest alias behind one class each.

## Sections

Each section owns one route file, one page directory, one test file, and nothing else. A change to a groundwork module during a section is reported back, not made.

### A. People and a person (`routes/admin/people.ts`, `WEB/admin/people/`)

- `GET /v1/admin/people?state&q&sort&cursor`, `GET /v1/admin/people/stats`.
- `POST /v1/admin/people/:id/disable`, `/enable`, `/sign-out`, `/viewed`.
- `GET /v1/admin/people/:id`, `/:id/usage?range`, `/:id/timeline?failed&cursor`, `/:id/hits`.
- `PATCH /v1/admin/people/:id/limits` (owner), body `{key, value | null}`.
- `POST /v1/admin/jobs/:id/retry` lives in Health's file and is called from here.
- Disable: `state = 'disabled'`, `disabled_at = now()`, delete every `sessions` row, in one transaction. A live stream closes itself (`dumps.ts:712`). Enable: `state = 'active'`, `disabled_at = null`.
- Last active is the newest of `sessions.updated_at` and the account's newest job. Threads is a count of `thread_members`. Spend is the ledger plus lookups over 30 days.
- Who invited them: the newest `invited` audit entry for the account, else absent.
- The timeline's model, tokens and cost are the ledger rows whose `job_id` is the job: the distinct models, tokens in and out summed, cost summed. A job that called no model has none of them. Search fees are in `lookups`, which names no job, so they are not in a job's cost.
- Usage against each cap is the cap's own function: `spentToday` and `turnsToday` (`budget.ts`), `photosToday` (`blobs/photos.ts`), `voiceToday` (`blobs/audio.ts`), `mailToday` (`mail-in/receive.ts`). The page and the refusal run one statement.
- A signed-in account is one definition, `signedIn` in `accounts/active.ts`: signed in at least once, active or disabled, not removed. People, a person's page and Costs' per-account figure all count it.
- Sign out everywhere carries disable's staff guard: support may not sign out staff, answered 409. Signing yourself out is allowed.

### B. Costs (`routes/admin/costs.ts`, `WEB/admin/costs/`)

- `GET /v1/admin/costs/summary`, `/daily?range`, `/by?dim=job|model|vendor&range`, `/trends?dim&range`, `/usage?range`, `/heaviest?range`, `/export.csv?range`.
- Vendor is derived: `model = 'assemblyai'` is transcription, `lookups.kind` is search or reads, everything else in `llm_usage` is the model. Embeddings and maps write no ledger row today and read as not recorded.
- Job names: a map from kind to a short name, with the kind as the fallback.
- Accounts active per day: distinct accounts with a `dump.answer` job that day, from `jobs` inside 30 days and from `llm_usage` beyond it.

### C. What offload really costs (`routes/admin/billing.ts`, `CA/src/billing/`, a section of `WEB/admin/costs/`)

- `GET /v1/admin/billing?months=12`.
- `billing.pull`, daily: one puller per vendor behind `interface Puller { vendor; pull(from, to): Promise<{month, micros, final}[]> }`, each enabled only when its key is set.
- **Each puller starts with a recorded real response**, checked in as a fixture, and its test asserts the keys the code reads are keys the response has. Candidates to try, in order, none assumed: Anthropic's organisation cost report (an admin key), Railway's usage through its GraphQL API, Cloudflare's billing for R2. Google Cloud exposes real cost only through a BigQuery billing export, which is a new dependency: Google is fixed or metered unless the owner wants the export. Resend, Expo, AssemblyAI and Voyage are expected to be fixed or metered. What each interface answered is recorded in this file's appendix when tried.
- Fixed amounts come from `costs.fixed`; the daily job writes the current month's `fixed` rows from it.
- Keys: `ANTHROPIC_ADMIN_KEY`, `RAILWAY_API_TOKEN`, `CLOUDFLARE_BILLING_TOKEN`, optional in `env.ts`, set by the owner on Railway. The pull is opt-in per key, so a local server never calls out.

### D. Limits (`routes/admin/limits.ts`, `WEB/admin/limits/`)

- `GET /v1/admin/settings` returns every key with value, default, bounds and `updatedAt`. `PATCH /v1/admin/settings` takes `{changes, expected}`. The existing `{webMaps}` body is dropped; nothing but the panel calls it.
- `GET /v1/admin/limits/hits?cursor`, `GET /v1/admin/limits/now` (platform spend against the cap).
- The fixed-cost fields for section C render here.

### E. Health and alerts (`routes/admin/health.ts`, `CA/src/health/`, `WEB/admin/health/`)

- `GET /v1/admin/health/services?range`, `/incidents?range`, `/queue?range`, `/backups`, `/scheduled?range`, `/scheduled/:kind?range`, `/stuck`, `/dead?cursor`, `/calls?range`, `/vendors?range`, and `/revocations` (2026-10-17, the sweep's S27: the calendar grants kept for a revoke by hand).
- `POST /v1/admin/jobs/:id/retry`: `state = 'queued'`, `run_after = now()`, `max_attempts = attempts + 1`, `retried_at = now()`, only where `state = 'dead' and retried_at is null`; refused when the account does not pass `worksInBackground` or is at its cap. `POST /v1/admin/jobs/:id/dismiss` sets `dismissed_at`.
- Uptime: minutes with an `ok` heartbeat over minutes in the range since the first heartbeat. Incidents: gaps-and-islands over `heartbeats`, gaps of two minutes or more.
- `health.rollup`, hourly: closes the previous hour into `job_stats_hourly`.
- Vendor sources: the model and transcription from `llm_usage` and job error codes; search and reads from `lookups.outcome`; mail from `email.*` jobs; push from `account.digest` and `push.receipts` jobs; the calendar from `calendar.sync` jobs; embeddings from `embed.*` jobs; storage from `blob.purge` jobs; maps from `location.resolve` and `blob.locate` jobs.
- `alerts.check`, each minute beside the heartbeat: evaluates the five conditions, opens or clears `alert_states`, and enqueues `email.alert` (a new kind, handled by the existing mailer and template) to every owner. `alert_sends` counts the day. Staff-action alerts are enqueued by the routes that cause them, in their transaction, and skip the count.
- `/v1/admin/me` gains `wrong`: dead jobs not dismissed, plus services down, plus a late backup.

### F. Staff and Audit (`routes/admin/staff.ts`, `routes/admin/audit.ts`, `WEB/admin/staff/`, `WEB/admin/audit/`)

- `GET /v1/admin/staff`, `POST /v1/admin/staff` `{email, role}`, `PATCH /v1/admin/staff/:id` `{role}`, `DELETE /v1/admin/staff/:id`.
- The last-owner check locks the owner rows `for update` inside the transaction that changes them; here the route owns the transaction, so the lock holds.
- `GET /v1/admin/audit?staff&kind&person&cursor`, 30 days by default. `GET /v1/admin/audit/facets` answers what the filters offer: the staff and the kinds the log holds.
- *Added 2026-10-06, going-public 17c.* `POST /v1/admin/staff/export` and `POST /v1/admin/audit/export` `{from?, to?}` (UTC days, default the last 90) answer `text/csv`. POSTs because each writes its entry (`staff.exported`, `audit.exported` with `from/to` as the value) before reading, so AC-6 and AC-52 hold as written. The log is read through the list's own query and row mapping, keyed on the id a thousand rows at a time, and streamed. Cells go through Costs' `csvCell`. Who added a staff member is the newest `staff.added` on them at or after their row's `created_at`, the two being one transaction.

### G. Deletion (after the sections; `CA/src/accounts/delete.ts`, People's route file and page)

- `POST /v1/admin/people/:id/delete` (owner, `{email}`): disable, then `delete_after = now() + interval '24 hours'`. `POST /:id/delete/cancel` clears it.
- `account.delete`, booked for `delete_after`, re-checks the mark and runs `destroyAccount(id)`:

| Step | What | How |
| --- | --- | --- |
| 1 | Anything at the transcription company | enqueue `voice.forget` for each blob of theirs with a `provider_ref`; the job re-books itself an hour later until none remain |
| 2 | Google's grant | revoke each connection's token at Google, best effort, logged by outcome only |
| 3 | Threads nobody else is in | the existing last-member delete path, which also calls `deleteNotesForThread` |
| 4 | Their private files | soft-delete blobs of theirs not carried by content in a thread that survives, with `purge_after = now()`, and enqueue `blob.purge` |
| 5 | Account-scope `blob_keys` | delete where `scope = 'account' and scope_id = id`; nothing cascades these |
| 6 | Account-scope notes and chunks | delete where `subject_id = id` for account and person scope |
| 7 | The row | `delete from accounts where id = ...`, which cascades identities, sessions, staff, keys, memberships, conversations, messages, questions, activity, connectors and their secrets, push tokens, connections, requests, blocks, shares, proposals, suggestions, turn sources, jobs, limits and hits |
| Detached by the row's delete | `content.account_id`, `notes.account_id`, `blobs.account_id`, `llm_usage.account_id`, `lookups.account_id`, `threads.created_by_account_id` | set null |
| Kept | `staff_audit` rows, by id; product events, now tied to no account because the subject id went with the row | no foreign key |

- AC-15's test seeds one row in every table in the foreign key list (fact sheet section 7), deletes, and asserts gone, null or unchanged per row of this table. It is the test that tells a hard delete from a soft one.
- The existing waitlist removal stays a soft delete; it only ever touches `waitlist` accounts, which have nothing to destroy.

## Privacy page and consent

Section G's change edits `privacy/page.tsx` with the owner's approved wording, moves `UPDATED` and `CONSENT_VERSION` together, and updates `apps/web/test/map-privacy.test.ts`, which pins both literals. There is no re-consent flow; a bump affects new first runs only, as today.

## Edge cases

- **Two instances.** The heartbeat upsert, the rollup upsert and the alert state's primary key make every timer safe on more than one Core API instance.
- **A deploy** produces a gap under two minutes and no incident.
- **The Core API down** writes no web or database checks either, so all three show the same gap. The page says the web and database rows are the Core API's view.
- **An override set while the global value moves:** the override stands; the page shows both.
- **Platform cap set to a value already exceeded:** refusals start within 20 seconds, and the alert fires once.
- **A retry of a job whose account was deleted:** the job went with the account; the route answers 404.
- **Delete of an owner's own account, the last owner, or staff by support:** refused in the route.
- **Cancel after the job has begun:** the job checks the mark inside its transaction; a cancel that lost the race answers that the account is gone.
- **A setting row of the wrong shape:** reads as the default and the page marks it.
- **An unpriced model in the ledger:** already priced at the dearest; Costs shows the model's own name.

## Dependencies

None new in `package.json` or `pyproject.toml`. Three optional environment variables for billing, one Railway-provided variable for the commit.

## Appendix: billing interfaces to try

Written 2026-10-03 by section C, and updated the same day once the owner supplied keys. **Railway has been called and has a puller.** Every other candidate is unverified or was refused, as its row says, and stays metered or fixed.

What "today" means in the table:

- **metered**: the ledger prices its calls and the figure is summed at read time.
- **metered, not recorded**: the company charges by use and offload writes no ledger row for it, so the row reads *not recorded* until an owner types an amount.
- **fixed**: a subscription. An owner types the monthly amount under Subscriptions on Limits.

| Company | Slug | Today | Candidate interface, unverified | Key the puller would read |
| --- | --- | --- | --- | --- |
| Anthropic (the model, and the searches and page reads it runs as server tools) | `anthropic` | metered: `llm_usage` less transcription, plus `lookups` | The organisation cost report in the Admin API. Tried 2026-10-03 with an ordinary key: 403, *Missing permissions*. It needs an admin key, which an individual Console account cannot create; skipped by the owner for now. | `ANTHROPIC_ADMIN_KEY` |
| Google Cloud, for Maps Platform | `google-maps` | metered, not recorded | None over a plain key. Real cost is only in a BigQuery billing export, which is a new dependency and the owner's call. The Cloud Billing API answers prices and account state, not what was spent; unverified. | none proposed |
| Google Workspace | `google-workspace` | fixed | None known. Invoices are in the admin console. | none |
| AssemblyAI | `assemblyai` | metered: `llm_usage` where `model = 'assemblyai'` | None known. If the account API turns out to report spend or balance, try it; unverified that one exists. | `ASSEMBLYAI_BILLING_KEY`, only if an interface is found |
| Voyage AI | `voyage` | metered, not recorded | None known. Usage is on the dashboard. Cheaper to fix first: write a ledger row per embed call so it becomes metered. | none |
| Web search | none of its own | on Anthropic's row | Not a separate company in this build: search and link reading are Anthropic's server tools (`stack.md`, and the privacy page's section 5), so they are on Anthropic's bill. | none |
| Resend | `resend` | fixed | None known for billing. | none |
| Expo (push, and EAS builds) | `expo` | fixed | None known for billing. | none |
| Railway | `railway` | **billed**, since 2026-10-03 (`CA/src/billing/railway.ts`, fixture `CA/test/fixtures/billing/railway.json`) | Called for real on 2026-10-03 with a workspace token. `workspace(workspaceId).customer` answers `invoices` (period, status, `total` in whole cents), `billingPeriod` and `currentUsage` (dollars so far in the running period). `me` is refused to a workspace token; `projects` gives the workspace id. Periods run from the 30th, so an invoice is filed under the month most of its period is in. The bill is the whole workspace's, which also holds a project that is not offload. `usage` and `estimatedUsage` answer CPU, memory, disk and network in units, per project, and no money. | `RAILWAY_API_TOKEN` |
| Cloudflare (R2 and DNS) | `cloudflare` | fixed | Tried 2026-10-03 with an account-owned token that verifies as active: `/accounts/{id}/billing/profile`, `/accounts/{id}/subscriptions` and `/user/billing/history` all answer 403, *Authentication error*. Not yet tried with a user token carrying Account, Billing, Read. | `CLOUDFLARE_BILLING_TOKEN` |
| Apple Developer | `apple-developer` | fixed | None. A yearly fee, typed as a twelfth of it. | none |
| Google Play | `google-play` | fixed | None. A one-time fee, so nothing a month unless the owner wants it spread. | none |

How a puller is added, once a key exists:

1. Call the interface by hand with the billing-read key and save the raw response under `CA/test/fixtures/billing/<slug>.json`, with the key and any account id removed.
2. Write the test first: it loads the fixture, asserts every key the puller reads is a key the fixture has, and asserts the month and amount it produces. See it red.
3. Write the puller in `CA/src/billing/<slug>.ts` behind `Puller`, reading its key from the environment and sending the key and the date range only. Register it in `pull.ts` with its variable's name.
4. Add the variable to `env.ts` as optional. Unset, the puller never runs, so a local server never calls out.
5. Replace that company's row here with what the interface answered, and the date.
