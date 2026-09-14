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

**Person.** Talk to the user as **you**. Amended 14 September 2026, because the old rule said third person and never "I", and three shipped lines said "I" anyway.

**In what offload says, the sentence starts with the verb and names no subject**: "Filed both", "Couldn't find that", "Can't search that", "Didn't finish that one", "Stopped". Neither "I" nor "offload". This covers replies, progress lines, empty states, notification copy and onboarding, and it is shorter than either version it replaces, which is most of the argument for it.

**Where the interface describes offload rather than speaking as it, the name is used**: a settings row has to say what it governs, so "Let offload notice patterns" and "offload keeps conversations for 60 days" stay as they are. Never "I". Never "we".

**Contractions are in**, as of the same pass: "can't", "couldn't", "didn't", "won't", "isn't". Every line before it wrote the full form, so this moves copy on every surface.

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
| note / notes | memory, profile, knowledge base, facts |
| learns, learned | works out, worked out, figures out, infers |
| sorted | classified, auto-tagged, processed |
| Undo | Revert, Discard changes |
| Leave (a thread other people are in) | Delete, Remove, Exit |
| Delete (a thread only you are in) | Leave |
| filing (while offload works out where something goes) | Sorting, Processing, Unsorted, Pending |

**Examples, verbatim from the kit.**

- Composer placeholder: `Dump anything`, one of twenty that cycle every ten seconds
- Toast: `Deleted, gone in a moment` · `Undo`
- Thread standing blurb: *"Still four things to book, and the flight is in two weeks."*
- Row and its meta: `Ana needs an answer on the 14th–17th` / `Lisbon trip · asked Tuesday`
- Free time in the agenda: `4:30hrs free`

**Emoji: one, deliberately.** 👀 marks a message offload has seen but not yet answered, because a glyph reads as chrome there and an emoji reads as a person. Nowhere else: not in UI labels, not in copy, not in thread names. Meaning is carried by Lucide glyphs and by type weight. Unicode characters are used only as punctuation (`·`, `–`, `, `, curly quotes).

---

## Visual foundations

**The premise.** Black on white, one accent, hairlines instead of boxes, and a lot of empty space. The interface should look like it is holding almost nothing, even when it holds thousands of things.

**Colour.** A pure achromatic ramp (`--paper` through `--ink-950`) does virtually all the work: ink for content, `--ink-600` for metadata, `--ink-400` for the third rank, `--border-hairline` for separators and `--border-strong` for anything that outlines a control. On top of that sit exactly two accents, each with one narrow job and nothing else:

- **moss** `--moss-600` #3F6B4F, *offload did this, you didn't.* Inferred notes, the What moved and Always on sections, thread references in a reply, the Done mark, selection highlight.
- **ink blue** `--blue-600` #3355D6, *this needs you.* Something is waiting, unresolved, or about to expire. Chosen as a cool counterweight so it separates from moss by temperature rather than by loudness, and never competes with it for attention.

Use the semantic aliases, not the ramps: `--text-accent` / `--surface-accent-soft` / `--border-accent` for moss, `--text-attention` / `--text-on-attention` / `--surface-attention` / `--surface-attention-soft` / `--border-attention` for blue. Neither accent is ever a page background, neither fills a primary button (that is always ink), and the two never appear on the same row, if something was sorted *and* is waiting, waiting wins. Beyond them, semantics stay muted: amber `--amber-600` for a soft warning, clay `--clay-600` for genuine failure. No gradients as decoration, no colour-coded categories.

**The change mark, the one pattern that is a moment rather than a state.** offload can file into the thread you are looking at, so a screen has to be able to say what just arrived without a badge that then has to be cleared. Anything that appeared while somebody was watching takes a `--surface-accent-soft` background settling to transparent over `--duration-mark`, 1400ms, and nothing else: no border, no icon, no count. It is moss because moss means *offload did this, you didn't*, and a row offload filed correctly needs nothing from anybody. It is deliberately not blue, which was asked for and declined: blue means *this needs you*, and on a flashed row that is also a task waiting on you it would put both accents on one row, which the rule above forbids. Reduced motion drops it to nothing rather than shortening it, so the row is simply there. Needed on every surface offload can write to while it is open: the thread page, Today, and both phones.

**Type.** Two faces, no third.
- **Instrument Sans** (`--font-core`), all UI and display. Semibold for titles, medium for labels and row titles, regular for body. Tracking tightens as size grows (`-0.022em` at 34px).
- **Literata** (`--font-quiet`), confirmed 11 August. offload's own voice, upright: the answer in Ask, empty states, occasional asides. Never a UI label, never more than two sentences. Deliberately not italic, italic is slower to read and gets tiring in a chat.
- **Numerals** use Instrument Sans with `font-variant-numeric: tabular-nums`, set on `body`. Timestamps and counts hold their column without a monospace face. One trap worth knowing: the CSS `font:` shorthand resets `font-variant-numeric`, so any rule that sets `font: var(--text-numeric-role)` (or any other composite role) must restate `font-variant-numeric: tabular-nums` after it, or carry `data-numeric`.

Roles: display 34, title-1 26, title-2 21, title-3 17, body 16, body-sm 14, label 13, caption 12. Title-2 carries section headers. Mobile minimum is 12px; body is 16px. Both faces are served from the Google CDN and confirmed, not placeholders.

**Spacing and layout.** A 2/4/6/8/12/16/20/24/32/40/56/72 scale, it has a 2px and 6px step because 44px tap targets and 30px chips do not sit on a strict 8px grid. Every screen has a 20px gutter (`--gutter-screen`); the top bar is 52px, the bottom nav 64px, list rows 56px (72px with a meta line), and nothing tappable is under 44px. That rule is about the touch target, not the drawn one: `Button` and `IconButton` can paint a 32px control while still accepting a 44px hit, via their `hitArea` prop and a compensating negative margin. Small chrome may look small; it may never be hard to hit. Fixed elements: the AppBar sits at the top, the composer and TabBar at the bottom; content scrolls between them. On wide screens content is capped at `--content-max` 520px rather than stretched. Breakpoints are tokens: `--breakpoint-sm` 600, `--breakpoint-md` 900, `--breakpoint-lg` 1180, `--breakpoint-xl` 1440. 1180 is the one that matters, it is where the web shell's second pane becomes possible.

**Larger text scales type and nothing else.** The Settings choice sets `data-type="large"`, which overrides the eight size tokens with whole-pixel values at 1.15 and leaves every width, gutter, radius and icon at its literal pixel. `--type-scale` is there for the rare one-off literal that has to move with the type. What it must never be is a zoom: scaling the layout with the text turns a 520px pane into 598px and pushes it off a laptop screen, which is the opposite of what somebody asking for bigger text wants.

**Backgrounds.** Flat, never imagery. The page is a warm off-white, `--surface-page` (#FAF9F7 light, #1C1B19 dark), and white is reserved for the planes that sit on it: `--surface-raised`, `--surface-card` and the chrome bars. No photography, no illustration, no pattern, no texture, no full-bleed imagery, no gradient fields. `--surface-sunken` (`--ink-50`) goes a step below the page, behind the phone frame and inside `fill` cards. Imagery in the product is *user content only*, screenshots, photos they dumped in, presented as-is inside a 10px-radius thumbnail with no filter or treatment. There is no brand photography direction because there is no brand photography. Imagery in the product is *user content only*, screenshots, photos they dumped in, presented as-is inside a 10px-radius thumbnail with no filter or treatment. There is no brand photography direction because there is no brand photography.

**Gradients.** One, functional: a `--surface-raised`-to-transparent fade that protects scrolling content under the bars. Bars are opaque `--surface-raised`, the same white as sheets and cards, sitting on the warm `--surface-page`, so every floating plane is one colour. Blur is *only* for chrome that overlaps content, never on cards, never decorative.

**Borders and elevation.** Separate surfaces with a 1px hairline (`--border-hairline` #EAEAEA) first; reach for shadow only when something genuinely floats. Shadows are near-black at very low alpha and always downward: `--shadow-1` for a lifted pill, `--shadow-2` for a floating card, `--shadow-3` for a toast, `--shadow-sheet` (upward, from a bottom sheet). No inner shadows anywhere. List rows draw their separator as an inset shadow so stacked rows never double up.

**Corners.** 6px on the smallest chips and checkboxes, 10px on fields and buttons, 14px on cards, 20/28px on large containers, 24px on sheet tops, and fully round for chips, avatars and the composer. Nothing is a sharp 0px rectangle except full-bleed dividers.

**States.**
- *Hover* (pointer only): ink at 4% (`--state-hover`), or one step darker for filled elements (primary ink → `--ink-800`). Never a colour change, never an underline appearing.
- *Press*: `scale(0.98)` plus ink at 8%. Cards scale to 0.995, barely.
- *Selected*: inverts to ink fill (chips) or `--ink-100` (rows). Never an accent border.
- *Focus*: 2px ink outline offset 2px, or an ink border plus `--shadow-focus` on fields.
- *Finished*: a ticked task stays in its list, sinks below everything outstanding, and takes tertiary ink with a 1px strike. **No opacity.** Past five finished, a list shows the five most recent and a quiet "Show all" beneath them.
- *Archived*: secondary ink, a hollow tile with a dashed border, and the date relabelled to say what happened to it, "archived 14 Aug". The only action on an archived thing is putting it back. **No opacity here either**: dimming a row on a warm page reads as a rendering fault and takes the label under the contrast floor.
- *Filing*: while offload is working out where something goes, the row's thread slot holds the word **filing** in moss, replaced by the thread's name when it lands. Nothing else marks it and nothing reflows: the slot is the same height either way. This is the only per-row progress word in the system; everything else that waits uses the one spinner.
- *Disabled*: `--state-disabled-surface` with `--state-disabled-text`, the aliases for `--ink-100` and `--ink-400`. Use the aliases; components do. No opacity fades. This is the one place `--ink-400` still carries type, and it is the one place contrast rules do not apply.

**Motion.** Short and outward. `--ease-out` `cubic-bezier(.22,.85,.24,1)` for interaction, `--ease-entrance` `cubic-bezier(.16,1,.3,1)` for things arriving. 140ms for hover/press/colour, 200ms for toggles, 280ms for toasts and cards, 340ms for sheets. Things translate 8–14px and settle; **nothing bounces, overshoots, springs or spins** except the 720ms hairline spinner. Sheets rise from the bottom edge; toasts rise 8px and fade. No parallax, no scroll-triggered animation.

**Navigation motion belongs to the platform, not to this system.** Each kit follows its own convention and owns its own numbers: the web kit slides a pane in from the right in 260ms on `--ease-out`; the Android kit uses Material's shared axis X at 300ms on emphasized decelerate `cubic-bezier(.05,.7,.1,1)`, fades through between peers, and slides one navigation indicator in 250ms; the iOS kit pushes the whole screen in 350ms on `cubic-bezier(.32,.72,0,1)` and cuts between tabs, because UIKit does. Inside a screen, the durations above still hold. Each kit's `README.md` lists what it animates.

**Loading.** One spinner, optionally labelled in lowercase ("looking through your stuff"). No skeletons, no progress bars, no shimmer.

---

## Iconography

**Lucide, and only Lucide.** Outline, 2px stroke, 24px grid, no fills, no duotone, no colour. 80 glyphs are vendored in `assets/icons/` as SVG so this system works offline; `Icon` reads from the jsDelivr copy of `lucide-static` by default and accepts `basePath="./assets/icons/"` to use the local set.

Icons are rendered as a **`currentColor` mask**, so a glyph always inherits the colour of the text it sits beside, that is why there is no coloured-icon rule to remember. Sizes: 14 (inside chips), 16 (metadata, small buttons), 18 (list rows, fields), 20 (bars, buttons), 22 (tab bar), 28 (empty states, in `--ink-300`).

Tab glyphs: `sun` / `moon` (Today and Tonight, on real sunset), `lasso` (My threads, a loop drawn round related things), `cloudy` (Notes). Then `sparkles` (anything offload did for you), `map-pin` `link` `image` `mic` `camera` `paperclip` `scan-text` (kinds of dumped thing), `square-check-big` / `check` / `check-check` (tasks and done states), `users` (shared threads and people), `arrow-up` (send), `plus` (new), `ellipsis` (more), `chevron-*` and `maximize-2` (navigation), `bell` `settings` `search` `clock` `calendar` `bookmark` `archive` `trash-2` `pencil` `share-2` `funnel` `lock` `house` `message-circle` `circle` `list`.

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
| `components/` | 28 primitives in eight groups (below). |
| `ui_kits/mobile_app/` | Interactive click-through of the iOS app; see its `README.md`. |
| `ui_kits/android_app/` | The same product on Material 3, sharing the iOS kit's data and flows; its `README.md` lists every difference. |
| `ui_kits/web_app/` | The same product on a desktop browser: sidebar, a stack of panes, one composer. Reads the phones' `data.js`; see its `README.md`. |
| `ui_kits/marketing_site/` | The public landing page with the waitlist, and the transactional email shell. Tokens only, no app code; see its `README.md`. |
| `ui_kits/admin_web/` | The staff panel: waitlist, people, staff, costs, limits. Same tokens, moss nav instead of ink; see its `README.md`. |

Components, each with `.jsx`, `.d.ts` props contract, `.prompt.md` usage note, and one `@dsCard` per group:

- **brand/**, `Logo`
- **core/**, `Icon`, `Button`, `IconButton`, `Chip`, `Badge`, `Card`
- **forms/**, `TextField`, `Switch`, `Checkbox`, `SegmentedControl`
- **layout/**, `AppBar`, `TabBar`, `ListRow`, `SwipeRow`, `RowActionSheet`, `MemoryRow`, `SectionHeader`, `Sheet`, `PrismField`
- **feedback/**, `Toast`, `EmptyState`, `Spinner`
- **notifications/**, `NotificationIOS`, `NotificationAndroid`
- **answering/**, `AnswerResult`, `QuickReplies`
- **conversation/**, `TurnFooter`

**`Icon` is a DOM contract, and React Native needs its own.** It masks an SVG with `currentColor` and takes a `basePath`, which is a URL, and React Native has neither. A component named `Icon` there would be claiming a contract it cannot implement, so the name on that platform is **`Glyph`**, taking the same 80 slugs and the same sizes and resolving them from generated paths rather than from files. The contract itself is not written yet: it is owed by this system, not by a client, and until it exists a phone client should keep `Glyph` narrow and not widen the difference.

That is 28 components across eight groups.

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
one line on how a shared thread works. The composer is the shortcut, and more generally the composer is a
tool rather than a chat: any UI task in offload can be said instead of tapped ("share
Lisbon trip with Sam"), answered in offload's voice with an Undo.

**One permission, and no roles.** They can add to it, and they can never delete what is yours.
No viewer and editor. It is still the only permission there is, and it is enforced everywhere,
but **the share sheet no longer states it.** From 5 September 2026 the line a person reads
before sharing is what a shared thread is over time: *"A shared thread belongs to everyone in
it. If somebody leaves offload, the thread and everything they added stay with the rest of
you."* That is the consequence somebody should agree to in advance rather than discover
afterwards, and it is the thing no screen said. The permission is a fact about what a member
can do, which the product enforces and which the Ending things settings page spells out;
co-ownership is a fact about what happens after they go, which nothing enforced and nothing
explained. *Recorded as a reversal, not a tidy-up: the 25 August decision said this sentence
appears identically everywhere, and it now appears nowhere in the sharing flow.*

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

The toast covers two cases and they are not worded the same. A person deleting something reads
what they did, "Deleted, gone in a moment". An action offload took on its own, which is by far the
commoner one, reads as the outcome and names the destination: "Sorted into Lisbon trip". Same bar,
same eight seconds, same single action. A turn that answered without doing anything gets no toast
and no Done mark, because there is nothing to undo or to check.

**A turn that failed, and a turn that half worked.** Both are inline and persistent rather than toasts, because a toast clears itself after eight seconds and would take the only way forward with it. **The failure is carried by the turn itself:** the message you wrote takes a clay border, with one line beneath it in clay. A failed turn says "offload could not answer that one. Your dump is saved." with **Try again**, which puts the text back in the composer. A partial one says "offload did not finish that one." with **Finish it**, which asks offload to do the rest rather than re-sending anything already filed. Never both on screen: a finished turn offers Undo, a partial one offers Finish it. The failure carries `role="alert"`; the Undo toast carries `role="status"`.

**offload's reply links to the threads it wrote to.** Moss pills under the turn, from the content rows the turn produced rather than from the words in the sentence, because offload naming a thread it did not write to is the failure this exists to prevent. When a turn touched exactly one thread the pill is the only mention and the sentence drops the name, so nothing is said twice.

## Answering a question

Decided 9 September 2026 off `explorations/answering-options.html`, against a server that was
already built. You type a question into the same composer you dump into. Nothing about the
interface changes and nothing asks you to declare which you meant.

**A result is a card, and the thread is its header.** One read is one result, so a question
naming two subjects comes back as two cards rather than one blended list. The header carries the
thread's name in its own moss, is the one link out of the result, and holds the count. Do not
draw a `Chip` for the same thread beside it: an answering turn files nothing, so it has no filed
chips at all.

**Results sit below the reply bubble, never inside it.** A row's hover and press fill bleeds to
its pane's padded edge by design, and a turn's own padding is the same step, so inside a bubble
the two cancel and the fill runs out square under a rounded corner. 012's calendar control stays
inside the bubble, because it acts on the sentence above it and is one fixed control. **Inside is
for a control, below is for a result.**

**Five rows on the phones, eight on web.** The phone's log is about 446pt on a 844pt screen, and
eight rows with the header and the control overrun it, so somebody lands on rows with the sentence
that answers them already off the top. The Show more count is the honest remainder of what
arrived, and a read that was cut short gets the thread as its tail rather than a Show more,
because what was not read was not sent.

**A finished row is never dimmed.** Tertiary ink, a 1px strike and the moss tick. Dimming a row on
a warm page reads as a rendering fault and takes the label under the contrast floor with it. This
is the rule everywhere a done row is drawn, not only in an answer.

**An answer destroys nothing.** Ticking is the only write a result row offers: no delete, no
archive, no rename, and on the phones the row's own pan and long press both come off, because the
conversation is itself a drag-driven sheet. The tick is 21px drawn inside a 44px target and its
name carries the thread, "Book the airport transfer, Lisbon trip".

**A refusal is a sentence, not an error state.** No warning colour and no suggestion to try other
words. "I could not find that" describes offload; "No, butter is not on the list" describes the
list; a truncated read says what it saw and claims nothing about the rest. A device preference is
not answerable and offload says so plainly, because theme and text size live on the device.

**Dark needs one thing, and it is not the card.** The plate is #0F0F11 and `--surface-raised` is
#212121, so in dark the card is the lighter object and the plate between the bubble and the card is
what keeps two same-value surfaces legible as two. Moss holds its value in both themes, so the tick,
the header and the tail have no dark variant. The one real defect was a primary drawn as
`--ink-950` with `--text-on-solid`: the ink ramp flips, so that is white on #EDEDED. **A filled
primary takes `--surface-inverse` with `--text-inverse`**, never a ramp value with white on it.

**Follow-ups are 012's control generalised.** Three options at most, all of them typeable, and the
labels are words somebody would say. A proposal has one primary and one plain way out; a choice
among equals has no primary, because dark ink means offload is recommending. Nothing that deletes,
archives or empties gets a chip. Picking writes your turn into the log exactly as typing would,
and the turn it creates is the one that carries the write: the turn that asked carries no write
tools, which is what stops a sentence in a shared thread talking offload into one. One open
question at a time, closed by the next turn whatever it says. **And ask only what Undo cannot
cover:** a reversible write already sits behind eight seconds, so do it and report it instead.

## Reaching the web

Decided 14 September 2026 off `explorations/reaching-the-web-options.html`, for 016. offload can
now answer from a public fact or from a link somebody dumped, and the two things that shows on
screen are a row under the turn and a chip in it.

**The turn footer belongs to the turn, not to either bubble.** One row on offload's side, left
aligned at the log's own gutter, holding the state mark, the thread pills and the source chips, in
that order: what happened, where it landed, where it came from. It is drawn whether or not offload
wrote a sentence, which is the whole reason it exists: **an ordinary filing turn says nothing**, and
that turn may now have read something it has to be able to report.

**So the Done mark moves.** It used to hang off the sent bubble's bottom left corner, 10px up and
6px into it, which is exactly why it could never grow a chip: a row that starts there runs back
under the bubble it is tucked inside. 👀 moves with it, into the same slot.

**Never a surface.** No fill, no hairline, no card: the chips are the only painted things in the
row, which is what keeps a turn that did three things from looking like a panel. It wraps rather
than scrolls, uses **min-height and never height**, and an empty footer is no footer rather than a
26px gap.

**The source chip is `tone="outline"`**, a new `source` kind in the reference maps with the
`link` glyph. Moss means "offload did this, you didn't" everywhere in this system and a citation is
the opposite claim, so it takes the outline the system already reserves for the external and
non-inferred. **The label is the registrable domain and nothing else:** no path, no title, no
scheme, no `www.`, at a 22ch max-width so only a genuinely long host truncates. Three chips, then
a count in tertiary text rather than a fourth chip, because there is no screen listing what a turn
read and a chip would promise one.

**It is the one external link in the conversation, and the reason is the source of the string.** A
reply may not carry an external link, because the words in it are page-authored and a link wearing
offload's voice is a phishing surface. A source chip's label comes from the record of what was read
and its target is the URL that was read, so it is a fact about where a request went. Written this
way rather than as an exception.

**A read that failed leaves no chip and no mention.** A link that could not be read files the row
exactly as it would have before the feature existed, and offload says nothing about it: the honest
answer to the failure of the thing the feature fixes is the old behaviour rather than an apology.

**Both web switches default on**, in the Privacy group beside "Let offload notice patterns", and
that inverts the rule the group used to teach, where anything leaving offload defaulted off. The
note carries the weight instead: **first clause is what leaves, second is the bound.** "Sends the
words you dumped to a search company when offload can't answer from your threads. Your threads and
notes are never sent." No "On by default" label, because that label's job is explaining why
something is off.

## The timeline rail

Decided 14 September 2026 off `explorations/rail-blue.html`, against 015's shipped rail on all three
surfaces. The rail was drawing a day with something on it in blue, which left blue meaning five
things at once: waiting on you, something on this day, today, the day you are reading, and a task
dot. **Blue keeps the two that are about time.** Today is its ring and the day being read is its
fill; everything about content moved off the hue.

**A day with something on it is a lift, not a tint.** `--surface-raised` with a hairline and
`--shadow-1` in light, so the cell is a small card sitting on the page. A tint darkens the ground
under the number, which is why the grey version of this read as less prominent than an empty day:
**a wash dulls, an edge and a lift advance.**

**The edge is `--border-lift`, and it resolves to a different step per theme.** `--shadow-1` is the
keyword `none` in the dark scope, so there the edge is the whole of the lift: the alias takes the
hairline in light, where a blurred `0 1px 2px` drop shadow reads as depth, and `--ink-300` in dark,
1.94:1 against the page where the hairline measures 1.23:1. The light ratios are lower still, a
1.05:1 fill and a 1.14:1 hairline, and they are fine, because **a contrast ratio is the wrong
instrument for a shadow**: light has depth and dark has a 1px highlight. One alias so the two themes
cannot drift apart by hand.

**An empty day steps back, and today never does.** An empty cell's number goes `--text-tertiary` at
regular weight so the lift reads as forward rather than as different. Today is exempt: a day with
nothing on it is still today. Only past and outside days were demoted before this.

**A dot on a lift takes the text alias of its kind**, `--text-attention` for a task and
`--text-noticed` for a note, rather than the fill aliases `--surface-attention` and
`--surface-noticed`. `--text-noticed` is the ink-weight counterpart to `--surface-noticed`, minted
alongside it rather than borrowed from `--border-decision`, which means something else. A fill alias is deliberately fixed across themes, which is right for a chip and
wrong for a 5px mark whose backdrop moves: on the lift the task dot measured 2.62:1 in dark and the
note dot 2.03:1 in light. Event and other already used text aliases and already passed. **Every dot
still goes `--text-on-solid` on the day being read.**

**A day carrying a decision takes `--border-decision`**, a 1px inset inside the lift: a due date, a
proposal waiting, a question nobody answered. It is the ink amber in each scope, #7A4E02 on white and
#F6C86A on #212121, measuring 7.2:1 and 10.27:1 on the lift. **Never `--surface-noticed`**, which is
a fill and measures 2.03:1 as a 1px ring on white.

**Both marks are aliases rather than ramp steps**, for the reason `--surface-noticed` was minted:
an un-aliased colour gets reached for from the ramp and the lint file has nothing to point at.

**The two tiers layer, they do not compete**, and they layer the way the rail already did: **the
border says things about the date, the inset says things about the content.** So today is a blue
border with an amber ring inside it when today has a decision on it, and the day being read is the
solid fill with both suppressed, because its contents are listed directly underneath.

**One ordering trap, found by measuring.** The lift also sets a border colour, so a rule for today
declared before it loses at equal specificity and today comes out wearing the hairline. Today's
border is declared last.

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
- **A row's actions are drawn as conditional, never as refused.** Edit and archive sit on the row for any member; delete sits there for the author alone and is simply absent otherwise. Two rows side by side showing a different number of controls is the honest reading of one permission rule. Anything beyond those three goes behind a `RowActionSheet` on a phone, or the row's own `ellipsis` on web.
- **The way to the archived pile is a row at the foot of the list**, not a tool on the pane: "3 archived" with a chevron, below everything live. The archive is a place you go rather than a mode you toggle into, and the count is readable without hunting for a highlighted icon.
- **A pane head carries two tools and a More menu.** Open full, then `ellipsis`, which holds rename, add note, Leave, and anything a thread gains later. The head stops growing every time the thread gains a capability.
- **Theme and text size are named rows at the foot of the nav, and a Settings page as well.** Both read the same stored value. An accessibility control behind an unlabelled glyph is not a control anybody can find.
- **Notes are rows, not chips.** A note is a sentence up to 200 characters, so `MemoryRow` sets it as one and the row grows to hold its own editor. A section holding none draws nothing at all, which means the first note on a thread comes from dumping something. **The row carries more since 014**: a date when the note has one, a mark that it has a longer body behind it, and a tertiary treatment for a note past the prompt budget, which is on the thread and not reaching offload.
- **Hiding by stacking order is not hiding.** Anything concealed only by an opaque sibling in front of it becomes visible during any group fade: a screen transition, a modal, a list animating in. Anything that must not appear carries its own opacity or is not mounted. `SwipeRow`'s reveal is the worked example, its opacity driven from the same value as its offset.
- **The bottom plate is not a fixed shape.** It rounds its top only while nothing is stacked on it, and drops the corners the moment a raised conversation sits on it, because both carry the same fill and the radius otherwise cuts a notch out of the join. Folded, the plate is the top again and rounds again. When the keyboard is up it clears to the composer alone: no tabs, no safe-area inset, since three places to go are no use to somebody mid-sentence.
- **A raised conversation leaves the way it arrived.** It rolls down by its own measured height over 280ms on the same curve both ways, while the scrim fades under it, and it goes *behind* the bottom bar rather than fading: a slide and a dissolve at once looks like the sheet coming apart. A drag past the fold threshold hands straight to the exit from wherever the finger let go.
- **`SwipeRow` is delete-only**, despite the generic name. The trash glyph and the clay ground are inside the component and only the label is exposed, so a swipe labelled Archive would show a trash can. Anything other than deleting belongs in a long-press action sheet, which is also the answer where the available actions depend on who authored the row: on web, edit and archive for any member, delete and move for the author alone. A fixed gesture map cannot express that.

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
