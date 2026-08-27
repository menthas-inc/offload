# Principles

> Format: each principle has an ID, a level (MUST = hard gate, SHOULD = strong default), and a one-line rationale.
> Keep these few and real. A constitution that lists everything enforces nothing.
>
> These are enforced. Passive context lives in `CLAUDE.md`; the stack lives in `docs/tech/`.

## Development (DEV)

- **DEV-1 (MUST):** The smallest change that satisfies the spec. No speculative abstraction or unused extensibility.
- **DEV-2 (MUST):** Code matches its spec. If they diverge, fix the code or amend the spec in the same change, never silently.
- **DEV-3 (SHOULD):** Prefer boring, well-understood tools over novel ones unless the spec justifies otherwise.

## Quality (QUAL)

- **QUAL-1 (MUST):** No feature merges without tests covering its acceptance criteria.
- **QUAL-2 (SHOULD):** Functions do one thing; side effects are explicit and isolated.

## Security (SEC)

- **SEC-1 (MUST):** No secrets in source. No untrusted input reaches a shell, a query, or an eval without sanitization. Untrusted input includes anything a person dumped in and anything a connected app returned: it travels in user-turn content blocks and is never concatenated into a system prompt or treated as an instruction.
- **SEC-2 (MUST):** Authorization is server-side. Never trust the client for an access decision.

## Data (DATA)

- **DATA-1 (SHOULD):** Schema and data-flow changes are documented in the impl-spec before implementation.

## offload (OFF)

- **OFF-1 (MUST): Content is durable, egress is not.** Keeping what you dumped is the product, so content is stored, not discarded. The hard line is on the way out: no content in analytics events, no content in LLM traces, no content in application logs, no content in error reports. Those carry ids, kinds, counts, tokens, latency and outcomes only. Rationale: the product needs the data; nothing else does.
- **OFF-2 (MUST): Cold storage is encrypted, database content is not, and we describe it as exactly that.** Blobs in R2, the photos, screenshots and voice-note audio, are encrypted with a key R2 does not hold. Database content is not encrypted by us: titles, notes, transcripts, memories and retrieval vectors sit in Postgres in plaintext, protected by the provider's own disk encryption and by access control, like most software.

  What this defends against: a leaked, misconfigured or stolen R2 bucket, which is the single most common way media escapes a product, and it is defended because no key material lives in R2.

  What it does **not** defend against, and must never be described as defending against: **a database dump, which exposes all text content**; **what a blob says, as opposed to the blob itself**, since a voice note's audio is encrypted while its transcript is a plaintext column, and the same is true of screenshot text and image descriptions; and a compromised running service.

  The scope of the claim is the point of this principle. "Your photos and voice notes are encrypted" is true and we may say it. "Your data is encrypted" is not true and we may not say it, anywhere: not in the product, not in marketing, not in a privacy policy, not in an answer to a user who asks. Rationale: a narrow honest claim is worth more than a broad false one, and this principle is what keeps the claim and the implementation in step.
- **OFF-3 (MUST): Ownership and grants, server-side.** Every row resolves to an owning account. Sharing happens at the thread level only, through an explicit grant to an existing connection. A grant means they can add to it and can never delete what is yours: enforce that server-side, per row, by author. No public links.

  **A shared thread is co-owned and outlives any one member.** Deleting an account removes that person's private things and their access, and leaves their things inside shared threads in place, because the thread belongs to the others too. Account deletion therefore never cascades into a shared thread, which is the one place the obvious implementation of "delete everything of theirs" is wrong. A person must be told this before they share rather than discovering it afterwards.

  Rationale: this is the tenancy boundary, and it is the one the product's sharing model actually has.
- **OFF-4 (MUST): Connected-app content is process-and-forget.** Email, calendar and browser content pulled from a connected app is derived and discarded: persist the derived thing plus a source reference for on-demand re-fetch, never the raw body. This is the opposite rule to OFF-1 and the distinction is deliberate. A dump is something a person chose to give offload. A connected inbox is not. Rationale: minimize the footprint of data we were never handed on purpose.
- **OFF-5 (MUST): Structured LLM I/O.** A model output crosses a system boundary only through a validated schema, never through free-text parsing. On a validation failure: one repair-and-revalidate retry, then raise, and log the failure. Rationale: reliability.
- **OFF-6 (MUST): Reversible by default, confirmed when outward facing.** offload acts without asking when all of these hold: the effect lands on an offload-owned surface, it is undoable for eight seconds with nothing destroyed while the toast is up, and it is on the reversible allowlist in `docs/tech/decisions.md`. Anything that leaves offload is confirmed per action: a message or invitation to a person, a write to a calendar or account we do not own, money, a legal commitment, anything hard to reverse. Default is outward facing; an action becomes reversible only once listed. Rationale: the product's promise is that it does the filing for you, and the safety net is Undo, not a dialog.
- **OFF-7 (SHOULD): The design system leads until code contradicts it, and then the log catches up.** The design system is checked in at `.claude/skills/offload-design/`. Consume its tokens, never retype a value. Its non-negotiables (vocabulary in identifiers as well as copy, no em dashes anywhere, sentence case, 44px hit areas, 4.5:1 text contrast, `min-height` never `height`, light as the default theme) hold in code. When code has to diverge, code wins and the same change appends one entry to `.claude/skills/offload-design/decisions.md`, with the **Design system impact** field filled in, because that field is what the design system reads on its next sync. Rationale: five surfaces stay coherent only if there is exactly one source for a token and one place that records why something moved.
