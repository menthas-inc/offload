# 034 The admin panel

**Status:** drafted 2026-10-03 from the owner's list (people, system, health, background jobs). Revised the same day with the project-lead, security and client reviews and eight answers from the owner: support sees metadata only; health is read from our own Postgres; Limits makes today's caps editable and a cap means stop; owners are emailed when something goes wrong; the platform cap refuses everybody; only an owner deletes, with a 24 hour hold; the full scope stays; and cost rows stay attached while an account exists and are kept with nobody attached after.
**Surfaces:** the web's `(admin)` route group and the Core API. The agent worker gains a heartbeat and reads three switches. The backup service records its runs. No phone work; the phones keep working unchanged.
**Depends on:** 002, the waitlist, promotion and the staff table; the ledger (`llm_usage`, `lookups`); the job table; 022, shared threads, for what deleting an account leaves behind; 024, the mailer.
**Design:** `ui_kits/admin_web` draws Waitlist, People, Staff, Costs and Limits, and those pages follow it except where this spec lists a divergence. A person's page, Health, Audit and overrides have no mock and are built from the same `A.jsx` vocabulary. **Every divergence listed under Design divergences gets its own entry in the design decisions**, written in the merge session, because that folder is shared state.
**Amends:**
- `budget.ts` and the other cap constants: defaults behind settings.
- `WEEKLY_BATCH`: read from Limits.
- `llm_usage.account_id` and `lookups.account_id`: nullable, `on delete set null`, for the reason 0018 gave for content.
- `jobs`: an error code from a closed set, and the Core API's runner reclaims a stale lock as the worker already does.
- `app_settings`: a typed registry of keys, readable by the worker.
- Migration 0018's closing note, which says content whose author is gone can be deleted by nobody: OFF-3 as amended holds, and the code already follows it (`threads/access.ts`). This spec is the first that can produce such a row, so a test pins it.
- OFF-6: the panel has no eight-second Undo. Recorded in `docs/tech/decisions.md` with the reason in section 0.
- The kit: listed under Design divergences.
- **The privacy policy**, listed line by line under Privacy page, and shown to the owner before any code touches it.

## Why

offload is deployed, invite only, and run from a terminal. Letting somebody in has a page; everything else is a query somebody has to remember how to write. Disabling an account, answering "why did my dump not land", seeing what yesterday cost, raising one person's cap, noticing the nightly pass did not run: none has a screen, and three have no code at all. The daily cap is a constant, so changing it is a deploy. Deleting an account is promised on the privacy page and nothing does it.

Support is one person today and will be several. The panel is how they do the job without database access, and how the owner sees the whole system at a glance.

## What

### 0. Rules every page follows

- **Two roles.** Support sees what one account is doing and what it costs. An owner also sees what the platform costs and what the system is doing, and changes what is allowed. Support gets Waitlist, People and a person's page; an owner also gets Health, Costs, Limits, Staff and Audit. Support does not see owner pages in the nav and their routes answer 404. The check is a rank over an ordered list of roles, applied once to the whole `/v1/admin` prefix and again to the owner group, so a route nobody remembered to guard is refused.
- **No content, anywhere.** The panel never shows a dump, a reply, a title, a note, a transcript, a file's name or where it was taken, a thread's name, a label's name, a place, a search query, an address a turn read, a calendar's name or anything on one. A person is their name and their address. Everything else is a count, a kind, a time, a cost or an outcome. The impl-spec names the columns this rules out, one by one.
- **No credential, ever.** No session token, provider token, connector secret, push token or key leaves an admin route. Every admin query names its columns.
- **An error is a code.** Jobs gain an error code from a closed set, written when a job fails. The panel shows the code. The free-text error is never read by an admin route.
- **Where figures come from:** the job table, the ledger, the lookups, and the tables this spec adds. No admin route reads the product events, which are pseudonymous on purpose.
- **Every staff write is recorded** in the audit log, in the same transaction. An entry names accounts by id, never by address.
- **No read changes anything.** Every write is a POST, PATCH or DELETE.
- **Money is dollars**, to the cent, from the ledger. Costs says what is on it: everything the ledger records per call, not hosting.
- **Ranges.** Every plot offers 24 hours, 7 days, 30 days and 90 days, kept in the address so a link lands on the same view. Plots are in UTC days and say so; caps are rolling 24 hours and say so.
- **Plots** draw one series each, in ink, with the attention colour for the one state that needs somebody. A split is small multiples on one scale or a table with a share bar. No legend, no entry animation. Every figure is reachable as text and by keyboard.
- **Irreversible actions ask first**, in the kit's confirm dialog, which says what happens. Delete needs the address typed back. There is no eight-second Undo in the panel: these are staff acting on purpose and the confirmation is the safety net.
- **Nothing here emails the person.** If they should be told, support writes to them.
- **The panel calls no model.**
- **The panel is light**, pinned, until a dark one is designed.

### 0.1 States every page has

- **Loading:** one spinner for the page, never one per section, and no skeleton.
- **A failed read** says *Couldn't load people.* beside *Try again*. It is never drawn as an empty list.
- **Empty** is a short line with no zero: *No dead jobs.* *Nothing has been refused in 30 days.* *No account matches that.* The page keeps its tools.
- **A section that failed** on a page that loaded says so in its own place and the rest stays.
- **A failed write** puts the screen back and says what did not happen, in one clause: *That did not go through. Nobody was invited.*
- **As of:** every page of figures says when it was read and offers a refresh.
- **A role that changed elsewhere:** support opening an owner page lands on Waitlist, not outside the panel.
- **Every control has a 44px hit area**, whatever size it is drawn at.

### 0.2 The nav

Two blocks with a gap and no labels: Waitlist, People; then Health, Costs, Limits, Staff, Audit. Support sees the first block only. Waitlist carries its count of people waiting; Health carries a count when something is wrong (dead jobs, services down, a late backup) and nothing when all is well. Every glyph comes from the vendored icon set. An owner lands on Health, support on Waitlist.

### 1. Waitlist

Built by 002, with three additions.

- **Invite by address:** a button in the pane head opens a one-field dialog. The address is invited at once, whether or not it was waiting. Same promotion, same email. A malformed address is refused; an active one answers *already in*.
- **The stats row** the kit draws and 002 left out: waiting, invited this week, signed up, weekly batch.
- **The weekly batch** is read from Limits, and the sub line says it.

### 2. People

The kit's page. Every account that has signed in at least once.

- **The list:** name and address, signed in with, threads, joined, last active, spend over 30 days, state. Search by name or address. Filter by everyone, active, disabled. Sort by joined, last active or spend.
- **The stats row:** accounts, used it this week, disabled, average spend per account over 30 days.
- **A row is a link** to the person's page. Its buttons act without opening it.
- **Disable** signs the account out everywhere and refuses new sign-ins. Nothing is deleted. Threads they share stay readable to the others. offload stops working for them in the background: no nightly pass, no digest, no push, no calendar sync, no mail in. One rule decides this for every scheduled job, not one check per job. Reversible from the same row.
- **Enable** puts them back as they were.
- **Delete, owner only.** On confirm the account is signed out and locked exactly as disable does, and marked for deletion. **Twenty four hours later it is destroyed.** In between, the row says when, and an owner can cancel, which leaves the account disabled. Support does not see Delete.
- **What destruction removes:** the account itself; its keys, which is what makes its files unreadable; the threads nobody else is in and everything in them; its notes, conversations, questions and activity; its files, from storage too; its connected calendars, with offload's access revoked at Google; anything still held at the transcription company; its sessions, sign-in identities and devices; its connections, requests and blocks; and the identifier that ties product events to it.
- **What destruction leaves:** what they put into a thread other people are in, with no author, which the remaining members may then edit and delete. A file filed into a shared thread stays with it. Cost rows, with nobody attached, so a month's total never changes when somebody leaves. Audit entries, naming the account by id.
- **Guards:** support cannot disable a staff account. Nobody can disable or delete themselves. The last owner cannot be disabled or deleted. A guarded action is not drawn, and is refused if asked for anyway.
- **Not here:** correcting somebody's address. It is a manual job for now.

### 3. A person

New. One account, for troubleshooting, with nothing they wrote on it. At `/admin/people/<id>`, under a single back link that always says People.

- **Who:** name, address, state, joined, who invited them when the audit log knows, first sign-in, last active, what they sign in with, country, time zone, consent version.
- **Today:** what they have used against each cap in the last 24 hours, and whether they are at a limit now.
- **Limits:** each per-person cap with the global value and their override, if one is set, who set it and when. An owner sets or clears one; support sees it. An override may be higher or lower, inside the setting's own bounds.
- **Plots:** cost per day, and activity per day (turns, photos, voice notes, mail in).
- **What they have:** how many threads, alone and shared; how much they have dumped; notes; connections; files and their total size; calendars connected and whether the last sync worked; devices registered for push, by platform; how many sessions are live and when the latest was last used. Counts only. No calendar's name, no second address, no IP.
- **What happened:** their recent turns and jobs, newest first: when, kind, state, attempts, how long, model, tokens, cost and error code. A filter for failures only. It goes back 30 days, which is how long jobs are kept, and says so.
- **Limit hits:** each time a cap refused them, for 30 days.
- **Actions:** disable or enable; sign out everywhere, which ends their sessions and leaves the account active; retry on a dead job of theirs; and for an owner, delete.
- **Opening this page is recorded**, once per staff member, person and day, by a write the page makes after it loads.
- **A deleted account's page** is its head only: *This account was deleted on 12 September*, its audit entries, and nothing else.

### 4. Costs

The kit's page, plus trends. Owner only. Money lives here; volume and latency live on Health.

- **The stats row:** spent this month, on pace for, per account, last month. On pace is measured against the monthly budget figure on Limits, in the attention tone when over. With no figure set the note is absent. In the first two days of a month it says *too early to say*.
- **Daily spend** as bars. A day the platform cap was reached is in the attention colour. With no cap set, every bar is ink and the caption says the cap is off.
- **Where it goes:** spend and calls by the job being paid for, named for what it does. The same by model and by vendor. A job kind the panel has no name for shows its kind.
- **Trends:** spend, calls and tokens (in, out, cache read, cache write) per day, as small multiples, by job or by model.
- **Usage:** accounts active per day, and turns, photos, voice notes and mail in per day.
- **Heaviest accounts** in the range, each a link to the person.
- **Export CSV:** the daily figures by job and model. No account in the file, and no cell that a spreadsheet would run as a formula.

### 4.1 What offload really costs

Added 2026-10-03 at the owner's ask. The ledger is offload's own estimate of metered calls. This is the bill: every company offload pays, by month, in one table at the top of Costs.

- **One row per company:** the model, Google (maps, and the Workspace), transcription, embeddings, search, mail, push and builds, hosting, file storage and DNS, and the two developer programmes. One total per month, and the last twelve months as bars.
- **Each row says where its number came from**, because the three kinds are not equally true:
  - **Billed:** pulled from the company's own billing or usage interface, daily, with a key that can read billing and nothing else.
  - **Metered:** no such interface, so the figure is the ledger's.
  - **Fixed:** a subscription. An owner types the monthly amount once, on Limits, and it stands until changed.
- **Billed beside metered:** where a company has both, the row shows the ledger's figure next to the bill and the difference. A gap is the finding: either the ledger is mispricing a call or something is spending that the ledger never sees.
- **Which companies are billed and which are metered is decided by calling each interface, not by reading its documentation**, and the impl-spec records what each one answered. A company whose interface turns out not to exist is metered or fixed, and says so.
- **A pull that fails** keeps the last figure, says when it was read, and is a late job on Health like any other.
- **The month in progress** is marked as not final.
- Nothing about a person is sent to or read from any of these. The keys are the owner's to create and to put on the Core API; the panel never shows one.

### 5. Limits

The kit's page, narrowed. Owner only. A cap means stop, as it does today: the next turn is refused and what was already dumped is safe.

- **The stats row:** spent in the last 24 hours against the platform cap, the platform cap, per person spend, per person turns.
- **Per person, in any 24 hours:** model spend ($5), turns (100), photos (200), photo bytes (500 MB), voice notes (100), voice minutes (60), mail in a day (100) and mail in an hour (30). The values in brackets are today's and become the defaults.
- **The platform, in any 24 hours:** one spend cap for everyone together. **Off until an owner sets it, and off is not zero.** When it is reached, every account is refused its next turn exactly as its own cap refuses it, and scheduled model work is not booked. Work already running finishes. Both resume when spend falls back under.
- **Monthly budget:** a figure, not a cap. Nothing enforces it; Costs measures the month against it.
- **Waitlist batch, per week** (25).
- **Switches:** the web's map, the map, web search, reading links, the nightly pass. Off stops the path for everyone within seconds. A person's own setting for search and links is untouched and still shows what they chose; the page says the switch overrides it while off.
- **Saving** is one save for the page. It shows each change as old to new, refuses a value outside its bounds on that field and saves nothing, and takes effect everywhere within 20 seconds. If another owner saved first, it says *Someone else changed this*, shows the current values and overwrites nothing. Each setting can be put back to its default. One audit entry per setting changed.
- **A stored value that makes no sense reads as the default.** A cap can never quietly stop existing.
- **What has been hit:** the last 30 days of refusals: which cap, who, when, how many times that day, and whether it was the person's cap or the platform's.

### 6. Health

New. Owner only. One page with three views in the pane head: **Now**, **Jobs**, **Calls**.

**Now**
- **Services:** Core API, the worker, the web, the database. For each: up, late or down now; uptime over the range; when it last started and which commit it runs. The Core API and the worker report themselves every minute. The Core API checks the web and the database every minute and records what it found. A service that has never reported says *no heartbeat yet*, not down. A restart inside two minutes is not an incident.
- **Incidents:** each stretch a service was down: began, ended, how long.
- **The queue:** how many jobs are waiting now by priority, how old the oldest is, how many are running; and over the range, how long jobs waited and how many finished, failed and died.
- **Backups:** when the last one finished and how big it was; late past 26 hours. The backup is a nightly run, not a service, so it has a last run and no uptime.
- **When all is well** the view says so in one line at the top.

**Jobs**
- **Background jobs**, one row for every job that runs on a schedule and not because a person asked: what it does in one line, its schedule, its last run (when, how long, outcome), its next run, and runs and failures over the range. Opening a row shows its volume per day. A job that did not run when it was due is marked late. The nightly pass also shows, per night, how many passes were booked, finished and failed.
- **Stuck:** jobs that have been running longer than their kind should take.
- **Dead jobs:** every job that ran out of attempts: kind, when, attempts, error code, and the person as a link when it has one. **Retry** gives it one more attempt, once; it is refused for an account that is disabled or over its cap. **Dismiss** takes it off the list and keeps the record.

**Calls**
- **Model calls:** calls, failures, and latency (median and 95th) per job per day.
- **Vendors:** for each company offload calls (the model, transcription, embeddings, search, maps, the calendar, mail, push, file storage): calls and failures over the range, from what offload already records. A vendor offload records nothing about says *not recorded*, never a zero.

**History** is kept as hourly counts for 90 days, with no account in it, so the plots outlive the job table's 30 days. Where history is shorter than the range, the plot says when it starts.

### 7. Alerts

Every owner gets one email when:

- the platform cap is reached;
- a service has been down for five minutes, and one more when it is back;
- a scheduled job is late, or a job dies;
- the backup is late.

One email per condition until it clears, and at most ten a day; the tenth says alerts are paused until tomorrow.

**And one, outside that limit, whenever staff do something that cannot be quietly undone:** an account marked for deletion, a deletion cancelled, staff added, a role changed, staff removed. It names what was done, who did it and the account's id.

Every alert uses the existing mail shell, links to the panel at offload's own address, and carries no content and nobody's name or address but the staff member's. **What this cannot do:** mail is sent by the Core API, so when the Core API is down nobody is told until it is back. Accepted; an outside probe is the fix and is out of scope.

### 8. Staff

The kit's page. Owner only.

- **The list:** name, address, role, added, last here.
- **Add someone** by address, as support or owner. They must already have an active offload account **that signs in one way only**: an account with both Apple and Google linked is refused, and the page says to use one that has one. Adding sends no email: *They sign in with Apple or Google on this address. Nothing is emailed, so tell them yourself.*
- **Switch a role** in place. **Remove** with a confirmation: they lose the panel on their next request, and their own offload account is untouched.
- **Guards, stated on the page:** there is always at least one owner; nobody changes or removes their own role.
- **The roles table** says what each can do, as section 0 does.

### 9. Audit

New. Owner only.

- Every staff write, newest first: when, who, what, on which account or setting, and old to new for a setting. The last 30 days by default.
- **Kinds:** invited, resent, removed from the waitlist, disabled, enabled, deletion scheduled, deletion cancelled, deleted, signed out, override set or cleared, setting changed, job retried or dismissed, staff added, role changed, staff removed, and a person's page opened.
- Filter by staff member, by kind and by person. An entry about a live account links to it; one about a deleted account is plain text.
- **Entries cannot be changed or removed**, by the panel or by the application: the database refuses it. They are kept for two years.

## Privacy page

Wording goes to the owner before the code. What changes, by section of the page:

- **Section 12, who can reach production** (today: *they read your content when you have asked for help or when a specific fault requires it*): two sentences. What support sees through the panel: who you are, how much you use offload, what it cost and what failed, and nothing you put in or offload wrote. And that reading content needs direct access to the database, which support does not have, and happens only when you asked or a specific fault requires it.
- **Section 12, where content never goes:** the list gains the support panel, its exports and its alert emails.
- **The opening promise and section 10 on deleting an account:** true for the first time. A deletion done for you by staff takes up to a day to leave the live systems, then 30 days for the backups. The shared-thread exception stays as written.
- **Section 13's dated note** that the controls are not built **stays**: deleting your own account from Settings is still out of scope, and it is still done by writing to offload.
- **Sections 3, 4 and 10 gain three records:** what each request to a model cost (the model, how much it read and wrote, the price, how long it took), kept while you have an account and kept with nobody attached after; each time a limit refused you, kept 30 days; and a record of which staff member opened your account's page or changed something on it, kept two years.

## Design divergences, one decisions entry each

1. Dollars, not pounds.
2. Weekly batch is 25.
3. Caps are rolling 24 hours, not reset at midnight.
4. *When a cap is reached* is gone; stop is the only behaviour.
5. *Warn at* is gone.
6. The per-person monthly cap is gone; a monthly budget figure replaces it.
7. Alerts go to every owner; no editable list, no Slack.
8. Limits gains switches, photo bytes and voice minutes.
9. Limits' save shows old to new and handles a conflict; *Discard* becomes *Cancel*.
10. *What has been hit* loses *What we did* and gains a count and a scope.
11. Delete is owner only, with a 24 hour hold and a cancel; its copy says notes, not memories.
12. People rows open a person's page, and gain Joined.
13. Waitlist gains invite by address.
14. Staff: any address with one sign-in; no email on adding.
15. Costs gains trends, usage, by model and by vendor; its sub line changes; the cost row *Memories* is *Notes*.
16. A person's page, Health, Audit and overrides are new.
17. The roles are redrawn: owner pages are no longer only about money.
18. Plots are ink, not moss, with one series each.
19. The panel is pinned light.
20. No eight-second Undo in the panel; its toast is four seconds.
21. Already built and unlogged: the floating confirm pill stays for a bulk selection only, and section labels move to the kit's.

Two tokens are requested with them: a solid danger surface, and a plot height.

## Acceptance criteria

**Access**
- **AC-1** Someone signed in who is not staff gets 404 from every `/v1/admin` route, and the web sends them to `/`.
- **AC-2** Support gets 404 from every Health, Costs, Limits, Staff and Audit route, from setting or clearing an override, and from delete and its cancel. Their nav shows Waitlist and People only.
- **AC-3** A test walks the registered route table and fails on any `/v1/admin` route that does not carry the staff check at the right rank.
- **AC-4** No admin output contains content. A test seeds an account with a mark in every column the impl-spec rules out, calls every admin route, read and write, builds the CSV, renders every alert email and reads the audit log, and finds the mark in none.
- **AC-5** No admin output contains a credential. The same test seeds a session token, a provider token, a connector secret and a push token and finds none.
- **AC-6** No GET under `/v1/admin` writes anything.

**States**
- **AC-7** Each page shows one spinner while loading, *Couldn't load* with *Try again* on a failed read and never an empty list, and an empty line with no zero.
- **AC-8** Every nav entry resolves to a vendored icon, and every control in the panel has a 44px hit area.

**Waitlist**
- **AC-9** Invite by address promotes an address that is waiting and one never seen, with one invite email each. An active address answers already in. A malformed one is refused.
- **AC-10** Invite the next N uses the Limits value, and the stats row matches the accounts table.

**People**
- **AC-11** The list returns signed-in accounts with the columns in section 2, pages by cursor, searches name and address, filters by state and sorts by joined, last active and spend.
- **AC-12** Disable ends every session, refuses a new sign-in the way an uninvited one is refused today, and no scheduled job is booked for the account while it is disabled: digest, push, calendar sync, nightly pass or mail in. Their shared threads read the same for other members.
- **AC-13** Enable restores sign-in and scheduled work.
- **AC-14** Delete is refused unless the caller is an owner and the address typed matches. On confirm the account is locked and marked, and nothing is destroyed for 24 hours. Cancel inside that time leaves it disabled and whole.
- **AC-15** After destruction, a test that seeded every table the impl-spec's destruction list names finds: the account row gone; every row marked destroy gone, including keys, connector secrets and push tokens; the files gone from storage; a forget booked for anything held at the transcription company before its file was removed; rows marked detach present with no account or author; rows marked keep unchanged.
- **AC-16** A thread whose last member was the deleted account is deleted with it. Content it left in a shared thread can then be edited and deleted by a remaining member.
- **AC-17** Support cannot disable staff. Nobody can disable or delete themselves. The last owner cannot be disabled or deleted. Each is refused server-side.

**A person**
- **AC-18** The page returns the fields in section 3, and usage against each cap matches what the cap itself computes.
- **AC-19** An owner sets an override and the account's next check uses it within 20 seconds; clearing returns it to the global value. A value outside the setting's bounds is refused.
- **AC-20** The timeline lists the account's jobs with kind, state, attempts, duration, model, tokens, cost and error code, pages by cursor, and filters to failures.
- **AC-21** Sign out everywhere ends every session and leaves the state active.
- **AC-22** Opening the page writes one audit entry per staff member, person and day. *Changed 2026-10-04: written by the reads themselves, every `GET /v1/admin/people/:id` and the reads under it, and no longer left to a POST the page makes. An entry the client chooses to send is one a staff session can skip by asking for the JSON directly, and the privacy page says opening a page is recorded. The POST stays for a page that still sends it.*
- **AC-22a** *Added 2026-10-04, going-public 17b.* The panel has a session of its own. Every route under `/v1/admin` asks for a pass bound to the staff session it came in on; `POST /v1/admin/session` hands one, good for twelve hours, to a staff session that signed in within the last ten minutes, and tells an older one to sign in again. Staff without the pass are answered 401 `locked`; anybody else is still answered 404.
- **AC-23** A deleted account's page returns its head and its audit entries and nothing else.

**Costs**
- **AC-24** Month to date, last month, per account and on pace match the ledger for a seeded month, with model calls and search fees both counted, and with rows that have no account counted.
- **AC-25** Spend and calls by job, by model and by vendor each sum to the range's total.
- **AC-26** Each trend returns one point per UTC day in the range, zero on a day with nothing.
- **AC-27** Heaviest accounts are ordered by spend in the range.
- **AC-28** The CSV has one row per day, job and model, sums to the page's total, contains no account id, name or address, and escapes a cell that begins with `=`, `+`, `-` or `@`.

**What offload really costs**
- **AC-56** The table has one row per company with a monthly figure and its source: billed, metered or fixed. The month's total is the sum of its rows.
- **AC-57** A billed row matches what the company's interface returned for a recorded response, is refreshed daily by a scheduled job that Health lists, and keeps its last figure with its read time when a pull fails.
- **AC-58** A fixed amount is set on Limits by an owner, audited, and used for every month from the one it was set in. A row with both a bill and a ledger figure shows the difference.
- **AC-59** No billing key appears in any admin output, and a pull sends nothing but the key and a date range.

**Limits**
- **AC-29** Every cap in section 5 is read from its setting, falls back to today's value when unset, and a change is enforced within 20 seconds without a deploy.
- **AC-30** A person's override beats the global value, for each per-person cap.
- **AC-31** With the platform cap reached, a new turn from any account is refused with the same answer its own cap gives, plus a field saying the platform's cap did it, and scheduled model jobs are not booked. Under the cap again, both resume. Off, nothing changes, and off is not the same as zero.
- **AC-32** Each switch stops its path within 20 seconds in the Core API and in the worker, and on restores it. A person's own setting is unchanged by it.
- **AC-33** An unknown setting is refused. A value outside its bounds is refused with the bounds named and nothing is saved. A stored value of the wrong shape reads as the default. Reset returns the default.
- **AC-34** A save made against values another owner has since changed is refused and changes nothing.
- **AC-35** Every refusal by a cap is recorded with its scope, and What has been hit lists them by cap, person and day with a count.

**Health**
- **AC-36** The Core API and the worker each write a heartbeat a minute, carrying their commit and start time, and the Core API records a check of the web and the database each minute. A heartbeat cannot be written from the public address.
- **AC-37** A service with no heartbeat for three minutes reads down, the gap appears as an incident with its start, end and duration, and uptime over a range is the share of minutes with one. A gap under two minutes is not an incident.
- **AC-38** The queue figures match the job table: waiting by priority, oldest age, running; and the range's waits, finishes, failures and deaths.
- **AC-39** Every scheduled kind in the codebase has a row with its schedule, last run, next run and counts. A test fails when a scheduled kind has no row.
- **AC-40** A scheduled job that has not run by its due time plus its grace is marked late. A job running past its kind's limit is listed as stuck, and the Core API's runner reclaims a lock its owner abandoned.
- **AC-41** Every failed job carries an error code from the closed set, from both runners. Dead jobs list with it.
- **AC-42** Retry gives a dead job exactly one more attempt and works once per job. It is refused for a disabled account and for one over its cap. Dismiss takes the job off the list and keeps its row.
- **AC-43** Model calls, failures and latency per job per day match the ledger. Vendor calls and failures match their sources, and a vendor with no source reads as not recorded.
- **AC-44** The backup records each run's finish and size, and reads late past 26 hours.
- **AC-45** Hourly history has no account column, and a plot over 90 days is the same before and after `jobs.purge` runs.

**Alerts**
- **AC-46** Each condition in section 7 sends one email to every owner and no second one until it has cleared. A service coming back sends one.
- **AC-47** No more than ten condition alerts go out in a UTC day, and the tenth says so. Staff-action alerts are sent regardless.
- **AC-48** Marking for deletion, cancelling one, adding staff, changing a role and removing staff each send one email to every owner.
- **AC-49** An alert's links are built from the configured web address, never from the request.

**Staff**
- **AC-50** An owner adds an active account as staff, switches a role and removes someone, and each takes effect on that person's next request.
- **AC-51** Adding an address with no active account is refused. Adding an account with more than one sign-in identity is refused, by the route and by the database. Demoting or removing the last owner, or yourself, is refused server-side.

**Audit**
- **AC-52** Every write route under `/v1/admin` produces its audit entry in the same transaction: one per write, and one per setting changed for a Limits save. A test walks the route table and fails on a write route with none.
- **AC-53** No audit entry contains content or an address. A setting change records old and new.
- **AC-54** An update or a delete of an audit entry is refused by the database. Entries older than two years are removed by the daily purge and by nothing else.

**Privacy page**
- **AC-55** The page carries every change listed under Privacy page, section 13's note is still there, and the consent version moves, in the same change that ships the panel.

## Out of scope

- Reading anybody's content, and signing in as them.
- At-cap behaviour other than stop; a monthly cap; a warning threshold.
- An outside uptime probe, push alerts, Slack.
- A second sign-in step before a destructive action. The hold, the owner-only rule and the email to every owner are the controls for now; it is a line for `going-public.md`.
- Billing, refunds, plans.
- An email composer, and an email to a new staff member.
- Correcting an account's address.
- Exporting a person's data for an access request. Manual, and a line for `going-public.md`.
- Deleting your own account from Settings. This spec builds the deletion; the button is a small later spec.
- A dark panel.
- The phones. They keep reading the refusal they already know.

## How it is built

1. **Groundwork, one session:** every migration; the settings registry and the resolver that reads a cap for an account; the audit helper and the prefix guard; error codes in both runners; heartbeats; the one rule for whether an account gets scheduled work; the shared web pieces (table, stat row, plot and range picker, confirm dialog, field with bounds, status pills, loading, failed and empty states, the hit area); the nav with all seven pages stubbed; and one route file per section.
2. **Six sections in parallel:** People and a person (without delete); Costs; what offload really costs; Limits; Health and alerts; Staff and Audit.
3. **Deletion, on its own,** after the sections, with the privacy page.
4. **The merge:** the tests that cross sections (AC-3, AC-4, AC-5, AC-39, AC-52), the design decisions entries, and a review.

Nothing in this spec reaches a prompt, so OFF-8 does not apply.
