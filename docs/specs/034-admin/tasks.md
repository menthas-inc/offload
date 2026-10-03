# 034 The admin panel: tasks

Every task starts with its test, seen red for the right reason (QUAL-1). API and Web are the two tracks; there is no Mobile track. Gates for every stage, run in the worktree against its own test database: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `uv run pytest -q` and `uv run ruff check .` in `apps/agent`, and the three `dead-*.mjs` scripts.

## Stage 0. Groundwork (one session, in order)

| # | Task | Serves |
| --- | --- | --- |
| G1 | The six migrations, 0074 to 0079, and `schema.ts`. Test: the agent role reads `app_settings` and updates `jobs.error_code`; an audit row cannot be updated or deleted; a staff insert for a two-identity account raises. | AC-51, AC-54, OFF-1 |
| G2 | The settings registry, `setting`, `limitFor`, `saveSettings`. Tests: default when unset, default on a malformed value, bounds, conflict refused, override beats global. | AC-29, AC-30, AC-33, AC-34 |
| G3 | Caps read through `limitFor` at all eight call sites; the platform cap in `requireBudget`; `scope` on the 429; `recordHit`; mail in catches the turns cap. | AC-29, AC-31, AC-35 |
| G4 | `worksInBackground` and its use in the five enqueuers; the nightly switch and the platform cap at the nightly fan-out. | AC-12, AC-31, AC-32 |
| G5 | Switches in the Core API and the worker (`context.py`, `link_place.py`), with a pytest per switch. | AC-32 |
| G6 | Error codes in `fail()`, the worker and `turn-result`; stale reclaim in `claim()`. | AC-40, AC-41 |
| G7 | The admin plugin: prefix guard, rank check, owner scope, one empty route file per section, the existing waitlist routes moved. The route-table tests for AC-3, AC-6 and AC-52, red until the merge for routes not yet written, green for what exists. | AC-1, AC-2, AC-3, AC-6, AC-52 |
| G8 | `audit()` and audit entries on the existing waitlist writes and the settings write. | AC-52, AC-53 |
| G9 | Heartbeats: the Core API timer, the worker's internal route and loop, the web's `/healthz`, refused on the public host. | AC-36 |
| G10 | The scheduled registry and its coverage test; `jobs.purge` additions; `backup.sh` run record. | AC-39, AC-44, AC-45, AC-54 |
| G11 | The seeded-mark harness for AC-4 and AC-5: one fixture that fills every forbidden column, and a walker that calls every admin route. | AC-4, AC-5 |
| G12 | Web: `WEB/ui/` components, the hit-area rule, `.note` and section label fixes, light pin, the nav with seven pages stubbed and `Icon` glyphs, owner landing on Health, `useAdminRead`. | AC-7, AC-8 |
| G13 | Waitlist additions: invite by address, the stats row, the batch from Limits. | AC-9, AC-10 |

Groundwork ends with every gate green except the three route-table tests marked as expected to fail on stub routes.

## Stage 1. Six sections in parallel, one worktree and one database each

Each agent gets: this folder, its section of the impl-spec, the groundwork branch, and the rule that it edits only its own route file, page directory and test file.

**A. People and a person**
| # | Task | Serves |
| --- | --- | --- |
| A1 | API: list, stats, search, filter, sort, cursor. | AC-11 |
| A2 | API: disable, enable, sign out everywhere, with guards and audit. | AC-12, AC-13, AC-17, AC-21 |
| A3 | API: a person, usage, timeline, hits, overrides, viewed. | AC-18, AC-19, AC-20, AC-22 |
| A4 | Web: People from the kit; a person's page; every state in 0.1. | AC-7, AC-11, AC-18 |

**B. Costs**
| # | Task | Serves |
| --- | --- | --- |
| B1 | API: summary, daily, by job, model and vendor, trends, usage, heaviest. | AC-24 to AC-27 |
| B2 | API: the CSV. | AC-28 |
| B3 | Web: Costs from the kit, plus trends and usage. | AC-7 |

**C. What offload really costs**
| # | Task | Serves |
| --- | --- | --- |
| C1 | Try each candidate interface for real, record the response as a fixture, and write what each answered into the impl-spec's appendix. Needs the owner's keys; without one, that vendor is fixed or metered. | AC-57 |
| C2 | Pullers, `billing.pull`, fixed rows, the route. | AC-56 to AC-59 |
| C3 | Web: the table and twelve-month bars at the top of Costs. | AC-56 |

**D. Limits**
| # | Task | Serves |
| --- | --- | --- |
| D1 | API: settings read and save, hits, now. | AC-29, AC-33, AC-34, AC-35 |
| D2 | Web: Limits from the kit as narrowed, the save with old to new and the conflict, switches, fixed costs, what has been hit. | AC-7, AC-33, AC-34 |

**E. Health and alerts**
| # | Task | Serves |
| --- | --- | --- |
| E1 | API: services, uptime, incidents, backups. | AC-37, AC-44 |
| E2 | API: queue, `health.rollup`, scheduled jobs, stuck, dead, retry, dismiss. | AC-38 to AC-42, AC-45 |
| E3 | API: calls and vendors. | AC-43 |
| E4 | `alerts.check`, `email.alert`, the daily limit, the count on `/v1/admin/me`. | AC-46, AC-47, AC-49 |
| E5 | Web: Health's three views. | AC-7 |

**F. Staff and Audit**
| # | Task | Serves |
| --- | --- | --- |
| F1 | API: staff list, add, role, remove, guards, the staff-action alerts. | AC-48, AC-50, AC-51 |
| F2 | API: audit list and filters. | AC-53 |
| F3 | Web: Staff from the kit; Audit. | AC-7 |

## Stage 2. Deletion (one session, after stage 1 merges into the feature branch)

| # | Task | Serves |
| --- | --- | --- |
| X1 | The destruction test: every table seeded, every row of the table asserted. Red first against a soft delete. | AC-15, AC-16 |
| X2 | `destroyAccount`, `account.delete`, the two routes, the alert. | AC-14, AC-15, AC-17, AC-48 |
| X3 | Web: Delete and cancel on People and a person; the deleted account's page. | AC-14, AC-23 |
| X4 | The privacy page, with wording the owner has approved, `UPDATED`, `CONSENT_VERSION` and the test that pins them. | AC-55 |

## Stage 3. The merge (this session)

| # | Task | Serves |
| --- | --- | --- |
| M1 | Merge the sections; the cross-section tests go green: AC-3, AC-4, AC-5, AC-6, AC-39, AC-52. | those |
| M2 | Renumber migrations against main. | |
| M3 | `code-reviewer`, `security-reviewer` and `client-reviewer` on the whole diff; one commit per pass of fixes. | |
| M4 | On main: the design decisions entries (21), the two tokens, `docs/tech/decisions.md` (the OFF-6 divergence, the admin section, 0018's note), `going-public.md` (a second sign-in step, the access export). | OFF-6, OFF-7 |
| M5 | Browser check of every page, light, at phone and desktop widths, with a seeded database. | AC-7, AC-8 |
| M6 | Pull request. After deploy: confirm the commit variable, the worker's heartbeat on the private host, and the first backup run record. | AC-36, AC-44 |
