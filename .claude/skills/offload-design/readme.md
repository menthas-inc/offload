# offload, design system

**offload** is an AI assistant mobile app for organising thoughts and information day to day, alone or with other people. You collect products for a new bookshelf, note three unrelated things at once, plan a trip with friends. Today that lives across a calendar, a WhatsApp thread you send to yourself, screenshots, and a notes app, so details get lost and nothing is findable later. offload is the one place you dump it all, and it does the filing.

The product philosophy drives the design language: **you dump things in, offload hides the complexity.** The interface never asks you to choose a folder, a type, or a format before you can put something down. Structure appears afterwards, and it can always be corrected.

## Sources

No design sources were provided for this system. There was **no codebase, no Figma file, no deck, and no existing screenshot**, only the written brand brief (offload's positioning, plus the note that the app is simple, minimal, and black on white). Everything here is authored from first principles against that brief.

That has three consequences worth knowing before you trust this system:

1. **The mark was designed here, with the brand owner, in August 2026.** It is a dot above an open vessel, a thought let go of downwards, into something that catches it. The vessel never gains a lid, the dot never touches it, and the whole thing is one colour: ink on light, paper on ink, no greys and no accent. Clear space equals the dot's diameter; 16px is the floor. Ships as `assets/mark.svg`, `assets/mark-inverse.svg`, `assets/app-icon.svg` and the `Logo` component. The wordmark beside it is live text (Instrument Sans 600, `-0.03em`, always lowercase), not an outlined file, so it depends on the substituted typeface below. `explorations/logo-exploration.html` is the full record of how it was chosen.
2. **The typefaces were chosen here and confirmed.** No licensed binaries were supplied, so Instrument Sans and Literata are served from the Google CDN, and on 25 August the brand owner confirmed they are the real faces of this system rather than placeholders. `tokens/fonts.css` becomes self-hosted `@font-face` rules whenever hosting matters.
3. **The mobile app UI kit is a proposal.** `ui_kits/mobile_app/` is a first-principles design, not a recreation of shipped UI. React to it; it is meant to change.

If a Figma file, repo or design doc does exist, attach it and this system should be re-derived from it, the attached source always wins over what is written here.

## Products

| Surface | Status | Where |
| --- | --- | --- |
| Mobile app, iOS (390×844) | Designed here as a proposal | `ui_kits/mobile_app/` |
| Mobile app, Android (360×800, Material 3) | Same product, platform chrome only | `ui_kits/android_app/` |
| Web app (1440, two panes) | Designed here: sidebar, a stack of panes, one composer | `ui_kits/web_app/` |
| Marketing site | Landing page and the one transactional email shell | `ui_kits/marketing_site/` |
| Admin panel (1440) | Staff-only: waitlist, accounts, staff, costs, limits. Moss nav so it is never mistaken for the app | `ui_kits/admin_web/` |

---

## Content fundamentals

offload's voice is a calm assistant that has already done the work and does not need credit for it. Short sentences, plain words, no exclamation marks.

**Person.** Talk to the user as **you**. offload refers to itself in the third person, and only when it has to explain what it did: "Saved to Lisbon trip", "offload sorted 4 notes". Never "I". Never "we".

**Casing.** Sentence case everywhere, with no exceptions: buttons, titles, section headers, sheet headers, toasts. Nothing in the interface is set in uppercase. The brand name is always lowercase, including at the start of a sentence: "offload keeps it in one place."

**Punctuation.** Never an em dash, anywhere, in any surface: not in UI copy, not in marketing, not in these docs. Use a comma, a colon, or a full stop instead, and a middle dot for metadata. Full stops in body copy and empty states. No full stops on labels, buttons, chips, badges, or row titles. Middle dots separate metadata: `Lisbon trip · from Safari · 2m`. Use en dashes for ranges (14th–17th), curly quotes for captured speech.

**Length.** Buttons: 1–3 words. Row titles: one line, truncated with an ellipsis rather than wrapped. Empty state body: one sentence, two at most. Toasts: five words plus one action.

**What offload says about its own work.** It states the outcome, never the mechanism. "Saved to Lisbon trip", not "Classified using your prior notes". Every automatic action offers exactly one way back: `Undo`. Confidence is never expressed as a percentage; when offload is unsure it asks with a chip or a badge ("needs a date") rather than a dialog.

**Vocabulary.**

| Use | Not |
| --- | --- |
| dump, put down, offload | capture, ingest, log |
| thread / my threads | folder, project, workspace, board, space |
| thing / things | item, entry, record, asset |
| a thread holds things | a project holds items |
| memory / memories | profile, knowledge base, facts |
| learns, learned | works out, worked out, figures out, infers |
| sorted | classified, auto-tagged, processed |
| Undo | Revert, Discard changes |

**Examples, verbatim from the kit.**

- Composer placeholder: `Dump anything`, one of twenty that cycle every ten seconds
- Toast: `Deleted, gone in a moment` · `Undo`
- Thread standing blurb: *"Still four things to book, and the flight is in two weeks."*
- Row and its meta: `Ana needs an answer on the 14th–17th` / `Lisbon trip · asked Tuesday`
- Free time in the agenda: `4:30hrs free`
- Retention note: `offload only keeps conversations from the past 60 days`

**Emoji: one, deliberately.** 👀 marks a message offload has seen but not yet answered, because a glyph reads as chrome there and an emoji reads as a person. Nowhere else: not in UI labels, not in copy, not in thread names. Meaning is carried by Lucide glyphs and by type weight. Unicode characters are used only as punctuation (`·`, `–`, `, `, curly quotes).

---

## Visual foundations

**The premise.** Black on white, one accent, hairlines instead of boxes, and a lot of empty space. The interface should look like it is holding almost nothing, even when it holds thousands of things.

**Colour.** A pure achromatic ramp (`--paper` through `--ink-950`) does virtually all the work: ink for content, `--ink-600` for metadata, `--ink-400` for the third rank, `--border-hairline` for separators and `--border-strong` for anything that outlines a control. On top of that sit exactly two accents, each with one narrow job and nothing else:

- **moss** `--moss-600` #3F6B4F, *offload did this, you didn't.* Inferred memories, the What moved and Always on sections, thread references in a reply, the Done mark, selection highlight.
- **ink blue** `--blue-600` #3355D6, *this needs you.* Something is waiting, unresolved, or about to expire. Chosen as a cool counterweight so it separates from moss by temperature rather than by loudness, and never competes with it for attention.

Use the semantic aliases, not the ramps: `--text-accent` / `--surface-accent-soft` / `--border-accent` for moss, `--text-attention` / `--text-on-attention` / `--surface-attention` / `--surface-attention-soft` / `--border-attention` for blue. Neither accent is ever a page background, neither fills a primary button (that is always ink), and the two never appear on the same row, if something was sorted *and* is waiting, waiting wins. Beyond them, semantics stay muted: amber `--amber-600` for a soft warning, clay `--clay-600` for genuine failure. No gradients as decoration, no colour-coded categories.

**Type.** Two faces, no third.
- **Instrument Sans** (`--font-core`), all UI and display. Semibold for titles, medium for labels and row titles, regular for body. Tracking tightens as size grows (`-0.022em` at 34px).
- **Literata** (`--font-quiet`), confirmed 11 August. offload's own voice, upright: the answer in Ask, empty states, occasional asides. Never a UI label, never more than two sentences. Deliberately not italic, italic is slower to read and gets tiring in a chat.
- **Numerals** use Instrument Sans with `font-variant-numeric: tabular-nums`, set on `body`. Timestamps and counts hold their column without a monospace face. One trap worth knowing: the CSS `font:` shorthand resets `font-variant-numeric`, so any rule that sets `font: var(--text-numeric-role)` (or any other composite role) must restate `font-variant-numeric: tabular-nums` after it, or carry `data-numeric`.

Roles: display 34, title-1 26, title-2 21, title-3 17, body 16, body-sm 14, label 13, caption 12. Title-2 carries section headers. Mobile minimum is 12px; body is 16px. Both faces are served from the Google CDN and confirmed, not placeholders.

**Spacing and layout.** A 2/4/6/8/12/16/20/24/32/40/56/72 scale, it has a 2px and 6px step because 44px tap targets and 30px chips do not sit on a strict 8px grid. Every screen has a 20px gutter (`--gutter-screen`); the top bar is 52px, the bottom nav 64px, list rows 56px (72px with a meta line), and nothing tappable is under 44px. That rule is about the touch target, not the drawn one: `Button` and `IconButton` can paint a 32px control while still accepting a 44px hit, via their `hitArea` prop and a compensating negative margin. Small chrome may look small; it may never be hard to hit. Fixed elements: the AppBar sits at the top, the composer and TabBar at the bottom; content scrolls between them. On wide screens content is capped at `--content-max` 520px rather than stretched.

**Backgrounds.** Flat, never imagery. The page is a warm off-white, `--surface-page` (#FAF9F7 light, #1C1B19 dark), and white is reserved for the planes that sit on it: `--surface-raised`, `--surface-card` and the chrome bars. No photography, no illustration, no pattern, no texture, no full-bleed imagery, no gradient fields. `--surface-sunken` (`--ink-50`) goes a step below the page, behind the phone frame and inside `fill` cards. Imagery in the product is *user content only*, screenshots, photos they dumped in, presented as-is inside a 10px-radius thumbnail with no filter or treatment. There is no brand photography direction because there is no brand photography. Imagery in the product is *user content only*, screenshots, photos they dumped in, presented as-is inside a 10px-radius thumbnail with no filter or treatment. There is no brand photography direction because there is no brand photography.

**Gradients.** One, functional: a `--surface-raised`-to-transparent fade that protects scrolling content under the bars. Bars are opaque `--surface-raised`, the same white as sheets and cards, sitting on the warm `--surface-page`, so every floating plane is one colour. Blur is *only* for chrome that overlaps content, never on cards, never decorative.

**Borders and elevation.** Separate surfaces with a 1px hairline (`--border-hairline` #EAEAEA) first; reach for shadow only when something genuinely floats. Shadows are near-black at very low alpha and always downward: `--shadow-1` for a lifted pill, `--shadow-2` for a floating card, `--shadow-3` for a toast, `--shadow-sheet` (upward, from a bottom sheet). No inner shadows anywhere. List rows draw their separator as an inset shadow so stacked rows never double up.

**Corners.** 6px on the smallest chips and checkboxes, 10px on fields and buttons, 14px on cards, 20/28px on large containers, 24px on sheet tops, and fully round for chips, avatars and the composer. Nothing is a sharp 0px rectangle except full-bleed dividers.

**States.**
- *Hover* (pointer only): ink at 4% (`--state-hover`), or one step darker for filled elements (primary ink → `--ink-800`). Never a colour change, never an underline appearing.
- *Press*: `scale(0.98)` plus ink at 8%. Cards scale to 0.995, barely.
- *Selected*: inverts to ink fill (chips) or `--ink-100` (rows). Never an accent border.
- *Focus*: 2px ink outline offset 2px, or an ink border plus `--shadow-focus` on fields.
- *Disabled*: `--ink-100` surface with `--ink-400` text. No opacity fades. This is the one place `--ink-400` still carries type, and it is the one place contrast rules do not apply.

**Motion.** Short and outward. `--ease-out` `cubic-bezier(.22,.85,.24,1)` for interaction, `--ease-entrance` `cubic-bezier(.16,1,.3,1)` for things arriving. 140ms for hover/press/colour, 200ms for toggles, 280ms for toasts and cards, 340ms for sheets. Things translate 8–14px and settle; **nothing bounces, overshoots, springs or spins** except the 720ms hairline spinner. Sheets rise from the bottom edge; toasts rise 8px and fade. No parallax, no scroll-triggered animation.

**Navigation motion belongs to the platform, not to this system.** Each kit follows its own convention and owns its own numbers: the web kit slides a pane in from the right in 260ms on `--ease-out`; the Android kit uses Material's shared axis X at 300ms on emphasized decelerate `cubic-bezier(.05,.7,.1,1)`, fades through between peers, and slides one navigation indicator in 250ms; the iOS kit pushes the whole screen in 350ms on `cubic-bezier(.32,.72,0,1)` and cuts between tabs, because UIKit does. Inside a screen, the durations above still hold. Each kit's `README.md` lists what it animates.

**Loading.** One spinner, optionally labelled in lowercase ("looking through your stuff"). No skeletons, no progress bars, no shimmer.

---

## Iconography

**Lucide, and only Lucide.** Outline, 2px stroke, 24px grid, no fills, no duotone, no colour. 80 glyphs are vendored in `assets/icons/` as SVG so this system works offline; `Icon` reads from the jsDelivr copy of `lucide-static` by default and accepts `basePath="./assets/icons/"` to use the local set.

Icons are rendered as a **`currentColor` mask**, so a glyph always inherits the colour of the text it sits beside, that is why there is no coloured-icon rule to remember. Sizes: 14 (inside chips), 16 (metadata, small buttons), 18 (list rows, fields), 20 (bars, buttons), 22 (tab bar), 28 (empty states, in `--ink-300`).

Tab glyphs: `sun` / `moon` (Today and Tonight, on real sunset), `lasso` (My threads, a loop drawn round related things), `cloudy` (Memories). Then `sparkles` (anything offload did for you), `map-pin` `link` `image` `mic` `camera` `paperclip` `scan-text` (kinds of dumped thing), `square-check-big` / `check` / `check-check` (tasks and done states), `users` (shared threads and people), `arrow-up` (send), `plus` (new), `ellipsis` (more), `chevron-*` and `maximize-2` (navigation), `bell` `settings` `search` `clock` `calendar` `bookmark` `archive` `trash-2` `pencil` `share-2` `funnel` `lock` `house` `message-circle` `circle` `list`.

All 80 vendored glyphs: `album` `archive` `arrow-up` `bell` `blend` `bookmark` `brain` `calendar` `camera` `check` `check-check` `chevron-down` `chevron-left` `chevron-right` `circle` `circle-dashed` `circle-dot` `clock` `clock-fading` `cloud` `cloud-cog` `cloud-download` `cloud-drizzle` `cloud-lightning` `cloud-moon` `cloud-off` `cloud-rain` `cloud-sun` `cloudy` `coffee` `compass` `ellipsis` `eye` `folder` `funnel` `gallery-vertical-end` `git-branch` `group` `house` `image` `inbox` `lasso` `layers` `library-big` `link` `list` `lock` `map-pin` `maximize-2` `message-circle` `message-circle-more` `mic` `moon` `moon-star` `newspaper` `orbit` `paperclip` `pencil` `plus` `radio` `rewind` `rss` `scan-text` `search` `settings` `share-2` `snowflake` `sparkles` `spline` `square-check-big` `sun` `sunrise` `text-quote` `thermometer-sun` `trash-2` `umbrella` `users` `waypoints` `wind` `x`.

No icon font. No PNG icons. No emoji. No hand-drawn or bespoke SVG illustration, if a screen needs a picture, it uses a real image the user provided, or nothing.

**Substitution flagged:** Lucide is a choice, not an inherited asset. It was picked because its 2px outline set is the closest widely available match to a black-on-white minimal interface. Swap it if a bespoke set exists.

---

## Index

Root manifest:

| File | What it is |
| --- | --- |
| `readme.md` | This guide. |
| `SKILL.md` | Agent Skills front matter so this folder works as a Claude Code skill. |
| `styles.css` | The single entry point consumers link. `@import` lines only. |
| `thumbnail.html` | Homepage tile for this system. |
| `tokens/` | `fonts` · `colors` · `typography` · `spacing` · `radius` · `elevation` · `motion` · `base`. |
| `guidelines/` | 18 specimen cards: colours, type, numerals, spacing, radii, elevation, motion, mark, icon set. |
| `assets/` | `mark.svg`, `mark-inverse.svg`, `app-icon.svg`, and `icons/`, 80 Lucide SVGs. |
| `explorations/` | 43 exploration logs, plus `frames.css`, the shared shell the newer ones link: the mark, the accents, the type, section headers, the calendar, the conversation overlay, dark theme, notifications and the notification templates, settings layouts, swipe-to-delete, the iOS/Android comparison, the web shell, one motion page per platform, and the four that settled the edges: sign in with first run and the landing page, the no-invite screen with the email options and refusals, sharing and invitations, and the day-one empty states. Kept as the record of what was considered and rejected, and of what was picked. |
| `components/` | 21 primitives in six groups (below). |
| `ui_kits/mobile_app/` | Interactive click-through of the iOS app; see its `README.md`. |
| `ui_kits/android_app/` | The same product on Material 3, sharing the iOS kit's data and flows; its `README.md` lists every difference. |
| `ui_kits/web_app/` | The same product on a desktop browser: sidebar, a stack of panes, one composer. Reads the phones' `data.js`; see its `README.md`. |
| `ui_kits/marketing_site/` | The public landing page with the waitlist, and the transactional email shell. Tokens only, no app code; see its `README.md`. |
| `ui_kits/admin_web/` | The staff panel: waitlist, people, staff, costs, limits. Same tokens, moss nav instead of ink; see its `README.md`. |

Components, each with `.jsx`, `.d.ts` props contract, `.prompt.md` usage note, and one `@dsCard` per group:

- **brand/**, `Logo`
- **core/**, `Icon`, `Button`, `IconButton`, `Chip`, `Badge`, `Card`
- **forms/**, `TextField`, `Switch`, `Checkbox`, `SegmentedControl`
- **layout/**, `AppBar`, `TabBar`, `ListRow`, `SwipeRow`, `SectionHeader`, `Sheet`
- **feedback/**, `Toast`, `EmptyState`, `Spinner`
- **notifications/**, `NotificationIOS`, `NotificationAndroid`

That is 21 components across six groups.

Import them from the compiled bundle: `const { Button, ListRow } = window.OffloadDesignSystem_dc4a89`.

**Intentional additions.** No source defined a component inventory, so this is the standard minimal set sized to a capture-and-retrieve mobile app. Two notes: `Icon` exists as a wrapper because every other component takes a glyph slug rather than an element; `SegmentedControl` stands in for tabs, because offload has no top tab bar. There is deliberately **no** Avatar, Tooltip, Accordion, Table, Dropdown or Stepper, nothing in the brief needs them.

## Getting in

Decided August 2026, and built into all three kits behind the `first run` control in each
preview bar.

**Two providers, nothing else.** Continue with Apple and Continue with Google. No email
link, no password, no account type to choose. Order flips by platform: Apple leads on iOS
because the App Store requires it to be at least as prominent as Google's, Google leads on
Android because that account is already on the device, and web shows Apple first with
Google under it. Returning users see the same screen; the provider sheet does the
remembering, so there is no second sign-in design.

**The gate is absolute.** Nobody sees the app before signing in, because offload is invite
only. On the phones the screen is a 92px mark with the wordmark under it in the upper half,
the claim and one line beneath that, and the two buttons pinned to the bottom. On web it is
the same copy in a 440px card.

**Signed in without an invite** gets its own screen rather than a bounce back to the
marketing page. It names the address it checked, joins the waitlist in one tap reusing that
address, and offers "Use a different account" as the quiet secondary. Joining replaces the
buttons with a toast, "Added to the waitlist".

**First run is three screens, once per person.** Dump anything, offload sorts it, it only
interrupts when it matters. Dots and Skip at the top in the same place on all three, one
button at the bottom, and Get started lands on Today with nothing in it. The notification
permission ask fires straight after Get started on mobile, so the third screen is the
reason it appears. Signing in later on another device shows no tutorial: it runs once per
person, not once per device.

**Refusals are one line above the buttons**, never a dialog: "That did not go through.
Nothing was sent, try again." It clears on the next attempt and never replaces the buttons.
Offline disables them and retries by itself. A denied notification permission gets nothing
at all, because the system dialog already carried the decision and Settings explains it. An
expired or used invite link is the one case that earns its own screen, with the sign-in
buttons under the explanation.

## Sharing

Decided August 2026, built in all three kits.

**You can only share with a connection.** Sharing never lets anyone new into offload and
there is no public link, so the share sheet's last row makes a new connection (email or
username, matched against accounts that exist) rather than sending an invitation. Someone
without an account comes through the waitlist like everyone else.

**One affordance per thread**, `share-2` in the thread's bar on the phones and in the pane
head on web, with the faces of whoever is already in beside it. Nothing smaller than a
thread can be shared, which keeps one permission per thread and no per-item exceptions.

**Two ways to send, both shipped.** The sheet is the mechanism: search, your connections,
one permission line. The composer is the shortcut, and more generally the composer is a
tool rather than a chat: any UI task in offload can be said instead of tapped ("share
Lisbon trip with Sam"), answered in offload's voice with an Undo.

**One permission, stated identically everywhere:** they can add to it, and they can never
delete what is yours. No roles, no viewer and editor.

**@ picks a person** in the composer and in every other field: the same connection list,
filtered as you type, three rows at a time. It resolves to the person, not to a string, so
offload can act on it. An unmatched @ stays plain text.

**Receiving follows the setting**, whose default is ask me first: an invitation is a screen
with a two-row preview and Add it to my threads / Not now. Not now is not a decline, it
waits at the top of My threads as one moss strip, and it never becomes an inbox: no badge,
no counter, no second notification, and it expires after 30 days.

## Empty states

**Day one on Today shows what a dump looks like:** one invitation in the serif voice and
three dashed examples that fill the composer rather than submitting. They never return once
something real is in. My threads and Memories stay quiet, one sentence each, no button, with
the mark at 22% as the only ornament allowed.

Never a zero ("Nothing in here yet", not "0 things"). One sentence, two at most. First run
and emptied are different screens: someone who cleared everything gets one line and no
teaching. No illustration, ever. Every empty screen keeps the composer, because on every
one of them the answer is to dump something.

## Accessibility

Decided 25 August 2026, measured rather than assumed. Every pair below was computed against
every surface it can sit on, in both themes.

**Contrast.** `--text-tertiary` was `--ink-400` #9E9E9E, which is 2.55:1 on the page and
2.39:1 on a fill: it carries metadata, counts, timestamps and captions, so it failed on real
copy. It is now its own value, **#6E6E6E light and #959595 dark**, 4.5:1 or better on every
surface including the dark input. `--text-secondary` is unchanged at #5C5C5C (6.4:1), so the
two ranks are closer than they were; separate them with size and weight, not colour alone.
`--border-strong` was #DEDEDE, 1.28:1, and it is the only thing that says a text field, a
checkbox or an outlined button is there. It is now **#8C8C8C light and #777777 dark**, 3:1 on
every surface. Hairlines stay faint on purpose: `--border-hairline` separates rows, it never
identifies a control.

Everything else passes and did not move: moss text 5.6 to 6.1, blue text 5.7 to 6.2, the
solid moss and blue chips 6.1, ink on amber 9.7, clay 5.4, the refusal line 10.5, and the
dark theme's accents 6.6 to 10.3.

**Colour is never the only signal.** Moss and blue carry meaning ("offload did this" and
"this needs you"), so anywhere an accent is the whole message it takes a word or a glyph
with it. A moss dot alone is not a state.

**Reduced motion is a cut.** `prefers-reduced-motion: reduce` removes movement entirely,
not shortens it: no pane slide, no iOS push, no shared axis, no drawn tick, no toast rise,
no hover transition. The new state is simply there. The rule lives in `tokens/motion.css`,
so every kit and every card inherits it.

**Text scaling to 200%.** Body, body-sm, label and caption scale all the way with the OS
setting (Dynamic Type, Android font scale, browser zoom). Display, title-1 and title-2 cap
at about 1.35x, because a 34px display at 200% is a headline nobody can read on a phone.
Consequences for the build: rows and bars take `min-height`, never `height`; nothing that
holds text has a fixed height; titles truncate to one line and metadata wraps; the tab bar
drops to glyphs without labels past 130%. The kits are drawn at 100%, so this is a rule for
the build, not something the mockups demonstrate.

**Targets, focus and labels.** 44px minimum hit area, which may be larger than the drawn
control (`hitArea` on `Button` and `IconButton`). Focus is a 2px ink outline offset 2px, or
an ink border plus `--shadow-focus` on fields, and it is never removed. Every icon-only
control carries a label. The 👀 marker needs a text alternative wherever it appears: "seen,
not answered yet".

**Undo lasts eight seconds**, up from four, because four is not enough time to read a toast,
reach for a pointer or hear a screen reader announce it. Nothing is destroyed while the
toast is up.

## The admin panel

Staff-only, so it optimises for reading columns rather than for calm. Same tokens, same
type, same hairlines, three rules of its own:

**The nav is moss, not ink** (`--moss-700`, paper text, an `admin` tag by the wordmark),
because support keeps both windows open and the two must never be confused. Nothing else
changes colour.

**Sidebar plus one pane, no pane stack.** One table at a time. Tables carry hairlines only,
no zebra, numbers right-aligned and tabular.

**Irreversible things ask, and say what goes with them.** Disable is reversible and says so.
Delete lists what it removes and needs the account's email typed back. Neither emails the
person: if they should hear about it, support writes to them.

**Two roles, and the difference is money.** Support gets the waitlist and people; an owner
also gets costs, limits and who else is staff. Support does not see those pages at all
rather than seeing them refused. There is always one owner, and nobody can edit themselves
out of the panel.

Costs are grouped by the job being paid for, not by model, and the caps live in one place
with a single decision about what happens when one is reached: slow down, drop to the
cheaper model, or stop and tell the person offload is resting. Dumps are always still saved.

## Behaviour notes for the build

- **The first tab is time-aware.** Two states, not four: "Today" with `sun` before sunset, "Tonight" with `moon` after it. The boundary is real sunset for the device's date and latitude, computed in `ui_kits/mobile_app/sun.js` (NOAA solar position, no network), not a fixed hour. Both kits load that one file, and both index pages carry a preview clock so either state can be seen without changing the device time.
- **Insets are owned by components, not screens.** A row spans the full width and pays the gutter back inside, so its fill and hairline reach the frame edge while its text sits on the gutter. A screen that adds its own horizontal gutter around rows double-insets them; this drifted three times before being fixed at the component.
- **Swipe to delete** is horizontal-only: pointer capture is taken only once a drag passes 6px, otherwise a tap never reaches the row underneath.

## Brand decisions, closed 25 August 2026

Answered by the brand owner. Nothing here is open.

1. **The name is `offload`**, no colon, always lowercase, including at the start of a
   sentence. The colon from the brief is dropped for good.
2. **The typefaces stay as they are.** Instrument Sans and Literata from the Google CDN are
   the real faces of this system, not placeholders. `tokens/fonts.css` can become
   self-hosted `@font-face` rules whenever hosting matters, but no licence chase is
   pending and no substitution warning needs repeating in new work.
3. **Ink blue stays** as the second accent, #3355D6, carrying "this needs you" opposite
   moss. Two accents, no third.
4. **The 👀 marker stays**, the one emoji in the product, on a message offload has seen but
   not answered. Nowhere else.
5. **A new account opens in light.** Light is the default theme, not the device setting;
   dark is a choice in Settings. The three kits already default to Light and their preview
   bars switch for review.
6. **A collection is a `thread`.** Chosen 25 August over loop, stack, bundle, pile and case,
   and already the word the kits use in code and data. The second tab is **My threads**, its
   glyph stays `lasso`, and the two levels read cleanly together: a thread holds things.
   `thing` keeps its second, smaller job as the word for one item inside a thread, and the
   old "space" vocabulary is gone from the components' notes and cards as well.


The semantic colours are theme independent: moss, blue, amber and clay hold the same
values in dark as in light, so a filled chip or a danger row is the same colour at any
hour. Only their tints (the 50 and 100 steps) darken, because a tint is a surface and a
surface belongs to its page, and the accent TEXT roles lift, because deep moss on a dark
page is unreadable.

Toned chips fill at full strength (moss-600, blue-600, amber-600, clay-600) with paper
text, and deepen a step on hover or when selected. The earlier soft tints sat too close to
paper to read as colour at chip size. Badges keep both variants: soft for a quiet count
inside a row, solid where the badge is the only signal.

## Dark theme

One dark scope, charcoal with lifted surfaces. The page sits off black at #1C1B19, cards
and bars lift to #212121, the sunken step drops to #101010 and an input is #2E2E2E, so the
separation white paper gets from shadow comes from value instead. Text stops at #EDEDED
rather than pure white, and secondary and tertiary are #B3B3B3 and #959595. Both accents
lighten (moss #82BC97, blue #95A9F7) because the daylight values go muddy on dark.

Apply it by putting `data-theme="dark"` on any ancestor. There is a matching
`[data-theme="light"]` scope, so a document can pin itself to light rather than inherit
whatever a host has set; every specimen card in this system does exactly that. Every semantic alias is restated inside the scope: a custom property's var()
substitution resolves where the property is declared, so overriding only the base scale on
a descendant would never reach `--text-primary` and friends. For the same reason, any
element that opens a themed region should set `color: var(--text-primary)` on itself, since
inherited colour was already resolved further up.

Chrome is tokenised rather than literal white: `--surface-chrome`, `--surface-chrome-strong`
(both resolve to `--surface-raised`, opaque, in every scope), `--surface-scrim-soft`. Shadows are neutralised on dark, since a shadow
on a dark surface reads as nothing.
