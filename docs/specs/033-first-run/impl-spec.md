# 033 First run, three screens, impl spec

Read with the feature spec. Grounding: `.claude/skills/offload-design/handoff/APPLY-2026-10-03-onboarding.md` and `explorations/onboarding-v2.html` with `onboarding-screens.js`, whose CSS is the reference for every measurement here. The kits are not redrawn.

No table, list or feed changes, so there is no volume and access section. Nothing here reaches a model prompt.

## Server

One landing. `Landing` in `apps/core-api/src/connectors/state.ts` gains `"first-run-bring"`, and `LANDINGS` with it; the start route's `z.enum` in `routes/connectors.ts` reads `LANDINGS` rather than repeating the list. `landingUrl` becomes an exhaustive `switch` over `Landing` with a `never` default, so a new value cannot compile without a destination; `first-run-bring` is `${WEB_URL}/welcome/bring?calendar=${outcome}` for both outcomes.

**Active accounts only.** A `requireActive(accountId)` check (one query on `accounts.state`) answers 403 `{ error: "not_active" }` on `GET /api/connectors/google/start` and `POST /v1/push-tokens` for any account that is not `active`, so the order first run draws is also the order the API allows (SEC-2). `first-run` and `settings` keep their destinations, because a phone on an older build still sends `first-run`. The landing is still an enum sealed into the HMAC'd state and resolved server side, never a URL from the request.

## Shared shape

**Steps.** `intro | you | bring`, then Today. `you` is Before you start; on the name-only path it draws the name block alone. The flow's decisions are pure functions so both clients test them without rendering:

- `firstStep({ replay, nameOnly })`: `intro` unless `nameOnly`, then `you`.
- `bringCards({ mailAvailable, calendarOffer, notifications })` returns the cards to draw, in order Mail, Calendar, Notifications. `notifications` is `"ask" | "decided" | "unsupported"`; only `"ask"` draws the card. `calendarOffer` is `available && connections.length === 0`.
- `afterYou(cards)` is `"bring"` with at least one card, `"today"` with none.
- `introNext(scene)` is `(scene + 1) % 3`.
- `autoAdvance({ reduceMotion, screenReader })` is true only when both are false.

The copy is one table per client, as now: the phones in `lib/gate.ts`, the web in `components/firstrun/copy.ts`. `INTRO` replaces `TUTORIAL`; `INTRO_DUMPS` replaces `DUMPS` and `THREADS`; `BEFORE`, `BRING` are new; `CONSENT.sub`, `mailStep`, `offersFor`, `dotsFor`, `CONNECT_STEP.notNow` go. `CONNECT_STEP` and the web `ConnectBlock` stay: Settings draws them.

**Tokens.** Every value is a token or a measurement from the exploration. Android's `#79786F` and `#49454F` outlines are `--border-strong`, `#F1EFEA` is `a-c-low`, `#E4E1DA` is `a-c-high`, white on blue is `--text-on-solid`, as 031 decided. The bar track is `--ink-950` at 10%, which flips with the theme where the exploration's black does not. The intro's people are flat circles on `--label-1/2/6`, not `Avatar`, which would fetch a mark for an id that does not exist. The photo tile is `--surface-accent-soft` with `image` in `--moss-700`; the waveform's bars `--icon-on-well`. Pills (*Connected*, *Allowed*, the filed pill) are `--text-accent` on `--surface-accent-soft`; the phones reuse 031's `StatusPill`. The skip button's tonal fill is `--surface-fill-strong`. All heights are minimums.

## Phones (`apps/mobile`)

- `lib/firstRun.ts`, new: the five functions above.
- `lib/gate.ts`: the copy changes above.
- `components/firstrun/`, new, every piece taking `tone: "ios" | "android"`:
  - `RunFooter.tsx`: `{ tone, main: { label, onPress, disabled? }, skip?: { label, onPress } }`.
  - `StoryBars.tsx`: three segments; the active one's fill is a Reanimated width driven from a shared value restarted per scene; still at the scene's end when not animating.
  - `IntroArt.tsx`: the three scenes, each a component taking `{ tone, animate }`. Entrances are Reanimated `withDelay(withTiming)` on opacity, translateY and scale with the handoff's beziers. Scene 1's filing measures the bubbles and the two thread rows with `onLayout` (in the art box's coordinates), then animates each bubble's translate and scale to its thread's centre, and the thread's ring, scale and count on landing. With `animate` false every scene renders its end state, scene 1 with the bubbles gone and the counts at 4 and 3.
  - `Intro.tsx`: status, bars, the art box with `PrismField variant="bloom" veil="none" arriveOnMount` absolutely behind the art, the copy block (min height 190, opaque `bg-surface-page` or `bg-a-surface`) cross-fading between scenes, the footer. A JS timer advances every 9.6s when `autoAdvance` is true; the art is a `Pressable` with `accessibilityRole="button"` and label *Next scene* that calls `introNext` and restarts the timer. Reduced motion and the screen reader come from `AccessibilityInfo.isReduceMotionEnabled` and `isScreenReaderEnabled` with their change listeners. The copy block is `accessibilityLiveRegion="polite"` and the art's children are `importantForAccessibility="no-hide-descendants"` / `accessibilityElementsHidden`.
  - `BeforeYouStart.tsx`: the title, the name block (`NameField` in its new first-run size, ringed on focus), the consent block (`ConsentTicks`), the failure line, the footer; in a `ScrollView` inside the existing `KeyboardAvoidingView`.
  - `BringThingsIn.tsx`: the title, the lead, the cards, the footer. The Mail card copies with `expo-clipboard` and toasts *Copied*; Add to contacts opens `MAIL_CARD_URL`. Calendar runs `WebBrowser.openAuthSessionAsync(`${API_URL}/api/connectors/google/start?landing=first-run-bring`, `${WEB}/welcome/bring`)` and reloads the calendars on return. Notifications calls `Notifications.requestPermissionsAsync()`, then `register()` on a grant, and `Linking.openSettings()` once refused.
  - `FirstRun.tsx`: the state (`step`, `scene`, name, ticks, `leaving`, `failed`, the notification offer read once on mount) and `completeOnboarding`, choosing the screen. After a successful write it waits for `me`, the calendars and the notification read to settle (the button stays working) before `afterYou` decides. Android's `BackHandler`: `you` goes back to `intro`, `bring` goes to Today. Replaces the body of both `Welcome.*.tsx`.
- `components/screens/Welcome.ios.tsx` and `Welcome.android.tsx` become `<FirstRun tone="ios|android" replay={replay} />`, keeping the platform fork Metro resolves.
- `ConsentTicks.tsx`: 16px labels, 24px boxes at radius 7 (Android 20 at radius 3), a hairline between the rows, the note with `lock`. Used only by first run.
- `NameField.tsx`: a `size="large"` for first run (54px, radius 14, 1.5px ring, 2px ink when filled, 18px text; Android radius 4, 2px blue focused). Settings keeps the default.
- `TutorialArt.tsx` and `ConnectStepBar` are deleted. `GateBackdrop` stays for the sign-in screens.

## Web (`apps/web`)

- `src/lib/first-run.ts`, new: the same five functions; its tests are the phones' cases.
- `src/components/firstrun/copy.ts`: the copy table.
- `src/components/firstrun/RunFooter.tsx`, `IntroArt.tsx`, `Intro.tsx`, `BeforeYouStart.tsx`, `BringThingsIn.tsx`, with `first-run.module.css` beside them. The art animates with CSS keyframes restarted by a `key` per scene, as the exploration does; scene 1's filing reads the bubble and thread boxes with `getBoundingClientRect` and sets `--dx` and `--dy`, as the exploration's `fileScene` does. `prefers-reduced-motion` from `matchMedia` stops the timer and draws end states. The intro's timer pauses on `pointerenter` and `focusin` and resumes on `pointerleave` and `focusout` (when focus leaves the intro), keeping the elapsed time; the bar's animation is paused with `animation-play-state`.
- The bloom: `public/prism/bloom.webp`, the phones' `p2-bloom-1.webp`, absolutely behind the art.
- `src/components/FirstRun.tsx`: intro and Before you start, as the phones'. On success, once the calendars read has settled, it goes to `/welcome/bring` when `bringCards` is non-empty for the account, else `/today`. Notifications are always `"unsupported"` on the web.
- `src/app/(app)/welcome/bring/page.tsx`, new: `BringThingsIn` reading `useMe("shell")`, since the account is active by then; `stillAsking` is not loosened, so an account mid first run is sent to `/welcome`. It is reachable later by URL and that is harmless: every card on it is also in Settings. The pill follows the calendars read, never `?calendar=`.
- `src/app/(app)/tutorial/page.tsx`: the intro alone with Done to `/settings/help`.
- `MailBlock.tsx`: `MailOffer`, `MailOfferButton`, `MAIL_OFFER_TITLE` and `mailOffered` go; the card is in `BringThingsIn`. `connectUrl` takes `"first-run-bring"`.
- `RunArt.tsx` is deleted, and the `run*` classes in `auth.module.css` that only first run used.
- The privacy page's two sentences. `UPDATED` is already 3 October and `CONSENT_VERSION` does not move: the change is drafting, not what is consented to.
- Help's row note on both clients: *The intro from your first day.*

## Edge cases

- **Killed or closed on Bring it all in:** the account is active; the next launch goes to Today.
- **Killed on the intro or Before you start:** nothing was written; the next launch starts first run again.
- **Calendar connected before first run** (another device): no Calendar card.
- **Notification permission already decided** on the phone: no card; read once when the screen opens, so the card does not vanish under the person's thumb after they answer.
- **The OAuth round trip on the phone:** the browser sheet ends on the web's `/welcome/bring`; the app reloads the calendars when the sheet closes and the pill follows. A failure changes nothing on the card.
- **Replay** writes nothing: no `completeOnboarding`, no name, no permission.

## Constitution check

- **OFF-1:** nothing new in events or logs; `onboarding_completed` is unchanged and has no properties.
- **OFF-3:** the landing is sealed state, resolved server side; connecting and the calendars are already scoped to the session's account.
- **OFF-6:** no automatic action. Connect and notifications are each the person's own tap.
- **OFF-7:** divergences from the exploration are logged in the design decision log in the same change.
- **QUAL-1:** every task starts with its failing test.
- The privacy page changes in the same change, with the owner's wording.

## Tests

Red first, each.

- **Core API:** start and push-token registration refuse an `invited` account with 403 and accept an `active` one; `first-run-bring` seals and opens; the start route accepts it; the callback's failure and success both redirect to `/welcome/bring?calendar=...`; `first-run` and `settings` keep their destinations; an unknown landing is refused.
- **Both clients, `first-run` logic:** the five functions, including no cards skipping Bring it all in.
- **Mobile source checks** (as `loose-screens.test.ts` reads source, since there is no render harness): no `requestPermissionsAsync` in first run outside the Notifications card; no `Skip`/`Not now` corner labels; `landing=first-run-bring` in the connect call; `GateBackdrop` not used by first run.
- **Web render tests** (happy-dom, as `tutorial.test.tsx`): the intro's titles and Continue; the timer advancing and the art button moving on; reduced motion not advancing; hover pausing; Before you start's disabled Continue, one `completeOnboarding` with name and zone, the failure line; Bring it all in's cards per account, Copy, Skip for now and Done to Today; `/tutorial` with Done to Help and no write; the name-only path.
- **Privacy:** the page renders the two new sentences and neither old one.

## Review outcome

The project, client and security reviews ran on the feature spec on 2026-10-03. Folded in: the web return route and the phones' return (both had no stated path), the settled-reads rule before skipping, the art's end states as criteria, `--text-accent` pills, a bar track that survives dark, focus rather than content ringing the name field, minimum heights, Android token mapping and back, `requireActive`, the exhaustive landing switch, *Connected* from data rather than the URL, the owner's rewording of *things*, and the stale 019, 024 and 031 references.

Deliberately not done here, each pre-existing and offered as its own task: the connect state is signed but not encrypted, so the PKCE verifier is readable in the URL; mail-in matches a sender by email without checking the account is active; a push token already registered to one account moves to another on conflict.
