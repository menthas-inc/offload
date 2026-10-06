# 039 · A way in for store reviewers: implementation

## Data flow

1. Sign-in is refused as today. `routes/auth.ts` sets the signed
   `offload_attempt` cookie (ten minutes) on that response.
2. `GET /api/sign-in/attempt` reads it and no longer clears it, so the same
   proof can be presented with a code. It expires on its own; a successful
   redemption clears it.
3. The phones' auth client reads `offload_attempt` from the refused
   response's `set-cookie` (`lib/code.ts`, `rememberAttempt`) and sends it as a
   `cookie` header with the attempt read and the redemption. The web sends the
   cookie with `credentials: "include"`.
4. `POST /api/sign-in/code { code }` (`routes/sign-in-code.ts`):
   unseal the proof (none or a disabled reason: `sign-in` or `refused`),
   count the try (`review_code_attempts`), then `redeem(email, code)`.
5. `redeem` (`admin/review-codes.ts`), one transaction we own:
   `update review_codes set uses = uses + 1 where code_hash = $1 and
   revoked_at is null and expires_at > now() and uses < max_uses returning id`.
   No row: `refused`. Then `promoteIn(tx, email)`, the body of `promote`
   split out so both share one transaction. `invited`: set
   `accounts.review_code_id`, commit, `in`. `already-in` or `refused`: throw to
   roll the use back, answer `in` or `refused`.
6. The person signs in again. Better Auth matches the verified address to the
   invited account and the gate links it, as for any invite.

The claim is the update: concurrent redemptions queue on the row lock and the
second re-evaluates `uses < max_uses` against the committed row. The check
constraint is the backstop. The lock order is code row, then account row, and
nothing else locks both, so there is no cycle.

## Schema, migration 0084

- `review_codes (id uuid v7, code_hash bytea unique, note text 1..80,
  max_uses int 1..50, uses int default 0, expires_at timestamptz,
  revoked_at timestamptz null, created_at)`, with
  `check (uses >= 0 and uses <= max_uses)`. No staff column: who made it is
  the audit entry.
- `accounts.review_code_id uuid references review_codes`, null for everyone
  an admin let in. Codes are never deleted, only revoked.
- `review_code_attempts (email_hmac bytea, ip_hmac bytea, created_at)`, two
  indexes. HMAC under `derivedKey("review-code-attempts")`. Ledger: `step`,
  removed by `deleteAccount`; purged after two days by the daily purge.

## Interfaces

- `GET /v1/admin/codes` rows: `id, note, uses, maxUses, expiresAt, state`
  (`live | expired | used | revoked`).
- `POST /v1/admin/codes { note, maxUses = 5, days = 30 }` returns the row and
  `code`. Audit `code.created`, `new` = the code's id.
- `POST /v1/admin/codes/:id/revoke` returns `{ status: revoked | already }`.
  Audit `code.revoked`, `old` = the code's id.
- `POST /api/sign-in/code { code: string <= 40 }` returns
  `{ status: in | refused | sign-in }`, always 200.

All three admin routes are in the support scope: inviting is support's job.

## Clients

- Web `no-invite/page.tsx` and `components/HaveACode.tsx`, from the kit's gate
  card: a caption-row text button, then the kit's field and the kit's primary
  button, the refusal in the kit's refusal line.
- Phones: `components/screens/HaveACode.tsx`, one component for both, the
  Material classes switched by `Platform.OS`; copy in `lib/gate.ts`.
- Admin: `waitlist/ReviewCodes.tsx`, a section on the Waitlist page with a
  *New code* dialog (the page's `Confirm` and `Field`), a table, and a toast.
  The code is shown in the dialog after creation and nowhere else.

## Edge cases

- The proof is the address the provider asserted at refusal. An unverified
  address can be promoted but never linked, so it admits nobody and costs a
  use. Acceptable for a code that exists for two reviews.
- A reload of the no-invite screen within ten minutes shows the address again
  instead of the screen without it.
- The invite email still goes out, as promotion sends it.

## Constitution check

DEV-1: one promotion path, no session minting, no new auth flow. SEC-1/2: the
code and the proof are checked on the server; the hash is SHA-256 of a 60-bit
random value, which is unguessable without a slow hash. QUAL-1: tests first.
OFF-1: no content anywhere; the note is staff text, not a person's.
