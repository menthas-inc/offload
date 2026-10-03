# 033 First run, three screens, feature spec

**Status:** drafted 2026-10-03, revised the same day after the project, client and security reviews, from the design system's *First run is three screens* (decisions.md, 2026-10-03; the readme's **First run**, carried in the bundle and not yet applied; `handoff/APPLY-2026-10-03-onboarding.md`; `explorations/onboarding-v2.html` with `onboarding-screens.js`) and the owner's answers of the same day
**Surfaces:** iOS, Android, web, and one landing on the Core API
**Depends on:** 002 (getting in, the consent), 011 (names), 019 (calendars), 024 (notifications), 026 (mail), 031 (See the tutorial again)
**Amends:** 002's first run (the tutorial, the step order, Skip); 011's name step, which joins the consent; 019's first-run connect step and its landing (Settings' connect block, with its two facts, is untouched); 024's "permission asked once, on first run", which is now asked only from a card, with Settings' Notifications page the way in for anyone who skips; 026's Mail step; 031's Help row, whose note becomes *The intro from your first day.*

## Why

First run works and is too long for what it does. Read from the code on 3 October:

- **Seven screens after sign in**, eight with the system dialog: three still tutorial pictures, the name, the consent, the notification dialog, Forward what matters, Bring in your calendar. Connecting a calendar ends on the Calendar settings page, not Today.
- **The tutorial's text is small for the room it has**, and the three pictures show nothing moving, nothing shared and none of the ways in.
- **The consent paragraph sits on the prism**, at `body-sm`, where the bloom is strongest.
- **Skip and Not now are 15px labels top right** while Next is a full-width button under the thumb. Declining is a reach and moving on is easy.

## What

Everything not listed here stays as built: sign in, no-invite, waitlist, joined; the name-only path for accounts that finished first run before names; `completeOnboarding(name, zone)` writing name, consent and zone in one request, refused by the server without both consents; the failure line *That did not go through. Check your connection and try again.*; the `onboarding_completed` event with no properties.

### 1. The flow

**Intro, Before you start, Bring it all in, Today.** Three screens. First run always ends on Today.

### 2. The footer

One shape for every first-run screen: one or two pill buttons in a row at the bottom.

- **Two buttons:** the way past on the left (*Skip for now*), the main action on the right and wider (columns 1 : 1.5, 10px apart). Phones: at least 54px tall, 17px medium (Android 56, 16px). iOS: main `--ink-950` with `--text-inverse`, Skip `--surface-fill-strong` with `--text-primary`. Android: main `--blue-600` with `--text-on-solid`, Skip outlined in `--border-strong` with `--blue-700` text. Web: both sized to their label, at least 50px tall, 28px side padding, at the end of the column, 12px apart. Every height in this spec is a minimum: labels scale with the text size.
- **One button:** full width on the phones; sized to its label on the web.
- **Disabled:** `--ink-100` with `--ink-400` text.
- 14px above, 18px below, 24px gutter on the phones.
- **No first-run screen puts Skip or Not now in a corner.**

### 3. The intro

One screen that plays itself, replacing the three tutorial screens.

| | Title | Line |
| --- | --- | --- |
| 1 | offload keeps track for you | Dump what you would otherwise forget. offload remembers it and puts it in order. |
| 2 | Everything lands in threads | What belongs together gathers in one thread. Share it, and plan it with the people in it. |

The exploration's lines 1 and 2 used *things*, a retired noun; reworded (owner, 2026-10-03).
| 3 | Send it any way | Type it, say it, snap a photo, or forward the email. |

- **Layout, phones:** story bars (three 4px segments, 6px apart, track `--ink-950` at 10% so it flips with the theme, fill `--ink-950`, Android `--blue-600`); the art in the flexible space with the prism bloom behind it; the copy on `--surface-page` (at least 190px tall so the footer does not move between scenes); the footer. **Web:** two columns 64px apart: the art on the left (at most 440 wide and 480 tall) over the bloom; the bars, the copy and the footer on the right, at most 470 wide.
- **Type:** title 34px semibold, 1.08, -0.025em (Android 36, web 52), balanced; line 18px, 1.45, `--text-secondary` (web 20), 14px under the title. The copy cross-fades between scenes: 600ms opacity and an 8px rise.
- **Timing:** each scene 9.6s, its bar filling linearly, earlier bars full. After scene 3 it loops to 1. **Tapping the art** goes to the next scene and restarts its clock.
- **One button, Continue**, full width, the same on every scene. It leaves from any scene to Before you start. No Next and no Skip.
- **The art.** All entrances 900ms, from 14px down at 0.96 scale, `cubic-bezier(.2,.8,.2,1)`; times from the start of the scene.
  The milliseconds below are the reference for the build, not acceptance criteria; each scene's end state is (AC-19).
  1. *Dumps filed into threads.* Two thread rows at the bottom (raised, hairline, radius 16, a 34px well with `lasso` and `bookmark`; Android `a-c-low` on an `a-c-high` well, the ring only on a hit): *Lisbon trip* `2` at 0s and *Bookshelf build* `1` at 0.3s. Four bubbles above (raised, hairline, `--shadow-1`, radius 20, 16px, alternating left and right) at 1.0, 1.7, 2.4 and 3.1s: *Ana can only travel the 14th to the 17th*, *matte black, 30cm*, *€214 for the flights*, *4 more shelf brackets*. From 4.6s each bubble in turn, 650ms apart, travels to the centre of its thread (Lisbon, Bookshelf, Lisbon, Bookshelf) over 1.1s, shrinking to 25% and fading, `cubic-bezier(.5,0,.3,1)`. As it lands, 950ms after leaving, the thread takes a 1.5px ink ring (Android blue), scales to 1.03 for 550ms and its count goes up by one, ending at `4` and `3`.
  2. *A shared thread.* A card (radius 20, `--shadow-2`): the `lasso` well, *Lisbon trip* 19px semibold and an avatar stack; three rows with glyphs (*Alfama flat, 14 to 17 Oct* `calendar`, *Flights, €214* `tag`, *Ana can only travel the 14th to the 17th* `text-quote`). The people are flat 28px circles on `--label-1`, `--label-2` and `--label-6` with `--text-on-solid` initials and a 2px ring of the card's surface, a picture of people rather than anyone's mark, so not `Avatar`. Ana's and Tom's pop in at 2.0 and 2.6s (700ms from 0.4 scale, overshooting); at 3.2s the inverse pill *Shared with Ana and Tom* (`users`) under the card; at 5.0s a row on `--surface-accent-soft` slides in: Tom's avatar and ***Tom** added Pastéis de Belém*.
  3. *Any way in.* A 2 by 2 grid of input cards at 0, 0.8, 1.6 and 2.4s: *Photo* (an 88px tile on `--surface-accent-soft` with `image` in `--moss-700`, in place of the exploration's raw gradient), *Voice note, 0:12* (an 88px waveform on `--surface-fill`, bars `--icon-on-well`, breathing), *Email* (*Fwd: Your booking is confirmed*, *Alfama, 14 to 17 Oct*), *Link* (*airbnb.com/rooms/4471*, *Read and filed*). At 4.4s the pill *All four filed in Lisbon trip* with `check`, on `--surface-accent-soft` in `--text-accent` (031 measured `--moss-700` on that fill at 3.81:1 in dark).
- **Reduced motion:** scenes do not advance on their own, cut with no entrances, the bars do not animate and the waveform does not breathe; each scene shows its end state: scene 1 filed (no bubbles, counts `4` and `3`), scene 2 with both people, the pill and Tom's row, scene 3 with four cards and the pill. Tapping the art, or its keyboard equivalent, moves on.
- **Screen readers (phones):** with VoiceOver or TalkBack running, scenes do not advance on their own; the art is a button named *Next scene*; Continue leaves as for everyone.
- **Pausing (web, owner 2026-10-03):** the web cannot tell whether a screen reader is running, so its intro stops advancing while the pointer is over it or keyboard focus is inside it, and resumes from where it stopped. The art is a button named *Next scene* there too.
- **The prism** blooms behind the art only, inside the art's box, with the copy opaque over its lower edge. No text sits on the field. The web gains the bloom for this screen.
- **Accessibility:** the art's drawing is hidden from assistive technology; the copy is a polite live region announcing each scene's title and line; the bars are presentation.
- **Replay** (`/tutorial`, Help's *See the tutorial again*): this screen alone. The button reads **Done** and goes back to Help. Nothing is written or asked.

### 4. Before you start

One screen on the plain page, no prism. Title *Before you start* (34, 36, web 44), no lead.

- **What should we call you?** as an 18px semibold section head, then the name field: at least 54px, radius 14, a 1.5px `--border-strong` ring, 2px `--ink-950` **while focused** (the exploration's filled ring is a mock of focus, and a focus ring is never removed; Android: radius 4, outlined in `--border-strong`, 2px `--blue-600` focused), 18px text, seeded from `suggestedName` as now. Under it at 14px secondary: *This is the name people you share a thread with will see.*
- **What you are agreeing to** as a section head, then the two ticks verbatim at **16px**, with 24px boxes (radius 7; Android 20px, radius 3, edge `--border-strong`), larger than `Checkbox`'s 20 by the handoff's choice and logged and a hairline between the two rows; then the note in the attention box with a `lock` glyph at 14.5px.
- **One button, Continue**, disabled until the name has a character and both ticks are on. It runs `completeOnboarding`; on failure the inline failure line shows above it and the screen stays. **It decides draw or skip only from settled reads**: the account, the calendars and (phones) the notification permission are read during the intro, and if any is still in flight when the write succeeds, the button stays in its working state until they settle. A calendars read that fails counts as no Calendar card.
- With the keyboard up the screen scrolls and the footer stays above the keyboard.
- **The notification permission request no longer fires here.**
- **The name-only path** (an account that finished first run before names) is this screen without the second section, titled *What should we call you?*, its button *Continue*, saving the name and going to Today.

### 5. Bring it all in

Optional, after the account is active. Title *Bring it all in* (the exploration's *Bring things in* reworded, owner 2026-10-03), lead *All optional. Each one is in Settings if you would rather wait.* (17px, 1.45), then up to three cards 12px apart.

**A card** is `--surface-raised`, radius 18, hairline, 16px padding (Android `a-c-low`, radius 24, no ring): a 44px mark (radius 12), a 17px semibold title, a 14.5px line, and under them a row of buttons that share the card's width equally (at least 38px with a 44px target, 14px medium, outlined in `--border-strong`; Android 40px). *Connected* and *Allowed* are the settings status pill (031), `--text-accent` on `--surface-accent-soft`.

| Card | Mark | Title | Line | Buttons |
| --- | --- | --- | --- | --- |
| Mail | `mail` on `--surface-accent-soft`, `--moss-700` | Forward emails to offload | Send anything to **over@to.offload.club** from {email} and it is filed. | **Copy address** (`copy`; toast *Copied*), **Add to contacts** (the contact card, as now) |
| Calendar | the Google Calendar mark | Bring in your calendar | So "before the trip" and "after the dentist" mean something. | **Connect Google Calendar** (filled) |
| Notifications | `bell` on `--surface-attention-soft` | Hear about what is due | We will reach you at the right time with the right reminders and information. | **Allow notifications** |

- **Calendar:** connecting runs the same Google flow with a new landing, **`first-run-bring`**, which the API sends to the web's **`/welcome/bring`** for both outcomes instead of the Calendar page. *Connected* is drawn from the calendars the API returns, never from the `?calendar=` parameter. **Web:** the connect is a full navigation, so `/welcome/bring` is its own page for an active account and reads the calendars when it loads. **Phones:** the browser session is given `/welcome/bring` as its return, as Settings gives `/settings/apps`; when the session closes, by itself or by hand, the screen is still mounted and reads the calendars again. Cancel and failure look the same: the button stays. Which calendars to use stays a choice on the Calendar page for later.
- **Notifications** asks the system from the button. Granted: the button becomes an *Allowed* pill and the phone registers for pushes. Refused: the button becomes *Open settings*, which opens the app's system settings. Nothing else is said.
- **A card that cannot apply is not drawn:** Mail for an Apple hidden email; Calendar when the connector is not available or a calendar is already connected; notifications on the web, and on a phone whose permission is already decided (granted or refused) when the screen first shows. **With no cards left the screen is skipped** and Continue on Before you start goes to Today.
- **Footer:** *Skip for now* and *Done*, both to Today. Done requires nothing.
- **Android back:** on Before you start it returns to the intro; on Bring it all in it goes to Today, as Skip for now does. Steps change in place with no navigation transition, as now.
- **Web:** cards in one column, 640px wide.
- **Leaving partway:** the account is active by now, so closing the app or the tab here costs nothing; the next launch lands on Today, and every card is in Settings.

### 6. The server

The screen is not the only thing keeping content behind consent. **Every write behind a session** (under `/v1/`, `/api/connectors/` and `/api/calendar/`), starting a calendar connect, and the connect's callback are refused (403 `not_active`) for an account that is not active, so an account mid first run cannot dump, upload, connect or register anything by calling the API directly. Joining the waitlist, taking a push token away, and first run's own routes stay open. Mail-in matches only an active account.

### 7. Type and spacing

Titles 34px, 1.08, -0.025em semibold, balanced (Android 36, web 44, the web intro 52). Leads 17px, 1.45. Section heads 18px semibold. 24px gutter on the phones; 22px above the title.

## Privacy

The privacy page says consent is *given on the last screen of first run* and that *first run ends with two tick boxes rather than a button*. Both stop being true. Reworded to drop the position (owner, 2026-10-03): *Your explicit consent, given in first run* and *it is why first run asks for two tick boxes rather than a button*. Nothing about what is collected, who receives it or how long it is kept changes. The notification ask moves screens; what notifications carry does not.

## Acceptance criteria

- **AC-1** After sign in, an account that needs first run sees the intro, then Before you start, then Bring it all in when any card applies; Done and Skip for now land on Today, and nothing in first run lands anywhere else.
- **AC-2** The intro shows the three scenes' titles and lines verbatim; it advances every 9.6s, loops after the third, and tapping the art moves to the next scene and restarts its clock; Continue leaves from any scene.
- **AC-3** With reduced motion, or a screen reader running on a phone, the intro does not advance on its own and its art shows each scene's end state; the art is a button named *Next scene*. On the web it stops advancing while hovered or focused within.
- **AC-4** The copy is a polite live region; the art's drawing is hidden from assistive technology.
- **AC-5** Before you start shows the name field and both ticks on one screen; Continue is disabled until the name has a character and both ticks are on; it sends one `completeOnboarding` with the name and the zone; on failure the failure line shows and nothing moves.
- **AC-6** No notification permission is requested anywhere in first run except from the Notifications card's button.
- **AC-7** Bring it all in draws only the cards that apply, per the rules above, and is skipped entirely when none do.
- **AC-8** Mail's Copy address puts the address on the clipboard and shows *Copied*; Add to contacts opens the contact card.
- **AC-9** Connect Google Calendar starts the flow with `landing=first-run-bring`; the API returns that landing to `/welcome/bring` for both outcomes; the web page and the phones' screen draw *Connected* from the calendars read, not from the URL.
- **AC-10** The API accepts `first-run-bring` as a landing, still accepts `first-run` (only for states minted before this ships, which expire in ten minutes, and removable after) and `settings` with their current destinations, and rejects anything else as it does now.
- **AC-11** The notifications button asks the system; granted shows *Allowed* and registers the phone; refused shows *Open settings*, which opens the app's settings.
- **AC-12** Skip for now and Done on Bring it all in both go to Today, with nothing required.
- **AC-13** No first-run screen draws Skip or Not now in a corner; two-button footers put Skip for now on the left.
- **AC-14** See the tutorial again shows the intro alone, its button reads Done and returns to Help, and nothing is written or asked.
- **AC-15** The name-only path shows the name field alone, saves the name and goes to Today, with no consent and no Bring it all in.
- **AC-16** The prism blooms only behind the intro's art; Before you start and Bring it all in are on the plain page.
- **AC-17** The privacy page's two sentences read as worded above.
- **AC-18** No em or en dash, emoji or retired word in any new copy or identifier; `TUTORIAL`, `TutorialArt`, `ConnectStepBar`, `offersFor`, `dotsFor`, `mailStep`, the web `RunArt`, `MailOffer` and the separate Mail and Calendar steps are gone. Settings' connect block and its two facts stay.
- **AC-19** Each scene's end state, with or without motion: scene 1 counts `4` and `3` with no bubble left; scene 2 three people, the *Shared with Ana and Tom* pill and Tom's row; scene 3 four cards and *All four filed in Lisbon trip*.
- **AC-20** Every write behind a session under `/v1/`, `/api/connectors/` and `/api/calendar/`, `/api/connectors/google/start`, and the connect's callback refuse an account that is not active, before reading the body; the waitlist, removing a push token and first run's own routes do not.
- **AC-21** Help's See the tutorial again row reads *The intro from your first day.*

## Not in this pass

- The kits are not redrawn; the exploration is the reference.
- B (one setup screen), C (a first dump in first run, connections on Today) and the stacked footer, all considered and not taken.
- First run's sign-in screens, which stand.
