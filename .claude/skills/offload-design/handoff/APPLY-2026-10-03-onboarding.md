# Apply: Onboarding, three screens

Drawn in `explorations/onboarding-v2.html` with the product owner on 3 October 2026, against `main`
read on 3 October: `apps/mobile/components/screens/Welcome.ios.tsx`, `Welcome.android.tsx`,
`apps/mobile/lib/gate.ts`, `TutorialArt.tsx`, `ConsentTicks.tsx`, `ConnectStep.tsx`, `GateBackdrop.tsx`,
`apps/web/src/components/FirstRun.tsx`, `ConnectBlock.tsx`, `MailBlock.tsx`. All three surfaces.
Standalone copy: `handoff/onboarding-standalone.html`, with the iOS, Android and web switch.

**Ready to build. Nothing is open.** The readme's **First run** is the lasting statement; this file is
the build order. Decisions log: *2026-10-03 · First run is three screens*. The first round, with the
directions not taken, is `explorations/onboarding.html`. The kits are not redrawn; the exploration is
the reference.

**Unchanged:** sign in, no-invite, waitlist and joined; the name-only path for accounts that finished
first run before names (`nameOnly`); `completeOnboarding(name, zone)` writing name, consent and zone
in one request, with the server still refusing it without both consents; the failure line *That did
not go through. Check your connection and try again.*; `onboarding_completed` with no properties.

---

## 0. The flow

| | Now | Decided |
| --- | --- | --- |
| 1 | Dump anything | **Intro**, one screen, three scenes |
| 2 | offload sorts it | **Before you start**: name and consent |
| 3 | It only interrupts when it matters | **Bring things in**: Mail, Calendar, notifications (optional) |
| 4 | What should we call you? | Today |
| 5 | Before you start | |
| 6 | (notification dialog) | |
| 7 | Forward what matters | |
| 8 | Bring in your calendar, ending on `/settings/calendar` | |

The step state in `Welcome.*.tsx` and `FirstRun.tsx` becomes `intro | you | bring`. The `offering`
state, `offersFor`, `dotsFor`, `ConnectStepBar` and the separate Mail and Calendar steps go.

## 1. Shared footer

New `RunFooter` (both clients): one or two pill buttons in a row at the bottom.

- **Two buttons:** a grid of `1fr 1.5fr`, 10px gap. Left the way past (*Skip for now*),
  right the main action. Phones: 54px tall (Android 56), 17px medium (Android 16).
  - iOS: main `--ink-950` with `--paper` text; Skip `--surface-fill-strong` with `--text-primary`.
  - Android: main `--blue-600` with white; Skip outlined, 1px `#79786F`, `--blue-700` text.
  - Web: both sized to their label (50px tall, 28px side padding), at the end of the column, 12px gap.
- **One button:** full width (web: sized to label, at the end).
- Disabled: `--ink-100` with `--ink-400` text.
- 14px above, 18px below, gutter 24px on the phones.

**The top-right Skip and Not now labels are removed** everywhere in first run.

## 2. Intro

One screen replacing the three tutorial screens and `TutorialArt`.

**Layout, phones:** status bar; 4px story bars, three segments, 6px gap, `--gutter` 24 (track
`rgb(0 0 0 / .1)`, fill `--ink-950`, Android `--blue-600`); the art in the flexible space with the
prism bloom behind it; the copy block on `--surface-page` (minimum 190px so the footer does not jump
between scenes); the footer. **Web:** two columns, art on the left (max 440 wide, 480 tall) over the
bloom, on the right the bars, the copy and the footer, max 470 wide; 64px gap.

**Copy** (in `gate.ts` as `INTRO`, replacing `TUTORIAL`; the web repeats it):

| | Title | Line |
| --- | --- | --- |
| 1 | offload keeps track for you | Dump the things you would otherwise forget. offload remembers them and puts them in order. |
| 2 | Everything lands in threads | Related things gather in one thread. Share it, and plan it with the people in it. |
| 3 | Send it any way | Type it, say it, snap a photo, or forward the email. |

Title 34px semibold, 1.08, -0.025em (Android 36; web 52); line 18px regular, 1.45, `--text-secondary`
(web 20), 14px under the title. The copy cross-fades between scenes: 600ms opacity and an 8px rise.

**Timing:** each scene 9.6s; the active bar fills linearly over it, earlier bars full. After scene
3 it loops to 1. **Tapping the art** goes to the next scene and restarts its clock.

**One button, Continue**, full width, the same on every scene. It leaves from any scene and goes
to Before you start. There is no Next and no Skip intro: the scenes advance themselves, so the only
thing left to decide is leaving.

**The art** (all entrances: 900ms, from 14px down at 0.96 scale, `cubic-bezier(.2,.8,.2,1)`; times
are from the start of the scene):

1. **Dumps filed into threads.** Two thread rows at the bottom (raised, hairline, radius 16): *Lisbon
   trip* `2` at 0s and *Bookshelf build* `1` at 0.3s. Four bubbles above them (raised, hairline,
   `--shadow-1`, radius 20, 16px text, alternating left and right), entering at 1.0, 1.7, 2.4 and 3.1s:
   *Ana can only travel the 14th to the 17th*, *matte black, 30cm*, *€214 for the flights*, *4 more shelf
   brackets*. **From 4.6s each bubble is filed in turn**, 650ms apart: it travels to the centre of its
   thread (Lisbon, Bookshelf, Lisbon, Bookshelf) over 1.1s, shrinking to 25% and fading,
   `cubic-bezier(.5,0,.3,1)`. As it lands (950ms after it leaves) the thread takes a 1.5px ink ring
   (Android blue), scales to 1.03 for 550ms and its count ticks up by one, ending at *Lisbon trip* `4`
   and *Bookshelf build* `3`. These strings are the intro's own (`INTRO_DUMPS` in `gate.ts`);
   *dentist after the 20th* is dropped, since it belonged to neither thread.
2. **A shared thread.** A thread card: header with the `lasso` well, *Lisbon trip* 19px semibold, and
   an avatar stack; three item rows (*Alfama flat, 14 to 17 Oct*, *Flights, €214*, *Ana can only travel
   the 14th to the 17th*) with their glyphs. Ana's and Tom's avatars pop in at 2.0 and 2.6s (700ms, scale from
   0.4, overshooting); at 3.2s a pill *Shared with Ana and Tom* (`users`, inverse) appears under the
   card; at 5.0s a new row on `--surface-accent-soft` slides in: Tom's avatar, ***Tom** added Pastéis
   de Belém*.
3. **Any way in.** A 2×2 grid of input cards, entering at 0, 0.8, 1.6 and 2.4s: *Photo* (an 88px image
   tile), *Voice note, 0:12* (an 88px waveform whose bars breathe), *Email* (*Fwd: Your booking is
   confirmed*, *Alfama, 14 to 17 Oct*), *Link* (*airbnb.com/rooms/4471*, *Read and filed*). At 4.4s
   the pill *All four filed in Lisbon trip* with `check`, on `--surface-accent-soft`, `--moss-700`.

**Reduced motion:** scenes cut with no entrances and the bars do not animate; the art shows each
scene's end state.

**The prism:** `GateBackdrop` moves from wrapping every step to sitting **inside the art box only**,
behind the art, with the copy block opaque over its lower edge. No text is ever on the field.

**Replay** (`/tutorial`, Help's *See the tutorial again*): this screen alone. The button reads
**Done** and goes back to Help, as `replay` does now.

**Accessibility:** the art is `aria-hidden`; the copy block is a live region announcing the title
and line on each scene; the bars are presentation. VoiceOver and TalkBack users get no auto-advance
(screen reader running: scenes do not auto-advance; the art is a button, *Next scene*, and Continue
leaves as for everyone).

## 3. Before you start

One screen, **on the plain page, no prism.** Title *Before you start* (34/36/44px as above), and no
lead under it: **`CONSENT.sub` is removed** from first run.

- **What should we call you?** (18px semibold section head): the name field, 54px, radius 14,
  1.5px `--border-strong` ring, 2px ink when filled (Android: 4px radius outlined field, 2px blue
  focused), 18px text, seeded as now from `suggestedName`. Under it, 14px secondary,
  `NAME_STEP.sub`.
- **What you are agreeing to**: the two ticks, verbatim `CONSENT`, at **16px** (up from `body-sm`),
  24px boxes (radius 7; Android 20px, radius 3), a hairline between them; then `CONSENT.note` in the
  attention box with a `lock` glyph, 14.5px.
- **Footer:** one button, **Continue**, disabled until the name has a character and both ticks are on.
  It runs `completeOnboarding`; on failure the failure line shows above it.
- The screen scrolls when the keyboard is up; the footer stays above the keyboard (the existing
  `KeyboardAvoidingView` behaviour).

**The notification permission request no longer fires here.**

## 4. Bring things in

Optional, after the account is active. Title *Bring things in*, lead *All optional. Each one is in
Settings if you would rather wait.* Then up to three cards, 12px apart.

**Card:** `--surface-raised`, radius 18, hairline, 16px padding (Android `#F1EFEA`, radius 24, no
ring). A 44px mark (radius 12), title 17px semibold, a 14.5px line; under them a row of buttons that
**share the card's width equally** (38px, 14px medium, outlined; Android 40px).

| Card | Mark | Title | Line | Buttons |
| --- | --- | --- | --- | --- |
| Mail | `mail` on `--surface-accent-soft`, `--moss-700` | Forward emails to offload | Send anything to **over@to.offload.club** from {email} and it is filed. | **Copy address** (`copy`, toast *Copied*), **Add to contacts** (`MAIL_CARD_URL`, as now) |
| Calendar | the Google Calendar mark (`googleCalendarMark`) | Bring in your calendar | `CONNECT_STEP.sub` | **Connect Google Calendar** (primary fill) |
| Notifications | `bell` on `--surface-attention-soft` | Hear about what is due | We will reach you at the right time with the right reminders and information | **Allow notifications** |

- **Calendar connect** runs the same auth session with **`landing=first-run-bring`** (new), which
  returns here instead of to `/settings/calendar`. Back on this screen the card's button becomes a
  *Connected* pill. The *which calendars* choice stays on the Calendar page for later.
- **Notifications** calls `requestPermissionsAsync` from the button. Granted: the button becomes an
  *Allowed* pill. Denied: the card says nothing more and the button becomes *Open settings*.
- **A card that cannot apply is not drawn:** Mail when `!mailAvailable` (Apple hidden email);
  Calendar when the connector is unavailable or already connected; notifications on the web, and
  on a phone where permission is already decided. **No cards left: the screen is skipped** and
  Continue goes to Today.
- **Footer:** **Skip for now** and **Done**, both to Today. Done does not require anything.
- The web: cards in one column, 640px wide.

## 5. Shared type and spacing

- Title role for first run: 34px / 1.08 / -0.025em semibold, `text-wrap: balance` (Android 36,
  web 44, web intro 52). Lead 17px / 1.45. Section head 18px semibold.
- Gutter 24px on the phones; 22px above the title.
- The kits' `TutorialScreen`, `ConnectScreen`, `StepBar` in `FirstRun.jsx`, `M3FirstRun.jsx`
  and `WFirstRunGate.jsx` are superseded by the exploration.

## Build order

1. `RunFooter`, and the removal of the top-right Skip and Not now.
2. Before you start: name and consent on one screen, the prism removed behind it, the notification
   request removed from `finish`.
3. Bring things in, with the new `landing` and the card rules.
4. The intro: copy, art, timing, reduced motion, replay.

## Not in this pass

Considered with the owner and not taken: B (one setup screen after the intro), C (a first dump in
first run, with connections as cards on Today), and the stacked footer.
