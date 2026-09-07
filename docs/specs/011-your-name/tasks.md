# 011 Your name, tasks

## Server

- [x] `accounts/name.ts`: `cleanName`, `cleanNameLossy`, `NAME_MAX`. One rule, three callers.
- [x] `auth/attempt.ts`: the request slot gains `providerName`, beside the refused address.
- [x] `auth/auth.ts`: `mapProfileToUser` on Google and Apple, recording the name and mapping nothing.
- [x] `auth/auth.ts`: `backfillName`, one UPDATE whose where clause is AC-2, AC-2a and AC-2b.
- [x] `routes/session.ts`: `nameField` in the schema, so there is one way to refuse a name.
- [x] `routes/session.ts`: `PATCH /api/me`, writing the session's row and returning the whole identity.
- [x] `routes/session.ts`: `completeFirstRun` writes the name in the transaction that goes active.
- [x] `test/name.test.ts`: 17 tests. The backfill's three refusals, the bounds, and the endpoints.

## Web

- [x] `lib/name.ts`: `NAME_MAX`, so the field and the server agree.
- [x] `lib/use-me.ts`: `updateName`, and a window event so every mounted `useMe` moves.
- [x] `welcome/page.tsx`: the name step, prefilled and required, with Skip landing on it.
- [x] `SettingsRows.tsx`: `EditableRow`.
- [x] `panes/Account.tsx`: the Name row edits.

## Phones

- [x] `lib/name.ts`, `components/NameField.tsx`: one field, toned per platform.
- [x] `lib/me.ts`: `saveName`, and a listener set so every mounted `useMe` moves.
- [x] `lib/api.ts`: `completeOnboarding` carries the name; `request` exported.
- [x] `Welcome.ios.tsx`, `Welcome.android.tsx`: the name step, and `KeyboardAvoidingView`.
- [x] `settings/Rows.tsx`: `EditableRow`.
- [x] `settings/[page].tsx`: the Name row edits.

## Claim surface

- [x] Privacy section 3: the name is the provider's **or yours**, changeable in Settings.
- [x] Privacy section 6: Apple and Google's row gains the name.
- [x] Privacy section 11: everyone in a shared thread sees your name and initials.

## Logs

- [x] `.claude/skills/offload-design/decisions.md`: the two screens, and what the kits owe.
- [x] `docs/tech/decisions.md`: where the provider's name comes from, and the scope.

## Not done, on purpose

- **No event.** AC-11. `assertNoContent` would not catch a name under sixty characters, so this is a rule rather than a check that fires.
- **No migration.** `display_name` has been nullable `text` since 0001.
- **No uniqueness, no index.** Nothing looks an account up by name.
- **Editing your email.** An identity change with a verification flow behind it.

## Left for whoever is next

- The kits are a screen short on all three first runs, their Skip goes to the wrong place, and no kit draws a settings row in its editing state.
- A name is untrusted text from another account. Nothing reads it into a prompt today. Whoever first shows a member's name to a model carries it as user-turn content, never concatenated into a system prompt.
