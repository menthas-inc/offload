# 039 · A way in for store reviewers: implementation

## Data flow

1. The sign-in screen reads `GET /api/sign-in/options` (`{ codes }`, from
   `switch.review_codes`). With codes on, *Have a code?* opens a field above
   the providers.
2. The client calls `signIn.social` with `additionalData: { reviewCode }` when
   a code is typed, and nothing extra when not.
   - Native sheets (Apple on iPhone, Google on Android): one POST with the
     token. `routes/auth.ts` puts the body's `reviewCode` and `request.ip` in
     the request's store (`auth/attempt.ts`).
   - Browsers (web, Google on iPhone, Apple on Android): Better Auth stores
     `additionalData` in the OAuth state for that attempt and hands it back at
     the callback through `getOAuthState()`.
3. The providers' `mapProfileToUser` (`rememberName` in `auth/auth.ts`) calls
   `redeemAtSignIn(profile)` (`auth/code-at-sign-in.ts`): no code, or the
   switch off, does nothing. An unverified address, a limited try or a code
   that does not work marks the store `codeRefused`. Otherwise `redeem`.
4. `redeem` (`admin/review-codes.ts`), one transaction we own:
   `update review_codes set uses = uses + 1 where code_hash = $1 and
   revoked_at is null and expires_at > now() and uses < max_uses returning id,
   created_by`. No row: `refused`. Then `promoteIn(tx, email)`. `invited`: set
   `accounts.review_code_id`, audit `code.redeemed` against `created_by`,
   commit, `in`. `already-in` or `refused`: throw to roll the use back.
5. Better Auth looks for the account by email and finds it invited, links the
   verified identity through `account.create.before`, and issues a session
   through `session.create.before`. One sign-in.
6. A refusal, from `user.create.before` or `account.create.before`, seals the
   reason into `offload_attempt`: `disabled` first, then `code` when the store
   is marked. `/api/sign-in/attempt` reads it once and clears it, as before.

The claim is the update: concurrent redemptions queue on the row lock and the
second re-evaluates `uses < max_uses` against the committed row. The check
constraint is the backstop. The lock order is code row, then account row.

## Schema, migration 0084

- `review_codes (id uuid v7, code_hash bytea unique, note text 1..80,
  max_uses int 1..50, uses int default 0, expires_at, revoked_at null,
  created_by uuid not null, created_at)`, with
  `check (uses >= 0 and uses <= max_uses)`. `created_by` has no foreign key,
  as an audit entry's staff id has none; ledger fate `none`.
- `accounts.review_code_id uuid references review_codes`. Codes are revoked,
  never deleted.
- `review_code_attempts (email_hmac, ip_hmac, created_at)`, HMAC under
  `derivedKey("review-code-attempts")`, the address lowered first. Counted
  before the write, closed when the count cannot be read. Ledger `step`,
  removed by `deleteAccount`; purged after two days.
- `switch.review_codes` in the settings registry, default true.

## Interfaces

- `GET /api/sign-in/options` returns `{ codes: boolean }`, `no-store`.
- `GET /api/sign-in/attempt` reason is `disabled | code | null`.
- `GET /v1/admin/codes`, `POST /v1/admin/codes { note, maxUses = 5, days = 30 }`
  (returns the row and `code`), `POST /v1/admin/codes/:id/revoke`, in the
  support scope. Audit kinds `code.created`, `code.revoked`, `code.redeemed`.

## Clients

- Web: `sign-in/page.tsx` (the line and the field), `lib/auth-client.ts`
  (`signIn(provider, to, code)`), `no-invite/page.tsx` (the code refusal).
- Phones: `components/screens/CodeEntry.tsx` (`CodeLine`, `CodeField`, one
  file for both), `SignIn.ios.tsx` and `.android.tsx`, `lib/auth.ts`
  (`signIn(provider, code)`), `lib/code.ts` (`codesOn`), `lib/attempt.ts` (the
  refusal's proof from the refused response), both `NoInvite` screens.
- Admin: `waitlist/ReviewCodes.tsx`; Limits' switch list.

## Edge cases

- A disabled account with a code is refused as disabled; the code is not
  spent.
- A browser sign-in on a phone that ends in a refusal cannot hand the app the
  refusal's cookie, so the phone's no-invite screen there names no address
  and cannot say it was the code. The web can.
- The invite email still goes out, as promotion sends it.

## Constitution check

DEV-1: one promotion path, the session issued by Better Auth's own flow, no
new cookie. SEC-1/2: the code and the address are checked on the server; the
address is the provider's verified one. QUAL-1: tests first, including Better
Auth's real sign-in both ways with only the provider stood in for. OFF-1: no
content anywhere; the note is staff text.
