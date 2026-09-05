# 009 The phones, tasks

Every task is iOS **and** Android unless it says otherwise. Android is the one being tested day
to day, so Android is the one that has to be right first.

**Nothing here is blocked.** Eight decisions were taken on 2026-09-05 and are recorded in
`inventory.md` beside the thing they decide: the sheet and fold ship as drawn, attachments are
out with their controls hidden, row actions are swipes, three tabs with Memories empty, a thread
keeps the composer and loses the tabs, widgets group rather than filter, the swipe deletes with
no confirmation, and `widgets.ts` moves to a shared package.

**A device is in the loop from A3 onward, not at the end.** The kits cannot show a keyboard, and
this repo has already shipped a form sitting underneath one. Every task below with a text field
carries a failure mode no mock can express.

## A. Plumbing

- [ ] **A1** Extend `apps/mobile/lib/api.ts` rather than replacing it. It already awaits the
      cookie out of secure storage and already sets `content-type` only when there is a body,
      which is the rule the web client got wrong.
- [ ] **A2** Port `lib/threads.ts` and `lib/dump.ts` as the mobile API layer. Pure functions, no
      DOM, so this is the one part that genuinely is a port.
- [ ] **A3** Create `packages/widgets` **as a package, not a folder**: `exports` at `dist/`, a
      build, and a `prepare` script so `pnpm install` produces it. Modelled on `packages/tokens`,
      because a generated artifact built by a step someone remembers is what broke every EAS
      build once.
- [ ] **A3a** Move `parseTag` and `dimensionsIn` into it as well as the six rendering functions.
      `groupBy` calls `parseTag`, and leaving it out gives the package a third copy beside the
      server's. `apps/core-api/src/threads/tags.ts` imports them back for `normaliseTags`.
- [ ] **A3b** Both suites, with the changes named in the impl-spec: web's fixtures move from
      `place` to `placeId`, and the server test's `dimensionsIn` import moves.
      *Test:* both suites green, and no third `parseTag` anywhere in the repo.
- [ ] **A3c** `GestureHandlerRootView` in `app/_layout.tsx`. `react-native-gesture-handler` is a
      dependency with no usage and no root view, and without it Android swipes silently do not
      register. Before any swipe ships.
- [ ] **A3d** Add `react-native-keyboard-controller` and rebuild the dev client. Native code, so
      a Metro reload will not pick it up, and check its peer range against RN 0.86 and
      Reanimated 4.5.1 first.
- [ ] **A4** The stream. `EventSource` is not in the React Native runtime. Ship on `fetchAnswer`,
      which the stream is already an optimisation over. One second while live, backing off to
      five after twenty misses, stopping on `answered`, `partial` or `failed` and on background,
      and asking immediately on foreground rather than waiting a tick.
      *Test:* under vitest, not on a device: it stops on each terminal state, it backs off, and
      foregrounding asks at once.
- [ ] **A4a** Session storage pins `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` on write, and first
      launch rewrites an existing cookie so it is not left on the old class.
- [ ] **A4b** **Verify Android's actual backup behaviour for `expo-secure-store`** and write the
      answer into the impl-spec. `keychainAccessible` is iOS-only, so the fix above says nothing
      about Android and nobody has checked what is true there.
- [ ] **A4c** A `vitest` setup for `apps/mobile`, replacing the `echo "no mobile tests yet"`
      stub, covering the ported API layer and the poll. Everything that needs a device stays a
      device check; everything that does not stops pretending it does.
- [ ] **A5** Navigation: three tabs on the plate, full-screen push for everything else. iOS
      pushes at 350ms, Android uses shared-axis-X at 300ms.
- [ ] **A6** The third tab exists and is empty, saying so, the way Today does. It is not hidden
      and reintroduced later.

## B. My threads

- [ ] **B1** The list, three groups, "All N older threads" on a height transition, 320ms Android
      and 300ms iOS.
- [ ] **B2** The row per platform. iOS `ListRow` with chevron and a 36px tile; Android `ARow`
      with a bare icon slug. **No trailing count on either.**
- [ ] **B3** Meta comes from the server, as on web. The Android kit recomposes it on the client
      with its own `withWhom`; three clients composing one string is how they drift.
- [ ] **B4** Delete by swipe, straight to the toast, no confirmation, as drawn. Web keeps its
      inline confirmation; the two clients differ on purpose and `decisions.md` says why.
- [ ] **B5** The default thread cannot be deleted, and a phone has no hover and no tooltip to say
      so. **My call unless overruled:** swiping it reveals the reason where Delete would be
      rather than revealing nothing, so the gesture answers the question instead of failing
      silently.
- [ ] **B6** App bar: the wordmark only. The kit draws a bell and a settings icon; both
      destinations are out of scope and a control that does nothing is worse on a phone than
      absent, which is decision 2's own reasoning applied consistently. Logged as a divergence.

## C. The thread page

- [ ] **C1** App bar: back, Share, `ellipsis`. Title as an `h1` inside the scroll at
      `--text-title-1`, not in the bar.
- [ ] **C2** People chips and the Share chip under the title. Share is disabled everywhere, as on
      web, and says so.
- [ ] **C3** The standing block **only when there is one**. The kit draws "offload has not
      summarised this one yet" and that placeholder is retired; nothing writes summaries anyway.
- [ ] **C4** To do as real `Checkbox` rows with label and meta, in a padded column, not list rows.
- [ ] **C5** "Everything in here", with `See all` past three. iOS flat `ListRow`s with chevrons;
      Android wrapped in an `ACard`.
- [ ] **C6** Content row actions by swipe, since the kit already establishes the gesture on
      thread rows. Archive and delete on the swipe; the rest in a sheet.
- [ ] **C7** The archived view.

## D. Thread memories

- [ ] **D1** The section on the thread page. No kit anywhere, on any platform.
- [ ] **D2** The chip and its open state. The web opens an editor inside the chip; a phone has no
      hover and less width.
- [ ] **D3** One control, mute or delete, matching web.
- [ ] **D4** The cap of ten, and the add control.
- [ ] **D5** Authorship on a chip in a shared thread, which has no precedent in any kit.

## E. The composer and the conversation

- [ ] **E1** The plate: folded header, composer, tab bar, `--radius-xl` top corners.
- [ ] **E1a** Inside a thread the plate keeps the composer and drops the tabs, placeholder
      "Add to this".
- [ ] **E2** The field: grows to 380 then scrolls, Return is a newline on a touch keyboard and
      the send button is the only submit.
- [ ] **E3** The twenty rotating placeholders, ten second fade.
- [ ] **E4** Turn bubbles, both sides, with the status chip hanging off the bottom left.
- [ ] **E5** Done means something was done, matching the web fix.
- [ ] **E6** Reference chips in offload's replies, thread ones tappable.
- [ ] **E7** The writing indicator.
- [ ] **E8** The eight second Undo toast.
- [ ] **E9** A partial turn, with Retry.
- [ ] **E10** The sheet: the conversation rises over the screen with its own composer inside.
- [ ] **E11** The fold: it collapses to a `FoldedHeader` above the main composer, and comes back.
      *Test:* folding and raising loses no turn and no draft.
- [ ] **E11a** Attachments are out and their controls are not drawn. A camera and a mic that do
      nothing are worse on a phone than absent.
- [ ] **E12** `@` mention picking. Depends on a people table that does not exist.
- [ ] **E13** **The keyboard.** Every screen above, on a device, with the keyboard up. Android
      ignores `adjustResize` because this app is edge to edge, which is already written down.

## F. Widgets

- [ ] **F1** Map, timeline and files, from `ThreadWidgets.jsx`.
- [ ] **F2** Headed groups, matching web, not the kit's `ChipRow` filter. The kit is the stale
      half here and G4 says so.

## G. The record

- [ ] **G1** The four open design-system questions, answered once for all three clients: the
      change mark, the memory chip's open state, authorship on a chip, and `Chip` having no
      disabled state.
- [ ] **G2** `decisions.md` in both logs, **in the same commit as the code that diverges**, not
      after. Three are already known: the composer staying on a thread screen against the kit's
      `showComposer=false`, the bell and settings not being drawn, and whatever `SwipeRow` needs
      if a content swipe is ever not a delete.
- [ ] **G3** Remove `TempSignOut` and `signOutForTesting()` when they get in the way. Spec 002's
      F6, open since then.
- [ ] **G4** The kits catch up on what web settled and the phones inherit: no placeholder for a
      missing summary, no trailing count, "thing" still throughout, and `variant="soft"` on
      `Chip` which the contract retired.
