# 039 · Tasks

Each test is written and seen red before its code.

## API

- [x] T1 Migration 0084, schema types, ledger lines. AC-4, AC-8.
- [x] T2 `newCode`, `normaliseCode`, `hashCode`. AC-1, AC-5.
- [x] T3 `createCode`, `listCodes`, `revokeCode` and the admin routes, audited. AC-1, AC-2.
- [x] T4 `promoteIn` split from `promote`; `redeem` in one transaction. AC-3, AC-4, AC-5, AC-6.
- [x] T5 `POST /api/sign-in/code` with the proof and the limiter; the attempt read stops clearing. AC-7, AC-8.
- [x] T6 Deletion and the daily purge take the limiter's rows. AC-8.

## Web

- [x] T7 *Have a code?* on the no-invite screen, its three answers. AC-9.
- [x] T8 Review codes on the Waitlist page; audit labels. AC-1, AC-2.

## Mobile

- [x] T9 `rememberAttempt` from the refused response; the attempt read sends it. AC-10.
- [x] T10 *Have a code?* on both no-invite screens, its three answers. AC-9.

## Records

- [x] T11 002 amendment line, decisions.md, going-public item 21, design decisions entry.
