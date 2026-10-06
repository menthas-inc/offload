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

- **QUAL-1 (MUST):** No feature merges without tests covering its acceptance criteria. **The test comes first and is seen to fail.** Every change to behaviour, a feature, a fix, a hardening, starts with a test that fails for the reason the change exists, run and watched go red, and ends with that test green and nothing else red. A test written after the code is a description of what the code does, not evidence that it does what was asked; the security review of 2026-09-22 shipped its first batch that way and had to prove the tests afterwards by running them against the old source. *Amended 2026-09-22 by the product owner.*
- **QUAL-2 (SHOULD):** Functions do one thing; side effects are explicit and isolated.

## Security (SEC)

- **SEC-1 (MUST):** No secrets in source. No untrusted input reaches a shell, a query, or an eval without sanitization. Untrusted input includes anything a person dumped in and anything a connected app returned: it travels in user-turn content blocks and is never concatenated into a system prompt or treated as an instruction.
- **SEC-2 (MUST):** Authorization is server-side. Never trust the client for an access decision.

## Data (DATA)

- **DATA-1 (SHOULD):** Schema and data-flow changes are documented in the impl-spec before implementation.

## offload (OFF)

- **OFF-1 (MUST): What you dumped is durable, what offload worked out is not, and egress is neither.** Keeping what you dumped is the product, so a dump, the conversation it arrived in and its blobs are stored and not discarded.

  **Derived state is the opposite, deliberately.** Notes, thread standing and everything offload has worked out about somebody are rewritten, folded and removed as its picture of them changes, and the product shows that picture and lets them correct it rather than letting it accumulate. An assistant whose idea of you is append-only is one that gets worse the longer you use it, which is OFF-8 read from the other end.

  **The line between the two is who wrote the words.** offload may supersede anything, including a sentence a person typed, because superseding changes what offload acts on and destroys nothing. **It may delete only what it wrote itself.** A note somebody typed straight into a thread is not a derivation of a dump, it *is* the dump, and the fact that it lives in a derived table does not make it offload's to remove.

  *Amended 2026-09-10 by 014, which merged memories and dumped sentences into one derived table and made this distinction load-bearing. Amended in the same change with one dated exception: 014's migration deletes the `note` content rows that exist on 2026-09-10, once, while the product is in alpha and invite only. It is an exception rather than a precedent, and it is written here rather than left in a migration comment.*

  *A second dated exception, the product owner's on 2026-10-05, for 038: memories, what offload knows about a person across their threads, ship without a screen that shows them. The owner accepted that knowingly as a fast follow. Until the Memories tab ships, a person sees them by asking offload what it remembers and in their export, and corrects one by telling offload to forget it. The exception ends when the tab ships, and is not a precedent for any other derived state.*

  The hard line is on the way out: no content in analytics events, no content in LLM traces, no content in application logs, no content in error reports. Those carry ids, kinds, counts, tokens, latency and outcomes only.

  **The warehouse is never a second copy of content under weaker controls.** Analysis and machine learning that need content read the production tables, under the same per-account authorization as everything else and for a stated purpose. They do not get a parallel store where the same data sits with looser access, longer reach and no membership check. *This is the specific way an honest privacy posture usually dies: not by a decision to leak, but by an analytics pipeline that was allowed one reasonable-sounding field at a time.* Rationale: the product needs the data; nothing else does.
- **OFF-2 (MUST): Cold storage is encrypted, database content is not, and we describe it as exactly that.** Blobs in R2, the photos, screenshots and voice-note audio, are encrypted by us before they are stored, with a key R2 never receives. Database content is not encrypted by us: titles, notes, transcripts, memories and retrieval vectors sit in Postgres in plaintext, protected by the provider's own disk encryption and by access control, like most software.

  What this defends against: a leaked, misconfigured or stolen R2 bucket, which is the single most common way media escapes a product, and it is defended because no key material ever reaches R2 at all.

  What it does **not** defend against, and must never be described as defending against: **a database dump, which exposes all text content**; **what a blob says, as opposed to the blob itself**, since a voice note's audio is encrypted while its transcript is a plaintext column, and the same is true of screenshot text and image descriptions; and a compromised running service.

  The scope of the claim is the point of this principle. "Your photos and voice notes are encrypted" is true and we may say it. "Your data is encrypted" is not true and we may not say it, anywhere: not in the product, not in marketing, not in a privacy policy, not in an answer to a user who asks. Rationale: a narrow honest claim is worth more than a broad false one, and this principle is what keeps the claim and the implementation in step.
- **OFF-3 (MUST): Ownership and membership, server-side.** Every content row resolves to the account that authored it. A thread resolves to its **member set**, not to an owner: the creator is simply the first member, because an owner-versus-guest distinction is a role and the product has exactly one permission. Sharing happens at the thread level only, by inviting an existing connection. A member can add to a thread and can never delete a thing they did not author, **for as long as its author is still in the thread**: enforce that server-side, per row, by author. No public links.

  **Amended 2026-09-04 by 008, and the exception is narrow on purpose.** Once the author has left the thread or deleted their account, every remaining member may edit and delete what they left. The rule exists so a shared thread cannot become a place where somebody else destroys what you put in; with the author gone there is no contribution left to protect, and what the rule produces instead is a thread carrying leftovers nobody can clear, including a standing memory still steering the model. *Reconsidered together on 2026-09-22 by 022, which built member removal. Any member may take any other member out, and what they left becomes the thread's exactly as when they leave. The product accepts that a shared thread is only as safe as its members and says so in the privacy policy, because the alternatives were a member who cannot be removed, which is a role, or a contribution nobody can tidy, which is the leftover this amendment exists to prevent. What bounds it: everybody in a thread was brought in by a member from their own connections, taking somebody out is confirmed on a sheet that lists what stays, and it is never done by the model or by Undo.*

  **A shared thread is co-owned and outlives any one member.** Deleting an account removes that person's private content and their membership, and leaves their content inside shared threads in place, because the thread belongs to the others too. Account deletion therefore never cascades into a shared thread, which is the one place the obvious implementation of "delete everything of theirs" is wrong. A person must be told this before they share rather than discovering it afterwards.

  **A thread dies with its last member, and not before.** Deleting a thread other people are in means leaving it: your membership and your key go, their view is untouched. When the last member leaves, the thread and everything in it is deleted, which is the only path that destroys another person's content and is correct because by then nobody remains who could read them.

  Rationale: this is the tenancy boundary, and it is the one the product's sharing model actually has.
- **OFF-4 (MUST): Connected-app content is process-and-forget.** Email, calendar and browser content pulled from a connected app is derived and discarded: persist the derived content plus a source reference for on-demand re-fetch, never the raw body. This is the opposite rule to OFF-1 and the distinction is deliberate. A dump is something a person chose to give offload. A connected inbox is not. Rationale: minimize the footprint of data we were never handed on purpose.
- **OFF-5 (MUST): Structured LLM I/O.** A model output crosses a system boundary only through a validated schema, never through free-text parsing. On a validation failure: one repair-and-revalidate retry, then raise, and log the failure. Rationale: reliability.
- **OFF-6 (MUST): Reversible by default, confirmed when outward facing.** offload acts without asking when all of these hold: the effect lands on an offload-owned surface, it is undoable for eight seconds with nothing destroyed while the toast is up, and it is on the reversible allowlist in `docs/tech/decisions.md`. Anything that leaves offload is confirmed per action: a message or invitation to a person, a write to a calendar or account we do not own, money, a legal commitment, anything hard to reverse. Default is outward facing; an action becomes reversible only once listed. Rationale: the product's promise is that it does the filing for you, and the safety net is Undo, not a dialog.
- **OFF-7 (SHOULD): The design system leads until code contradicts it, and then the log catches up.** The design system is checked in at `.claude/skills/offload-design/`. Consume its tokens, never retype a value. Its non-negotiables (vocabulary in identifiers as well as copy, no em dashes anywhere, sentence case, 44px hit areas, 4.5:1 text contrast, `min-height` never `height`, light as the default theme) hold in code. When code has to diverge, code wins and the same change appends one entry to `.claude/skills/offload-design/decisions.md`, with the **Design system impact** field filled in, because that field is what the design system reads on its next sync. Rationale: five surfaces stay coherent only if there is exactly one source for a token and one place that records why something moved.
- **OFF-8 (MUST): Context is compacted, not accumulated.** What goes into a model call is bounded and roughly constant regardless of how long an account has existed. Raw content and conversations are stored as given and kept indefinitely; memories, preferences and thread standing are continuously compacted and generalised, and those are what a prompt carries. The tiers differ in what a prompt carries, not in what survives. Prompt assembly enforces a budget per tier rather than assuming one. The test for a new feature is whether it puts anything in a prompt that grows with account age: if it does, it belongs behind compaction. Detail in `docs/tech/context-and-memory.md`. Rationale: an assistant that remembers by accumulating gets slower, more expensive and worse the longer it is used, and that is invisible until it is expensive to fix.
