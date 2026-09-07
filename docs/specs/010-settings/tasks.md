# 010 Settings, tasks

Ordered so the shared pieces land before the three clients that use them, and
the removal last, because `TempSignOut` is the only way to sign out until the
thing replacing it works.

## A. Server

- [ ] **A1** Move `initialsOf` out of `routes/threads.ts` to a shared module and
      add `initials` to `meResponse` on `/api/me` *(**AC-2**)*. Thread members
      keep using the same function, so there is one rule.
- [ ] **A2** A test that `/api/me` returns initials for a two-word name, a
      one-word name and no name, and that the no-name case matches what a
      thread member with no name already gets *(**AC-2**)*.

## B. Shared client behaviour

- [ ] **B1** Web: sign out awaits the server and does not navigate on failure
      *(**AC-3**, **AC-3a**)*. There is no local credential to clear.
- [ ] **B2** Phones: replace `signOutForTesting` with a real `signOut` that
      awaits, bounded at 8s, clears both SecureStore keys **only after** the
      server confirms, and reports a failure rather than pretending
      *(**AC-3**, **AC-3a**, **AC-3b**)*.
- [ ] **B3** A test for the failure path on the phones: a server call that
      rejects leaves the keys in place and reports failure *(**AC-3a**)*. This
      is the branch nobody exercises by hand.

## C. The phones: appearance

- [ ] **C1** `lib/appearance.ts`: theme only, three values, `SecureStore` with a
      synchronous read *(**AC-6**)*.
- [ ] **C2** `app/_layout.tsx` reads the stored choice instead of
      `colorScheme.set("light")` *(**AC-6**, **AC-6a**)*.
- [ ] **C3** `useColors()` replaces the frozen `COLOR` at all 43 call sites
      *(**AC-6b**)*. Typecheck is the gate: a missed site does not compile.
- [ ] **C4** Walk every screen in dark on a device *(**AC-6a**)*. Expect
      findings; the light pin exists because somebody saw it break.

## D. The phones: settings

- [ ] **D1** Today's app bar: wordmark, bell, gear *(**AC-1**)*. The bell is
      inert and commented as the deliberate exception.
- [ ] **D2** `Group` and `Row`, built on `Card variant="fill"`, `min-height`
      never `height` *(**AC-12**, **AC-12a**)*.
- [ ] **D3** `app/settings/index.tsx`: identity, sign out, two groups, three
      rows with their values *(**AC-2**, **AC-3**, **AC-4**)*.
- [ ] **D4** `app/settings/[page].tsx` with My account, Appearance and Help and
      about *(**AC-5**, **AC-6**, **AC-8**)*. Appearance is `SegmentedControl`.
      Version from `expo-constants`.
- [ ] **D5** Back returns to the index, and the index returns to Today
      *(**AC-11**)*.

## E. Web

- [ ] **E1** `Group` and `Row` for web: open blocks, no container, matching
      `WSettings.jsx` rather than the phones' cards *(**AC-12**)*.
- [ ] **E2** `/settings` index pane: identity, sign out, the same three rows
      *(**AC-2**, **AC-3**, **AC-4**)*.
- [ ] **E3** My account and Help and about panes *(**AC-5**, **AC-8**)*. No
      version on web, per AC-8.
- [ ] **E4** Appearance moves under the index; `/settings/appearance` keeps
      working; the nav foot points at `/settings` *(**AC-7**)*.

## F. The claim surface

- [ ] **F1** Reword `privacy/page.tsx` section 13 so no control is conditioned
      on the settings screen *(**AC-13**)*. **Same commit as the screen.**

## G. Removal and close

- [ ] **G1** Remove `TempSignOut`, its two mount points and `signOutForTesting`
      *(**AC-10**)*. Last, because until D3 lands it is the only way out.
- [ ] **G2** Three `decisions.md` entries with filled Design system impact:
      sign out on the web index, the four dropped My account rows, and
      Appearance as a segmented control on the phones *(**OFF-7**)*.
- [ ] **G3** Confirm nothing this feature fires carries a name or an email
      *(**AC-14**)*.
- [ ] **G4** Close 009 G3, which this makes true.
