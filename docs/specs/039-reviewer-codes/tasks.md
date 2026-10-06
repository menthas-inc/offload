# 039 · Tasks

Each test is written and seen red before its code.

## API

- [x] T1 Migration 0084, schema types, ledger lines. AC-4, AC-8.
- [x] T2 `newCode`, `normaliseCode`, `hashCode`. AC-1, AC-5.
- [x] T3 `createCode`, `listCodes`, `revokeCode` and the admin routes, audited. AC-1, AC-2.
- [x] T4 `promoteIn` split from `promote`; `redeem` in one transaction, audited. AC-3, AC-4, AC-5, AC-6.
- [x] T5 `redeemAtSignIn` from `mapProfileToUser`, the code from the native body or the OAuth state; `reason: code` on the refusal. AC-3, AC-7, AC-10, AC-12.
- [x] T6 `switch.review_codes` and `GET /api/sign-in/options`. AC-11.
- [x] T7 The limiter counts first and lowers the address; deletion and the daily purge take its rows. AC-8.
- [x] T8 `/api/sign-in/attempt` clears on read again; `/api/sign-in/code` removed.

## Web

- [x] T9 *Have a code?* on the sign-in card, the code in `additionalData`; the no-invite code refusal. AC-7, AC-9, AC-10.
- [x] T10 Review codes on the Waitlist page; audit labels; the Limits switch. AC-1, AC-2, AC-11.

## Mobile

- [x] T11 `signIn(provider, code)` on all four paths; `codesOn`; the refusal's proof kept. AC-10, AC-11.
- [x] T12 `CodeLine` and `CodeField` on both sign-in screens; the code refusal on both no-invite screens. AC-7, AC-9.

## Records

- [x] T13 002 amendment line, decisions.md, going-public 21 and 17d, design decisions entry.
