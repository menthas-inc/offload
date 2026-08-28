# 001 Data model

## Why

Nothing can be built until the shape of the data is decided, and every table written before the shape is decided is a migration later. This spec fixes the entities, their names, their ownership and their lifecycles, so the first migration is the one we keep.

It also fixes the vocabulary in code. The design system is explicit that a collection is a **thread**, one item inside it is a **thing**, derived knowledge is a **memory**, and a person you can share with is a **connection**. Those words go in tables, columns, routes and types from the first migration, not just in UI copy. The kits' prototype fixture still says `space` in places; that is residue and it is not inherited.

## What

The entities the product needs, and only those. In dependency order:

**Identity.** An `account` is a person. It links many provider identities, so signing in with Apple and with Google reaches the same account. Accounts move through `waitlist → invited → active → disabled`.

**Content.** A `thread` holds `things`. Every thing is in exactly one thread. A thing may carry `blobs`, its photos, screenshots and voice-note audio. Every account has one default thread so nothing is ever unplaced.

**People and sharing.** A `person` is someone in an account's own address book. Some are linked to an offload account, and those are the ones a thread can be shared with; the rest are people offload knows about but who will never sign up. A `grant` shares one thread with one account.

**Derived.** A `memory` is something offload learned, at one of three scopes: about you, about a thread, about a person. Memories keep their sources. They are compacted rather than accumulated.

**Conversation.** A `conversation` holds `messages`. Conversations persist and can be added to.

**Machinery.** `jobs` is the queue. `llm_usage` is the per-account token ledger the admin panel reads. `staff` is the admin allowlist.

## Acceptance criteria

- **AC-1** Every content-bearing row resolves to exactly one owning account, and every read path is scoped by account or by an accepted grant (OFF-3).
- **AC-2** A thing always has a thread. There is no state in which `thread_id` is null.
- **AC-3** A grant lets the grantee add things to a thread and never lets them delete a thing they did not author, enforced per row by author (OFF-3).
- **AC-4** Deleting an account destroys its private content and leaves its things inside shared threads in place (OFF-3).
- **AC-5** Deleting anything is a flag first. Nothing is destroyed inside the undo window (OFF-6).
- **AC-6** A thing carries a source kind and an optional source reference, so a thing that later comes from a connected app needs no migration of the `things` table (OFF-4 groundwork).
- **AC-7** Memory rows carry their sources, and a memory can always name the things it came from.
- **AC-8** Exactly one standing memory exists per thread, enforced by the schema rather than by convention.
- **AC-9** Enqueueing a job and writing the row that caused it happen in one transaction.
- **AC-10** Every query a designed screen performs is served by a stated index, and every list whose heavy case exceeds a few hundred rows is cursor-paginated.
- **AC-11** The four key layers exist as separate, separately-rewrappable rows, and the account key carries the name of the root that wrapped it.

## Out of scope

Connector tables (`sources`, connector state, token custody), the tool registry, analytics event tables beyond an outbox, billing plans, and anything the admin panel needs beyond `staff` and the ledger. All of these are named in `docs/tech/decisions.md` and each gets its own spec.
