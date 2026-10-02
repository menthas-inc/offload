# 031 Settings, tightened, impl spec

Read with the feature spec. Grounding: `.claude/skills/offload-design/handoff/APPLY-2026-10-02-settings.md` and `explorations/settings-v2.html` with `settings-pages-v2.js`, whose `row()` and `section()` are the reference for every measurement here. The kits are not redrawn for this pass.

## Server

One field. `meResponse` in `apps/core-api/src/routes/session.ts` gains `signInProviders: z.array(z.enum(["apple", "google"]))`, read in `meFor` from `account_identities.provider` for the account, deduplicated, filtered to the two known providers, in the order `apple`, `google`. No migration: the rows exist. Both clients' `Me` types gain it.

## Shared rules

- **Group's heading takes `icon`.** `Group({ label, icon, caption, count })`. `icon` present: the new heading. `label` without `icon`: the old small label, unchanged, for the picker regions and the Calendar and Mail pages. Neither: no heading. `count` renders as the pill under the new heading and as the old trailing count under the small label, so the calendar page's *4 of 7 in use* is untouched.
- **Rows.** The value moves to 15px secondary. `Row` gains `pill?: string` (an outline pill that replaces value and chevron, the whole row pressable) and `status?: string` (the moss status pill). `lead?: IconName` stays `icon`; a settings detail row may now carry one (Signed in on, Sign out).
- **Tokens.** Every value is a token. The Android hex values in the exploration map to the platform scope: the card `#F1EFEA` to `a-c-low` (as built), wells `#E4E1DA` to `a-c-high` (as built), the outline `#79786F` to `a-outline` (as built). Logged in the design log as one code-wins entry.
- **Glyph colours on the phones** come from `useColors()`: it gains `sectionGlyph` (`--moss-700` iOS, `--blue-700` Android) and `statusGlyph` is not needed (the dot is a view).

## Phones (`apps/mobile`)

- `scripts/icons.mjs` regenerates `components/icons.generated.ts` with the eight glyphs (`pnpm icons`).
- `components/settings/Rows.tsx`: `Group` heading, `Row`'s `pill` and `status`, the value size.
- `components/settings/ChoiceTiles.tsx`, new: `{ label, options: { value, label, preview }[], value, onChange }`, `accessibilityRole="radiogroup"` with each tile a `radio`. Previews as small components in the same file (`ThemePreview`, `WeekPreview`).
- `app/settings/index.tsx`: headings with glyphs; the Connected apps value from `useCalendars()` and `me.mailAvailable`.
- `app/settings/[page].tsx`: Account (Profile, Where you are, Signed in on, Sign out), Appearance and Date and time on `ChoiceTiles`, Privacy and Date and time headings, pickers' `check`, `Apps` as cards (`components/settings/AppCards.tsx`, new), Help with Learn and About.
- `lib/sessions.ts`: `thisDevice()` from `authClient.getSession()` and `describeDevice`, independent of the list; `listSignedIn()` returns the others only and throws on failure; `endOthers()` calls `authClient.revokeOtherSessions()`.
- `components/people/PeoplePage.tsx`: the five sections; Connect with someone renders `components/people/NewConnection.tsx`, extracted from `app/people/add.tsx` (which keeps its screen and renders the same piece). The found row's button *Ask to connect*; the `rate_limited` line.
- `components/settings/NotificationsPage.tsx`: captions, indented hour rows with the hour pill, On this phone's *Allowed* row.
- `app/tutorial.tsx`, new, presented as a modal in `app/_layout.tsx`: renders `Welcome` with `replay`, which limits the flow to the three tutorial screens, swaps the last button to *Done*, and makes Skip and Done `router.back()`. No write, no permission ask, no `useMe` gating.

## Web (`apps/web`)

- `public/icons/`: the eight SVGs, copied from the design system's `assets/icons/`.
- `components/panes/SettingsRows.tsx`: `Group` heading; `Row`'s `pill`, `status` and value size; `Combobox` (new); `ChoiceTiles` (new). Styles in `app/(shell)/shell.module.css` beside the existing `settings*` classes.
- `Settings.tsx` (index): small labels stay; the Connected apps value.
- `Account.tsx`, `DateTime.tsx`: the combobox; Account's sections as the phones'.
- `Appearance.tsx`, `DateTime.tsx`: `ChoiceTiles`; `Segmented` stays exported for any view switch.
- `lib/sessions.ts`: the same three functions as the phones'.
- `People.tsx`: the five sections; `components/people/ShareModal.tsx`'s `NewConnection` split into the step body (`NewConnectionBody`, the field, states and found row) and the modal frame, so My people renders the body inline. *Ask to connect*; the `rate_limited` line.
- `Notifications.tsx`: captions, indented hour rows, On your phones.
- `Apps.tsx`: cards; the inline per-account block moves to `AppsCalendarPane` at `app/(shell)/settings/apps/calendar/page.tsx`, with Ask before adding there too.
- `Help.tsx`: Learn and About. `app/(app)/tutorial/page.tsx`, new: the welcome page's tutorial in replay mode, ending at `/settings/help`. The welcome page's flow takes `replay` and reads `useMe(replay ? "shell" : "first-run")` so an active account is not redirected away.
- Pane head summaries per the feature spec.

## Tests

Red first, each.

- **Core API:** `signInProviders` for a Google-only, an Apple-only and a both-linked account, ordered.
- **Both clients, `sessions`:** `thisDevice` from the session alone when `listSessions` rejects; the list excludes the current token; `endOthers` calls the revoke-others endpoint.
- **Both clients, the copy pieces as pure functions** where they are logic: the Email note from providers; the index's connected-apps value; the pane summaries (web); the combobox filter (web; the phones' picker shares the rule).
- **Web render tests** (vitest and Testing Library, as `today.test.tsx` does): Signed in on's three states; My people's sections and their hiding; the combobox's keyboard and Escape; choice tiles as a radio group; Connected apps' card states; the tutorial replay's Done going to Help with no fetch.
- **Mobile** has no render harness; its logic goes in testable modules (`lib/`), and the screens are checked on the simulator and the emulator.
