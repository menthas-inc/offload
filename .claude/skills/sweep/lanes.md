# The review lanes

One section per lane. A reviewer reads its own section whole, plus the focus the
lead passed it, and reviews the commit named as **reviewed**, not the working tree.

Every lane returns two things:

- **checked**: what it looked at and found sound, one line each with the file or
  query it rests on. A tick means read, not skimmed. This is half the report: the
  next sweep starts from it, and "found nothing" with no checklist is not a result.
- **findings**: each with a severity, the file and line it was verified at (the file
  alone for something missing), the evidence (the lines, the query, the request),
  a concrete failure scenario, the fix, the test that would go red first, and
  whether it is an **owner call** (see SKILL.md). Where `git log -S` or blame can
  say which merge or spec introduced it, say so: that is how the report measures
  what the harness lets through.

Severity: **critical** is data exposed across accounts, content lost, or a
production outage. **high** is a person-visible defect on a main path, a security
weakness with a plausible path, or a public claim that is untrue. **medium** is a
defect on a side path, a missing test on risky code, or debt that is already
causing defects. **low** is everything else worth a line.

Read-only: no lane edits a file, runs a migration, starts a server or runs a suite
against a shared database. Queries go to `offload_sweep` only.

## seams-data

The server side of the space between features: the database, the API and the worker.

- Every table and column added since the base is covered by each thing that has to
  know about every table: account deletion (`apps/core-api/src/accounts/delete.ts`
  and the purge job), export (`src/exports/`), the storage limit's byte counts, the
  readable views and predicates, the agent role's grants, the backup's restore.
- Every job kind in `src/jobs/kinds.ts` has a producer, a handler or a worker
  claimant, and an entry in the model-calls map if it calls a model. No job is
  produced that nothing claims, or claimed by both sides.
- Every internal endpoint the Python worker calls exists with the body shape it
  sends, and the reverse.
- Migrations: numbered once, applied in order, each one's objects used by the code
  that shipped with it, and no two migrations from different branches touching the
  same constraint without knowing about each other.
- Analytics events and logs added since base carry no content and match the
  per-event schemas.
- The pairs of merges in your focus: read both sides and say whether they agree.

## seams-clients

The space between the API and the three clients, and between the clients.

- Every response shape a client reads matches what the route returns now, field by
  field, for web (`apps/web`), the phones (`apps/mobile`) and the admin panel.
  Shared types in `packages/` are the contract where they exist; where a client has
  its own copy of a type, compare the copy.
- Parity: a feature merged since base behaves the same on web, iOS and Android,
  or the difference is deliberate and written in its spec.
- Routes and redirects that renamed things (`/notes` to `memories` and the like)
  still land everywhere a link points.
- Vocabulary in identifiers and copy (CLAUDE.md): no thing, folder, item, space,
  project, capture, classified in anything a person reads.
- Design: each changed screen against its kit (`.claude/scripts/find-kit.sh`,
  `kit-component.sh`, read whole). A divergence the code made without an entry in
  the design system's `decisions.md` is a finding, and so is an entry whose
  **Design system impact** is missing.

## code-core-api, code-agent, code-web, code-mobile

Line level, one lane per area: `apps/core-api`; `apps/agent`; `apps/web` with the
admin panel, `packages/` and `apps/backup`; `apps/mobile`. Start from the focus
(the risky paths that moved most), then read what they call.

- Correctness: edge cases, error paths, races, time zones, retries, idempotency,
  anything that fails open.
- Security at the line: input handling, authorization on every id a handler takes,
  injection, secrets, egress, and content reaching logs. The security lane does the
  system view; this is the line view.
- The classes CLAUDE.md lists under "Things that have already gone wrong". Each one
  that recurs is a finding and a candidate for a mechanical check.
- Tests: behaviour with no test, tests that are green for the wrong reason, stubs
  that cannot fail, timing that makes a suite flaky.
- Debt and refactoring: duplication across features, dead code, an abstraction with
  one caller, a module that grew past what one person can read. Only propose a
  refactor whose benefit you can state as a defect it prevents or a change it makes
  cheaper, and say what it costs.
- The dead-class, dead-css and dead-icons scripts, and lint and typecheck, run
  read-only in the worktree: anything they report is a finding.

## security

The `security-reviewer` persona, over the whole system as of **reviewed**.

- Every finding of `docs/tech/security-review-2026-09-22.md` that was fixed: is it
  still fixed? A regression is critical or high by the original rating.
- Everything merged since base, with the same checklist headings as that review:
  account takeover, authorization and tenancy, server and infrastructure, input
  handling and egress, prompt injection.
- `docs/tech/going-public.md`: which items are now done and which are still open.
  Do not touch production; read config through the CLIs the way the review did,
  names and lengths only, never values.

## legal

The privacy policy (`apps/web/src/app/(marketing)/privacy/page.tsx` and its
`companies/` page) and the terms
(`.../terms/page.tsx`) are claims made in public. This lane checks every claim
against the code, as of **reviewed**.

- Every company that receives content: list who the code sends content to (SDK
  calls, fetches, mail, push, maps, embeddings, transcription, model calls) and
  compare with who the page names. A recipient the page does not name is high.
- Every retention window, deletion promise, export promise and control the page
  describes: find the constant, job or route that makes it true.
- Logs, analytics and error reporting: what the page says they carry against what
  they do.
- Dated "coming" notes for things that have since shipped, and the reverse.
- The terms against the product as built: invite only, limits, the storage limit,
  account deletion, what happens to shared threads.
- `docs/tech/vendor-terms/`: the vendor terms the page relies on, and whether any
  is older than the vendor's current terms (fetch the vendor's page to check).
- The phones' store declarations where they are in the repo (privacy manifest, data
  safety) against the same facts.

Almost everything here is an owner call: report the claim, the code, and the
wording that would be true, and leave the choice of wording to the owner.

## product

The specs as a description of the product.

- Each spec built since base: its acceptance criteria against the code. A criterion
  the code does differently without the spec updated (DEV-2) is a finding; say which
  one should change.
- `tasks.md` files with open boxes for work that has shipped, or ticked boxes for
  work that has not.
- Two documents that each read fine and contradict each other, written days apart.
  This is the defect class that matters most here: name both, quote both.
- CLAUDE.md's Status line, `docs/specs/README.md` and `docs/tech/decisions.md`'s
  "Open, needing a call" against what is true now.
- Concision: specs that restate other specs, sections that describe what was
  superseded, vocabulary that has since been retired. Propose the cut as an edit.
- What the specs promise that nothing in the repo does yet, and is not marked as
  not built.

A spec edit that only brings text in line with shipped behaviour is a fix. A spec
edit that changes intent is an owner call.
