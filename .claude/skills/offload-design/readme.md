# offload, design system

**offload** is an AI assistant mobile app for organising thoughts and information day to day, alone or with other people. You collect products for a new bookshelf, note three unrelated things at once, plan a trip with friends. Today that lives across a calendar, a WhatsApp thread you send to yourself, screenshots, and a notes app, so details get lost and nothing is findable later. offload is the one place you dump it all, and it does the filing.

The product philosophy drives the design language: **you dump things in, offload hides the complexity.** The interface never asks you to choose a folder, a type, or a format before you can put something down. Structure appears afterwards, and it can always be corrected.

## Sources

No design sources were provided for this system. There was **no codebase, no Figma file, no deck, and no existing screenshot**, only the written brand brief (offload's positioning, plus the note that the app is simple, minimal, and black on white). Everything here is authored from first principles against that brief.

That has three consequences worth knowing before you trust this system:

1. **The mark was designed here, with the brand owner, in August 2026.** It is a dot above an open vessel, a thought let go of downwards, into something that catches it. The vessel never gains a lid, the dot never touches it, and the whole thing is one colour: ink on light, paper on ink, no greys and no accent, **except the app icon, which is ink on white**: a white tile, `#FFFFFF` rather than paper's `#FAF9F7`, since a home screen is not a page, with the mark in ink, and the ink mark alone over white as Android's adaptive foreground. Rendered at 1024 from the SVG with `sharp`, never hand drawn. **The web favicon keeps the ink tile**, being the one version that reads on both a light and a dark browser chrome. Clear space equals the dot's diameter; 16px is the floor. Ships as `assets/mark.svg`, `assets/mark-inverse.svg`, `assets/app-icon.svg` and the `Logo` component. The wordmark beside it is live text (Instrument Sans 600, `-0.03em`, always lowercase), not an outlined file, so it depends on the substituted typeface below. `explorations/logo-exploration.html` is the full record of how it was chosen.
2. **The typefaces were chosen here and confirmed.** No licensed binaries were supplied, so Instrument Sans and Literata were first served from the Google CDN and are now self-hosted from `assets/fonts/`, and on 25 August the brand owner confirmed they are the real faces of this system rather than placeholders. `tokens/fonts.css` becomes self-hosted `@font-face` rules whenever hosting matters.
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

**Punctuation.** Never an em dash, anywhere, in any surface: not in UI copy, not in marketing, not in these docs. Use a comma, a colon, or a full stop instead, and a middle dot for metadata. Full stops in body copy and empty states. No full stops on labels, buttons, chips, badges, or row titles. Middle dots separate metadata: `Lisbon trip · from Safari · 2m`. Use en dashes for ranges (14th to 17th), curly quotes for captured speech.

**Length.** Buttons: 1 to 3 words. Row titles: one line, truncated with an ellipsis rather than wrapped. Empty state body: one sentence, two at most. Toasts: five words plus one action.

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
| label (a group inside a thread) | tag, category, folder |
| Undo | Revert, Discard changes |
| Leave (a thread other people are in) | Delete, Remove, Exit |
| Delete (a thread only you are in) | Leave |
| filing (while offload works out where something goes) | Sorting, Processing, Unsorted, Pending |

**Examples, verbatim from the kit.**

- Composer placeholder: `Dump anything`, one of twenty that cycle every ten seconds
- Toast: `Deleted, gone in a moment` · `Undo`
- Thread standing blurb: *"Still four things to book, and the flight is in two weeks."*
- Row and its meta: `Ana needs an answer on the 14th to 17th` / `Lisbon trip · asked Tuesday`
- Free time in the agenda: `4:30hrs free`

**Emoji: none.** 👀 marked a message offload had seen but not answered from 003 until 16 September 2026, and it was the only one in the product. It is gone: the writing indicator says the same thing at the same moment a few lines below, so that was two marks for one state, and the one that stayed is the one that also says work is happening. **A seen message has no mark at all.** Meaning is carried by Lucide glyphs and by type weight. Unicode characters are used only as punctuation (`·`, ` to `, `, `, curly quotes).

---

## Visual foundations

**The premise.** Black on white, one accent, hairlines instead of boxes, and a lot of empty space. The interface should look like it is holding almost nothing, even when it holds thousands of things.

**Colour.** A pure achromatic ramp (`--paper` through `--ink-950`) does virtually all the work: ink for content, `--ink-600` for metadata, `--ink-400` for the third rank, `--border-hairline` for separators and `--border-strong` for anything that outlines a control. On top of that sit exactly two accents, each with one narrow job and nothing else:

- **moss** `--moss-600` #3F6B4F, *offload did this, you didn't.* Inferred notes, the What moved section, a suggestion on a thing without a thread, thread references in a reply, the Done mark, selection highlight.
- **ink blue** `--blue-600` #3355D6, *this needs you.* Something is waiting, unresolved, or about to expire. Chosen as a cool counterweight so it separates from moss by temperature rather than by loudness, and never competes with it for attention.

Use the semantic aliases, not the ramps: `--text-accent` / `--surface-accent-soft` / `--border-accent` for moss, `--text-attention` / `--text-on-attention` / `--surface-attention` / `--surface-attention-soft` / `--border-attention` for blue. Neither accent is ever a page background, neither fills a primary button (that is always ink), and the two never appear on the same row, if something was sorted *and* is waiting, waiting wins. Beyond them, semantics stay muted: amber `--amber-600` for a soft warning, clay `--clay-600` for genuine failure. No gradients as decoration, no colour-coded categories.

**The change mark, the one pattern that is a moment rather than a state.** offload can file into the thread you are looking at, so a screen has to be able to say what just arrived without a badge that then has to be cleared. Anything that appeared while somebody was watching takes a `--surface-accent-soft` background settling to transparent over `--duration-mark`, 1400ms, and nothing else: no border, no icon, no count. It is moss because moss means *offload did this, you didn't*, and a row offload filed correctly needs nothing from anybody. It is deliberately not blue, which was asked for and declined: blue means *this needs you*, and on a flashed row that is also a task waiting on you it would put both accents on one row, which the rule above forbids. Reduced motion drops it to nothing rather than shortening it, so the row is simply there. Needed on every surface offload can write to while it is open: the thread page, Today, and both phones.

**Type.** Two faces, no third.
- **Instrument Sans** (`--font-core`), all UI and display. Semibold for titles, medium for labels and row titles, regular for body. Tracking tightens as size grows (`-0.022em` at 34px).
- **Literata** (`--font-quiet`), confirmed 11 August. offload's own voice, upright: the answer in Ask, empty states, occasional asides. Never a UI label, never more than two sentences. Deliberately not italic, italic is slower to read and gets tiring in a chat.
- **Numerals** use Instrument Sans with `font-variant-numeric: tabular-nums`, set on `body`. Timestamps and counts hold their column without a monospace face. One trap worth knowing: the CSS `font:` shorthand resets `font-variant-numeric`, so any rule that sets `font: var(--text-numeric-role)` (or any other composite role) must restate `font-variant-numeric: tabular-nums` after it, or carry `data-numeric`.

Roles: display 34, title-1 26, title-2 21, title-3 17, body 16, body-sm 14, label 13, caption 12. Title-2 carries section headers. Mobile minimum is 12px; body is 16px. Both faces are served as static instances from `assets/fonts/`, the same five files the web app ships (22 September 2026): Instrument Sans at 400, 500 and 600, with 700 resolving to 600, and Literata at 400 and 500 without its optical size axis, so the serif's display sizes come from the text master until the variable file is in.

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
- *Filing*: while offload is working out where something goes, the row's thread slot holds the word **filing** in moss, replaced by the thread's name when it lands. **It is also what a row looks like before the server has it at all**, since a write is drawn at the press and the request follows: such a row offers nothing to open or move until its id is real. Nothing else marks it and nothing reflows: the slot is the same height either way. This is the only per-row progress word in the system; everything else that waits uses the one spinner.
- *Disabled*: `--state-disabled-surface` with `--state-disabled-text`, the aliases for `--ink-100` and `--ink-400`. Use the aliases; components do. No opacity fades. This is the one place `--ink-400` still carries type, and it is the one place contrast rules do not apply.

**Motion.** Short and outward. `--ease-out` `cubic-bezier(.22,.85,.24,1)` for interaction, `--ease-entrance` `cubic-bezier(.16,1,.3,1)` for things arriving. 140ms for hover/press/colour, 200ms for toggles, 280ms for toasts and cards, 340ms for sheets. Things translate 8 to 14px and settle; **nothing bounces, overshoots, springs or spins** except the 720ms hairline spinner. Sheets rise from the bottom edge; toasts rise 8px and fade. No parallax, no scroll-triggered animation.

**Navigation motion belongs to the platform, not to this system.** Each kit follows its own convention and owns its own numbers: the web kit slides a pane in from the right in 260ms on `--ease-out`; the Android kit uses Material's shared axis X at 300ms on emphasized decelerate `cubic-bezier(.05,.7,.1,1)`, fades through between peers, and slides one navigation indicator in 250ms; the iOS kit pushes the whole screen in 350ms on `cubic-bezier(.32,.72,0,1)` and cuts between tabs, because UIKit does. Inside a screen, the durations above still hold. Each kit's `README.md` lists what it animates.

**Loading.** One spinner, optionally labelled in lowercase ("looking through your stuff"). No skeletons, no progress bars, no shimmer. **Asked for as a fading sweep on 20 September and declined:** a row typed in already has a treatment for "the server is still reading this", and drawing that row a second earlier is the whole of the placeholder.

**A write is drawn at the press and the request follows**, on every surface: the tick, archive, delete, rename, the drag, the fold, a note's edit and move, the privacy switches. **Undo is offered the moment the change is drawn**, not when the server answers, because the eight seconds are the person's. When the server refuses, the screen is put back and a failure `Toast` says so in one clause with the same action beside it.

---

## Iconography

**Lucide, and only Lucide.** Outline, 2px stroke, 24px grid, no fills, no duotone, no colour. 87 glyphs are vendored in `assets/icons/` as SVG so this system works offline; `Icon` reads from the jsDelivr copy of `lucide-static` by default and accepts `basePath="./assets/icons/"` to use the local set.

Icons are rendered as a **`currentColor` mask**, so a glyph always inherits the colour of the text it sits beside, that is why there is no coloured-icon rule to remember. Sizes: 14 (inside chips), 16 (metadata, small buttons), 18 (list rows, fields), 20 (bars, buttons), 22 (tab bar), 28 (empty states, in `--ink-300`).

Tab glyphs: `sun` / `moon` (Today and Tonight, on real sunset), `lasso` (My threads, a loop drawn round related things), `cloudy` (Notes). Then `sparkles` (anything offload did for you), `map-pin` `link` `image` `mic` `camera` `paperclip` `scan-text` (kinds of dumped thing), `square-check-big` / `check` / `check-check` (tasks and done states), `users` (shared threads and people), `arrow-up` (send), `plus` (new), `ellipsis` (more), `chevron-*` and `maximize-2` (navigation), `bell` `settings` `search` `clock` `calendar` `bookmark` `archive` `trash-2` `pencil` `share-2` `funnel` `lock` `house` `message-circle` `circle` `list`.

All 87 vendored glyphs: `album` `archive` `arrow-up` `arrow-up-right` `bell` `blend` `bookmark` `brain` `calendar` `camera` `check` `check-check` `chevron-down` `chevron-left` `chevron-right` `circle` `circle-dashed` `circle-dot` `clock` `clock-fading` `cloud` `cloud-cog` `cloud-download` `cloud-drizzle` `cloud-lightning` `cloud-moon` `cloud-off` `cloud-rain` `cloud-sun` `cloudy` `coffee` `compass` `ellipsis` `eye` `folder` `funnel` `gallery-vertical-end` `git-branch` `grip-vertical` `group` `house` `image` `inbox` `lasso` `layers` `library-big` `link` `list` `lock` `mail` `map-pin` `maximize-2` `message-circle` `message-circle-more` `mic` `moon` `moon-star` `newspaper` `orbit` `paperclip` `pause` `pencil` `play` `plus` `radio` `rewind` `rss` `scan-text` `search` `settings` `share-2` `sliders-horizontal` `snowflake` `sparkles` `spline` `square-check-big` `sun` `sunrise` `tag` `text-quote` `thermometer-sun` `trash-2` `umbrella` `users` `waypoints` `wind` `x` .

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
| `assets/` | `mark.svg`, `mark-inverse.svg`, `app-icon.svg`, and `icons/`, 87 Lucide SVGs, and `fonts/`, the five static faces. |
| `explorations/` | 43 exploration logs, plus `frames.css`, the shared shell the newer ones link: the mark, the accents, the type, section headers, the calendar, the conversation overlay, dark theme, notifications and the notification templates, settings layouts, swipe-to-delete, the iOS/Android comparison, the web shell, one motion page per platform, and the four that settled the edges: sign in with first run and the landing page, the no-invite screen with the email options and refusals, sharing and invitations, and the day-one empty states. Kept as the record of what was considered and rejected, and of what was picked. |
| `components/` | 29 primitives in eight groups (below). |
| `ui_kits/mobile_app/` | Interactive click-through of the iOS app; see its `README.md`. |
| `ui_kits/android_app/` | The same product on Material 3, sharing the iOS kit's data and flows; its `README.md` lists every difference. |
| `ui_kits/web_app/` | The same product on a desktop browser: sidebar, a stack of panes, one composer. Reads the phones' `data.js`; see its `README.md`. |
| `ui_kits/marketing_site/` | The public landing page with the waitlist, and the transactional email shell. Tokens only, no app code; see its `README.md`. |
| `ui_kits/admin_web/` | The staff panel: waitlist, people, staff, costs, limits. Same tokens, moss nav instead of ink; see its `README.md`. |

Components, each with `.jsx`, `.d.ts` props contract, `.prompt.md` usage note, and one `@dsCard` per group:

- **brand/**, `Logo`
- **core/**, `Icon`, `Button`, `IconButton`, `Chip`, `LabelMark`, `Badge`, `Card`, `Avatar`
- **forms/**, `TextField`, `Switch`, `Checkbox`, `SegmentedControl`
- **layout/**, `AppBar`, `TabBar`, `ListRow`, `SwipeRow`, `RowActionSheet`, `MemoryRow`, `SectionHeader`, `Sheet`, `PrismField`
- **feedback/**, `Toast`, `EmptyState`, `Spinner`
- **notifications/**, `NotificationIOS`, `NotificationAndroid`
- **answering/**, `AnswerResult`, `QuickReplies`
- **conversation/**, `TurnFooter`, `SentVoice`

**`Icon` is a DOM contract, and React Native needs its own.** It masks an SVG with `currentColor` and takes a `basePath`, which is a URL, and React Native has neither. A component named `Icon` there would be claiming a contract it cannot implement, so the name on that platform is **`Glyph`**, taking the same 85 slugs and the same sizes and resolving them from generated paths rather than from files. The contract itself is not written yet: it is owed by this system, not by a client, and until it exists a phone client should keep `Glyph` narrow and not widen the difference.

That is 29 components across eight groups.

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
control carries a label. **A seen message has no mark and so needs no alternative**, which is
one fewer thing to get wrong than the 👀 it replaced.

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

**There are two ways of declining and each is one line.** "Can't search that." is the
refused-subject line, said when the whole dump is a question about politics, weapons, self-harm or
sex, and it is said whether or not the web switch is on. "Not sure." covers four states: a question
that is not about their days, a lookup that did not work, the web switch being off, and a country
offload does not know.

**Neither gains a second line saying which.** This system specified one on 16 September and code
withdrew it on the 18th, correctly: "Searching the web is off in Settings." would be untrue every
time it appeared under the refused-subject line, and "That one is not about your days." is right in
one of the four states the other line covers. **The honest version would have offload diagnose
itself, which it does not do:** the sentence says what happened and the screen offers the way
forward.

**The test is not whether the fact is public.** "When do the clocks go forward" is answered, because
a date is what a day is made of and this product is about their days. "How do you make leek soup"
and "how much is bitcoin" get "Not sure." That line sits in the same bubble as the answer, which is
why the two refusals need the second line to separate them from it.

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

**Follow-ups are 012's control generalised.** **Five options at most**, all of them typeable, and
the labels are words somebody would say, capped at 24 characters by the server so a label never
wraps inside itself. Nothing that deletes, archives or empties gets a chip. One open question at a
time, closed by the next turn whatever it says. **And ask only what Undo cannot cover:** a
reversible write already sits behind eight seconds, so do it and report it instead.

**A question's options are values, and no value is a primary.** A choice among things it could be
is one offload does not know the answer to, and dark ink would say it did. A value is `Chip`'s
geometry with a raised paint, `--surface-card` inside `--border-strong`, 30 tall in a 44 target.
The fill is 1.06:1 against the reply bubble in light and **exactly 1.00:1 in dark**, where the
bubble and the card are the same token, while the border is 3.17:1 and 3.59:1. So **the border is
what draws this chip** and the fill only matters where the bubble does not reach. The paint lives on
`QuickReplies` rather than as a fifth `Chip` tone: what it needs from `Chip` is the geometry, and a
governed component should not grow a variant for one use. 012's proposal keeps its one primary,
because there offload does have a recommendation.

**The way out is last, on a line of its own, and carries an `x`.** "Not that", plain, no border. It
is not one of the values, so it never shares their line: which line it landed on was otherwise a
property of the labels rather than a decision. The `x` is what stops a borderless chip beside
bordered ones reading as a value whose border failed to draw.

**One group, named by the sentence that asked.** The `label` prop is that sentence verbatim, so a
screen reader hears the question before the options; the clients repeat it as each chip's hint,
because iOS does not read a container's name.

**A question with no values to offer is answered by typing**, and the composer's placeholder is the
invitation: "Which dates? e.g. Sept 12th at 5pm". The field's accessible name stays "Dump anything".
The preamble is dropped because it did not fit: all three invitations overran a 266px field at
390pt, at 309, 269 and 327px, and what each lost was its example.

**A turn that filed silently and asked gets a reply bubble for the question**, with nothing else in
it, after the footer that reports the filing. The order is the turn's order: what happened, then
what is still open.

**The trust boundary.** Picking writes your turn into the log exactly as typing would, and the turn
it creates is the one that carries the write. The turn that asked writes only what the dump asked
for, as any filing turn does, and **an answer never runs a turn with write tools at all**: a tap is
applied by the server with no model, a typed answer is judged and applied before the planner runs,
and the one re-run for a country is an answering turn holding no write tool.

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
under the bubble it is tucked inside. **And there is nothing beside it:** the seen mark that used
to share that corner went on 16 September, so the footer carries the Done mark alone.

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

## Voice notes

021, folded in 21 September 2026 off `explorations/voice-notes.html`. **A voice note is words:**
once offload has written it down the message is a text message to every reader, and none of them
has a rule of its own for voice. So the feature adds a composer state, a bubble and a transcript,
and no new screen.

**The composer's microphone is in the kit's order**, camera then microphone then send, and tapping it
replaces the field with the recording row: a pulsing dot, a running `m:ss`, and a live window that
grows from the right with its older bars fading. **No pause and no listen-back**, this is a thing
you say and let go of. Nothing else in the composer is reachable while it records, and the screen
stays awake, because an auto-lock would cut the very notes the feature exists for.

**Typed words stay drawn above the row**, static, primary ink, capped at three lines. The kit hid
them and sent them anyway, which is text you cannot see being sent, and that is the one thing a
composer must never do. Photos already attached stay as `AttachChip`s in the same row.

**A stopped note is the row with no dot.** The absence of the dot is the whole signal, so reduced
motion changes nothing about it: at ten minutes, on an incoming call, or when the app leaves the
screen, the time and the window stand still and the row stays sendable.

**The recording row's Send is `primary` with no tone**, which is ink with a white glyph. The blue
attention tone belongs to the idle row, where it means "you have something to send", recording does
not promote Send to an attention control, it makes it the only thing left to press.

**The discard control is "Discard voice note".** The vocabulary bans "recording" as a noun anywhere
a person reads, and the kit's "Discard recording" was the one place it would have been read aloud.

**`SentVoice` draws the note's own thirty two bars**, resampled over the whole recording and stored
with it, so every surface and every reload draws the same bars. The kit's opacity ramp over
`--ink-950` is withdrawn: it made every note appear to fade in from silence and read as a fill that
was always half played.

**The glyph is the control**, `play` at rest and `pause` while playing. **Played bars are
`--text-attention` and the remainder recedes to `--ink-300` only while playing**; at rest every bar
is `--text-tertiary`, because then the whole waveform is the note. `--text-primary` is louder but
measures 1.21:1 against a tertiary remainder, which makes the fill edge invisible.

**The transcript is beneath the bars, inside the person's own bubble**, in `--font-core` at
`--text-secondary`, folding to "Show all" past its first lines. **It stays in the UI sans while the
reply below it is `--font-quiet`**: the transcript is what they said and the reply is offload
speaking, and two faces a line apart is what makes the transcript read as a record rather than an
answer. Measured 6.24:1 light and 7.65:1 dark.

**A note with nothing to hear draws no transcript line at all**, rather than an empty one, and
offload's reply is "Heard nothing in that one." with no question and no retry.

**One failure pattern, and one exception.** The clause is the state and the control is the exit:
13px `--text-danger` with the way forward in `--text-accent`, under the composer with a dismiss `x`
on every line, or below the bubble on a failed turn. **The exception is "Not here yet."**, the
playback failure, which sits inside the note between the row and the transcript with no control at
all, because the row above it is the retry.

## People, and connecting

Decided 21 September 2026 off `explorations/sharing-and-avatars.html`. The product had this in
fragments: a share sheet, a `people` settings page, a `PersonScreen`, and no account of how two
people become connected in the first place.

**A connection is mutual, and it outlives the thing you made it for.** Sharing invites nobody in, so
the only way in is an account that already exists.

**Email only, exact and case-insensitive.** Accounts have no usernames, so an address is the only
handle there is, which settles the lookup: one full email returns one account or none. No partial
match, no name search, no suggestions. **A name search over real people is a directory whether or
not it is called one**, and an email is something you can only have if they gave it to you. The
found row shows the address as the account stores it, which is what confirms the match was
case-insensitive rather than lucky.

**The word is request, not invite.** An invite to somebody who is not on offload cannot be sent, so
the `people` page's shipped *Invites* group becomes **Pending**, and `Resend` becomes `Remove`. That
group is the only place your own outstanding requests are listed.

**A request carries no message and no thread.** One that arrived saying "wants to share Lisbon trip"
would leak the thread's name to somebody who has not accepted yet.

**It is answered on the card, not on a screen.** `PendingInvite` gains a moss **Accept** and an
outlined **Not now** on their own line, so the sentence keeps its measure and both clear 44px. A
shared thread still opens instead, because a thread has content to preview and a connection does
not. **Not now is not No and not a block**: it leaves the request pending, and `Blocked` already
exists on the `people` page for the escalation.

**A decline looks exactly like silence.** Nothing tells you a request was declined, which is the only
version that does not turn a no into a notification. Re-requesting is rate limited on the server.

**One dot, in two places: the gear in the `AppBar`, and My people inside Settings.** It is
`IconButton`'s own `badge`, 8px `--clay-600` inside a 1.5px `--paper` border, which the bell beside
it already passes. **Only a request needing your answer dots anything**, your own pending requests
do not, because nothing is waiting on you. There is no notifications page: a third place to read the
same two facts would be a page that exists to hold a dot.

**Every avatar is a door.** Tapping a person anywhere, a row's meta, the share sheet, a pending
card, a mention, opens `PersonScreen`. The kit routes there from My people only. That rule is what
makes the Settings location right rather than merely tidy: you almost never go to the list, because
you go to the person. **An avatar is never decoration.**

**Removing a connection leaves shared threads untouched.** They are listed in the confirmation, not
acted on, so you leave knowing what is still shared. A thread with three people in it has nothing to
do with whether you and one of them are connected, and leaving them is the ordinary Leave, one at a
time. **The second sentence of that copy is load-bearing**, "removed" does not mean "no longer
shares things with me", and must not be cut. Removal is mutual and silent, and it is **the one
place with no Undo**, because the other person's copy changes too.

**Unsharing one person shows what stays, not what goes.** The things they added stay, because a
shared thread belongs to everyone who was in it, and that is the surprising half. The verb is **Take
out**, not Remove: two different destructions should not share a word.

**The share sheet has no search field** when every connection fits, which with a handful of people is
always. A field over a list that already fits is a control asking to be used for nothing.

## The prism avatar

`Avatar`, new on 21 September 2026. The product had no avatar component: the kits hand-rolled an
initials circle in five places, which at 32px is two grey letters. Nobody uploads a photo, so the
mark is generated.

**Seeded from the account's immutable id**, never the name or the email, both of which change, and
never anything a person can pick, the moment it is choosable it stops being a reliable way to find
them.

**Two constants, and they are the part not to relax.** Every stop lands in OKLCH `L 0.42` to `0.52`
at `C 0.13`, which keeps white initials above 4.5:1 on every hue the generator can produce. **The
ceiling is measured, not chosen:** at `L 0.56` the lightest hue put white at 4.16:1, which is one
person in twelve with a monogram that fails and no way to fix it afterwards.

**Hue comes off a 12-step wheel, not a continuous hash**, so two people are never almost the same
colour: at 36px a 15 degree difference is no difference.

**The facet is part of the identity, not decoration.** Twelve hues alone is not enough, twelve
accounts land on **eight** distinct hues, so a third of a list of twelve shares a colour. A hard edge
at one of **eight** seeded angles is the only structure that survives 36px, which takes that list
from 8 distinct avatars to 12. 12 × 8 buckets.

**Every avatar in the product is between 28 and 56px**: 28 on a pending card, 32 in `PersonRow`, 36
in the share sheet, 52 on a person's page, 56 on a request. Three of the five are at or under 36, so
**the mark is scanned, never studied**. **Below 28 do not draw it**, the edge is marginal at 24 and
the initials alone are more honest.

**The initials stay.** A prism can be recognised but not read, and you need to find somebody you have
never seen by name.

## The launch screen

Decided 21 September 2026. Both phones shipped Expo's default splash, and since 20 September it is
held for a whole `/api/me` round trip on every cold start, so it needed designing.

**The mark alone, centred, on `--surface-page`**, in both themes. No wordmark: iOS's storyboard allows
no text at all, and the wordmark is live type rather than an outlined file. 216pt on iOS; 192dp on
Android, drawn inside the 240dp canvas its splash masks to a circle, on no background layer, so no
circle shows and the system's own reveal has room.

**The mark is `--text-primary`, not `--ink-950` and `--paper`.** Both ramps invert in dark, so `--paper`
there is #191919 and a mark set to it measures **1.02:1** on the page. One token gives ink on light
and #EDEDED on dark with nothing to keep in sync, and it is the same one-colour rule the mark has
always had.

**It is two screens, because no platform splash takes a spinner.** iOS gives a background colour and
one static image; Android 12 and later gives a colour, an icon and its own reveal. So the app draws
a **holding screen** the instant the splash hands over, identical to it, and the spinner fades in at
**1000ms**, 64px under the mark, unlabelled, the readme's lowercase label has nothing honest to say
yet, since offload is not looking through your stuff, it is finding out who you are.

**The seam is the whole risk.** Two screens meant to look like one will not unless the mark is at the
same size in the same place in both, **measured from the screen's centre rather than from a
container**. The spinner must not be in the centring flow: put it in the column and its box
re-centres everything above it, moving the mark by half the spinner's height plus its gap.

**The app icon's #FFFFFF and this screen's #FAF9F7 are one tap apart.** Both are right on their own
terms, a home screen is not a page and a launch screen is the app's own ground, and nothing proposes
changing either.

**When nothing answers** (1 October, off `explorations/finishing.html`). Only a 401 goes to the gate.
Anything else holds on the launch screen, the mark where the splash put it, no plate, and the
failure takes the spinner's place 64px under the mark. **Two cases, two messages:** with no network,
*You're offline* over *offload picks up when you're back.*, retrying when the connection returns;
with a network but no answer, *offload isn't answering* over *It's on our side. Trying again.*,
retrying on its own at 2, 4, 8 and then every 15 seconds. Title 17px semibold, line 14px
`--text-secondary`, and a 36px outline **Try again** pill under both. Never `--text-danger`: it is
not the person's mistake. The web draws the same two lines alone in the middle of the page.

## The photo viewer

A photo opened from a tile, a thumbnail or a row's tile, shown over whatever was on screen.

**The plane is `--surface-viewer`, not `--surface-scrim`.** The scrim is 0.32 and dims what is behind
it; this is a surface in its own right, and at the scrim's value a white screenshot on a warm page
read as a page behind a page.

**In dark the plane is opaque**, `--surface-plate` at #0F0F11. A translucent plane in dark has nowhere
to go: `--surface-page` at 92% over `--surface-page` measures **1.00:1**, and even the darkest value
reaches 1.11:1, so what says a viewer is open there is that the screen behind it is gone. Light stays
at 90%, where the translucency does work and composites to about #232323.

**Everything on the plane is `#FFFFFF`, not `--text-inverse`**, including the status bar, which goes
white the way a phone's does when a dark full-screen view opens. The plane is near-opaque ink in
light and an opaque near-black in dark, so ink-inverse would flip to dark text on a dark plane.

**The controls are overlaid top right on the web and in the platform's bar on the phones**, which is
`AppBar`'s geometry over the plane, transparent, below the status bar. Full screen is web only: a
phone has no window to fill.

**The plane runs full bleed and the status bar rides above it.** A photo should run under the status
bar; the bar itself must survive, in both themes.

## The move sheet

The first move control in the product, and it is `Sharing.jsx`'s sheet with the list swapped.

**What it shares with the share sheet is the sheet:** the same 42px `FindField`, the same row rhythm,
the same footer. **Not the leading slot.** That list is people and takes `Avatar`; this one is threads
and leads with an 18px `lasso` in `--text-secondary`, as `MemoriesScreen` draws a thread and as the
thread's mark reads in `TurnFooter`'s pill and `AnswerResult`'s chip.

**The thread the row is in is not in the list.** Not greyed, absent. And **move can run out of
destinations**, which sharing never can, so a one-thread account gets a sentence rather than a search
field over an empty list. That is the one state where the footer's way out is the only thing to press.

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


**Since 29 September the thread's calendar is always a month**, with the month bar (step, name and
Today, step), the swipe on the phones and the directional slide; the week rail is drawn nowhere. A
month's dots wait for its events and the months either side are read ahead, so a month is drawn
once. **A picked calendar's events are quieter than the thread's own**: a hollow ring in
`--text-tertiary`, drawn last in the cell, and they never lift it; the lift is the thread's own
things only. The day list under it draws its event anchors at 16px on a 2px spine.

## Calendars

Decided 17 September 2026 off `explorations/calendars-options.html`. Connected apps had a Calendar
row that led nowhere and first run had a connect screen; this is the row leading somewhere and that
screen having a second home. **Two levels of consent, and they are different questions:** the
account approves which calendars offload may use at all, and a thread picks which of those it uses.

**The connect screen is first run's, verbatim.** Same heading, same two prose lines about reading
your days and adding to them, same button. One screen entered two ways, with one sentence added
under the button: **"You choose which calendars after this."** Connecting is not consenting to all
of them.

**A calendar is a checkbox, not a switch.** A switch says a capability is on, and the capability is
the connection one level up; this is a selection among peers, so it is `Checkbox` as governed: 20px,
`--radius-xs`, `--border-strong` unticked, `--surface-inverse` with the inline stroked tick when ticked.
**Never the moss tick**, which this document reserves for a finished row: a calendar in use has not
been completed. It also means the group header can carry **4 of 7 in use**, which a column of
switches cannot. **That is the one component change the page needs:** `Group`'s label is a plain
`<div>`, so it becomes a baseline flex row with the label in a `flex:1` span and the count after it,
in `--text-numeric-role` at 11px. Groups with no count render exactly as they do now.

**An unticked row goes `--text-tertiary`**, and the ticked one keeps full ink. That inverts
`Checkbox`'s own label treatment, where ticking dims a row and strikes it through, and the reason is
the same one: dimming marks the row that is out of play, which for a task is the finished one and
for a selection is the unpicked one.

**The provider's colour comes in as a 10px dot, as recognition and never as the differentiator.**
These are somebody else's hexes and we do not get to pick them: measured on `--surface-fill`, four of
seven ordinary Google colours are under 3:1, the yellow at **1.51:1**, and two are under in dark.
Every swatch carries a `--border-hairline` ring so the pale ones keep an edge, which is definition
and not contrast. **Where two calendars share a name, the row's note carries the account or the
owner**, the way a shared calendar already says who shared it. Nothing else on the page is coloured,
which is what keeps a provider swatch from reading as one of our two accents.

**The page says what it cannot do, not just what it can.** `Read only` on a subscribed calendar,
because offload cannot add to it, and disconnect says what it **keeps**: threads keep what they
already know, offload stops reading your days.

**The thread control is a plain `calendar` glyph in the app bar**, left of share and the ellipsis, and
**it never carries a badge or a count.** A dot and a bubble both mean attention in every app anyone
has used, so a mark meaning "you configured this" earns a tap that finds nothing wrong. `IconButton`
already owns a badge dot that means *something new*, and this is not news. **Nothing in offload
counts on a glyph at all:** the activity bell is passed an unread number and draws `IconButton`'s
dot with it, and web's only numeric unread sits in a sidebar row as text, so a counted glyph would
be a new mark type rather than a borrowed one. The accessible name
carries the state instead: **"Calendars, none in this thread"**, or **"Calendars, 1 of 4 in this
thread"**. On web it is the same glyph in the pane head opening a popover rather than a sheet, and it
is **the third tool in that head**, which the pane-head rule was amended for: a scope control earns a
head slot where an action does not. The ellipsis keeps a **Calendars in this thread** row on both
surfaces, so the picker is reachable two ways.

**A thread starts with no calendars and picks explicitly.** Approving a calendar in Settings adds it
to no thread, ever: **explicit is the safer default when the thing being widened is other people's
days**, and a shared thread silently gaining somebody's work calendar is the failure that rules
inheritance out. So the ticks are the whole state, there is no inheriting third state and no **Use
all** control, and that is what lets the glyph stay plain.

**No calendars is the commonest state in the product**, so it gets a sentence rather than a
footnote, and no empty illustration: the list is already on screen, so the rows are the call to
action. One line changes, to **"offload is not reading any calendar for Lisbon trip. Tick the ones
it should."**

**A thread's list is always intersected with the account's**, so un-ticking a calendar in Settings
removes it from every thread at once and a thread's stored id simply stops resolving. Without that,
a thread can hold a calendar the account no longer allows.

**Where an event lands is a thread question, so there is no "Add events to" setting.** One calendar
ticked and the thread has already answered it. Two or more and **offload asks in the conversation**,
with the thread's own calendars as the values in the existing follow-up control, which is the case
that control was built for. None ticked and there is nothing to ask: anything with a time on it
stays a thing in the thread. **Read-only calendars are never offered as an answer.**

## Dates and notifications

Decided 22 September 2026 off `explorations/due-dates-and-notifications.html`. **The schema has
carried dates since 001 and no person could ever write one:** every date in the product was
inferred by a model from a dump, with no field, no picker and no way to clear one.

**One field, called When, and the row's type decides the column.** A task writes `due_at`, an
event `occurs_at`, everything else `due_at`. Duration is `occurs_end_at`, offered only on an
event and only once an hour is set. **A due date may carry an hour**, "call the clinic at 9" is a
task, and an hour clears `all_day`.

**Recurrence is an RRULE.** The picker follows Google Calendar's presets and Custom dialog, because
019 writes to a real Google calendar and a vocabulary that survives the trip needs no translating.
The old six-value enum could not hold an interval, a weekday set, a monthly anchor or an occurrence
count.

**The control lives in the edit sheet and nowhere else.** The row draws its date and does not act
on it; since 29 September a phone row draws no tools at all (see *The row and its sheet*). **An undated row shows nothing and asks nothing**,
because principle 04 made offload not ask for dates nobody gave.

**The chip has a line of its own under the title**, above the meta, on every surface (26 September): beside a long title it had a third of a phone row. The line is the row's **marks line**, and a row's labels follow the chip on it. **A late chip says how late, not which day**, and drops the hour: "Due yesterday", "Due 4 days ago", "Due a week ago", "Due a month ago"; an event without the prefix, "3 days ago". Today, tomorrow, the coming fortnight and the far future name the day as before. The hour row is labelled **Time** on a task and **Starts** on an event.

**The chip is coloured by nearness.** `--clay-100` on `--text-danger` for late, `--amber-100` on
`--amber-700` for today plus three days, the plain fill after that. Amber rather than blue, since
blue is the attention colour and would read as offload asking for something. A done row loses the
colour whatever its date. **A `bell` after the date means the digest will announce this row**, and
it is read-only.

**The account has a default zone and a last-seen one.** When they differ, a strip on Today states
the fact before offering the change, *Showing times in Lisbon. This phone says Tokyo.*, with both
answers inside the card as tinted text buttons. Once per zone, not once per day. The web says
*This browser says*.

**A date is not announced; a reminder is.** `is_reminder` gates both digests, so most dated rows
are silent and **an empty digest is the normal morning**. A person can set a date but cannot ask to
be reminded of it: the flag is the model's alone.

**Two sends a day, and no per-item pushes.** Today at 8:00, tomorrow at 19:00, in the account's
zone, skipped when empty. One thing is named, two to four listed, five or more counted after the
first two. Titles are verb-free and subject-free: **Due today**, never "You have 3 tasks due".
Another member's row is named with its author, as *Ana's ferry times*. A share reads *Ana added two to Lisbon trip*, and a request ends *Answer in My people.*

**A digest carries no actions**, because Done is about one thing and a digest is about five; a
digest holding exactly one thing gets **Done** and **Tomorrow**. Tomorrow writes a date, so there is
no notification-level snooze anywhere in the product.

**The bell opens Activity**, a pushed screen without the plate, newest first under Today, Yesterday and Earlier. It is a record of what offload sent **and of what it decided quietly and
never said**: an expired invite, a calendar write waiting on them, a closed question, labels offload applied,
and anything a switch or a permission suppressed. Sent and unsent are the same row with a
different lead: a 28px disc filled for what reached the phone, hollow on `--border-lift` for what
did not, and a *Not sent* mark that is a door to the setting when a setting caused it. **A decline
writes nothing**, by 022's rule that it interrupts nothing. Thirty days, then it purges. **A
dot, never a count**, and no Due sheet: forward-looking "what is due" is the Timeline's job.

**Notifications is its own page** in Reaching you, replacing Communication: Due today, its hour,
Tomorrow, its hour, Connection requests, Added to a shared thread, and System settings. When the
system was never asked, the page offers the one permission ask; after a refusal it opens System
settings instead. **Today** is described in its own section below (1 October), which supersedes the
three groups. **A sheet's action row wraps** at an
accessibility text size rather than clipping.

**The model may overwrite a date a person set**, where the dump states a new one. Nothing is
sticky, so the change takes the existing change mark and writes an Activity row.

## The row and its sheet

Decided in code on 26 to 29 September 2026 and adopted here. It supersedes the kits' rows and edit
sheet wherever they differ.

**A tap on a row opens its edit sheet, and a phone row draws no tools.** Three glyphs on every row
took a third of a phone's width off the title. The swipe still deletes and the long press still
opens `RowActionSheet`. **A link with an address keeps the tap for its page** and draws one
`ellipsis` that opens the same sheet; there is no `arrow-up-right`, because the domain under the
title already says the row goes somewhere. Somebody else's row cannot be edited, so its tap opens
the action sheet, which in a thread carries **Labels** after Edit. The web keeps its row tools.

**The row is top aligned.** The lead (checkbox, 36px type tile, or picture) and the one tool sit on
the title's line, 21px on the phones and 15.5px at 1.35 on the web. Under the title, in order: the
**marks line** (date chip, then labels), a meta line where the surface needs one (Today's thread
name and its labels), and a link's domain. **No details are drawn**, on any row or note: offload is
for short things. A picture lead is 50px on the phones and 72px on the web, topped with the title.
A checkbox beside a reorder handle sits at its own 21px, not in the tile's slot. **A finished to do
keeps the handle's space** so its checkbox lines up, and a 1px rule in `--text-secondary` separates
finished from open while both show. Live rows on the web draw no "you · date"; the archived view
keeps "archived 20 Sep".

**The edit sheet has no heading and no details field.** The title field is `title-3` semibold in
`--text-primary`, then rows at 44px, each a glyph, a name, its value and a chevron: **When**
(`calendar`), **Repeats** (`clock`), **Labels** (`tag`, the row's dots and names), and **Remind me**
with a switch while the row is a reminder. **When, Repeats and Labels open in place**, as panels
inside the same sheet, and hand their value back on Done; Save below writes once. Custom repeat is
the one that still opens its own sheet. The sheet grows by the keyboard from its foot, so its top
never leaves the screen.

**Every row sheet has one foot**: the way out on the left (Delete in clay, Archive, Put back, or
Clear in a panel), Cancel and the confirming action on the right, three 30px pills that wrap at a
large text size. **Save where it writes, Done where it hands back** to a sheet that will. The When
and Labels sheets the long press opens alone use the same foot.

**A note row** on the phones has no sparkle: moss ink already says offload wrote it. Its labels are
dots at the trailing edge, on the first line. Its handle sits on the first line and clears the text.

**A thread's line** in My threads and the web's pane head says what is in it: the two biggest open
kinds, largest first, "15 to do, 3 links", or for a shared thread one kind and the people, "6 to
do, with Ana". No "you", ever; an empty thread of your own has no line. **"Thing" is retired** from
anything a person reads: a day with a link on it is "2 more" after named kinds, or "2 on".

## Labels

Decided 26 September 2026 off `explorations/labels.html`. A thread can hold more than one
subject, and a long trip keeps Lisbon, Paris and Istanbul in one flat list. **A label is a named,
coloured group inside one thread.** Several per thing, shared with every member of the thread, ten
per thread at most, names up to 24 characters.

**Two shapes, one family.** A **mark** says something about a row and sits inside it: the date
chip, a label, Activity's *Not sent*, all at `--radius-xs` and 20 or 24 tall. A **chip** is
something you press: `Chip`'s 30px pill. So a label is `LabelMark` on the row and `Chip label`
in the filter bar, the way a date is a chip on the row and a preset in the When sheet. The thread
pill stays a chip, because a thread is a place, and the type glyph stays the type.

**The colour is the label's solid with white words**, `--label-1` to `--label-10`, the same in
both themes. A new label takes the lowest number its thread is not using, so the first three are
cerulean, rose and leaf. The hues keep clear of moss, blue, amber and clay, and **a label is never
moss**, whoever applied it.

**Applying.** Every row draws its labels on the marks line under the title. **A row's labels are
reached from its edit sheet**, the Labels row, since the row draws no tools on the phones (29
September; the `tag` tool on unlabelled rows of 26 September is withdrawn there, and the web keeps
it first among a row's tools). Another member's row reaches Labels from the long press. The label
panel: *Labels*, the row's title, the thread's labels with dot, name, count and tick, New label, and
the foot with Clear. **Many at once starts from the label**: the filter bar's pinned `plus`, or
holding a label chip, or tapping a mark, opens that label's list with a tick per row, Rename,
Colour and Delete. **A taken colour swaps**: the picker marks it with its label's initial and picking
it swaps the two. A new label shows no colour picker and takes the lowest free one. **#** in the
composer lists the thread's labels as **@** lists people. The turn footer's mark is 30px, the
footer's own height, three and then a count. On the web, holding is the chip's context menu, a long
press on touch, or a small `pencil` beside a picked chip.

**Filtering.** A chip bar under the app bar, once the thread has a label: All, each label with its
count, No label in outline, and the `plus` pinned to the trailing edge on the page's own ground, no
fade. **Either logic**. A picked chip fills with its label's colour. Kept per thread on the device.
An empty result says *Nothing under Lisbon yet.*, or *Nothing without a label yet.* **A thread with no
labels draws `tag` in the app bar**, first among its glyphs, named *Group with labels*, and it goes
once the thread has one; there is no filter bar and no six-row threshold. The web pane head takes
it too, which makes its tools "up to two".

**Outside the thread a label always travels with its thread's name.** Today: the meta line, then
the marks, and no way to label from there. The calendar: offload's own dated rows carry their marks
and a Google event carries none; the month's dots are the type dots and narrow with the filter. The
map's pins are the split pin (see **A thread's map**).

**What offload does.** It labels live while filing (apply by id, make one only when its name is in
the message, remove when asked), inside the turn's Undo. The nightly sort is built and **switched off
for now**. Activity records what offload labelled, with Undo for thirty days. **A person's change is
final.** Deleting a label takes it off every row and deletes nothing else. The copy has no noun:
*Seven labelled.*, *Packing list is under Istanbul*.

## Today

Decided 1 October 2026 off `explorations/today.html`, replacing the placeholder on `main`. Today
says **what to expect and what to do**, across every thread. It is not a calendar: events are
context, and a tap opens one in the calendar app.

**Needs you**, on top, holds interruptions only: an account issue, a person waiting, a question
offload asked (a question about a forwarded email included), and at most one tip. One card shows
with the rest stacked under it: the kind and how long it has waited, a title, one line, the actions
that settle it, and a clock that puts it off until tomorrow. **Late to-dos are not in it**, and
nothing is drawn when it is empty, which is most days. There is no heading and no date row.

**The day**, under it, one day at a time:

- **A stepper**: Today, Tomorrow, weekday names to Sunday, Next Monday to Next Sunday, then the
  date. The back arrow stops at Today; a swipe across the day does the same. Other days write their
  date small under the name. The page opens on Today every time.
- **The next event in one line**, in 20px semibold, its countdown in `--blue-600`:
  *Call with Ana in 1h 30m*. On another day, the first event and its hour.
- **Where you will be**: the day's events as a strip of 128px cards scrolled sideways, past ones
  faded, the next one raised.
- **To do**: late first with its late chip (past three, *3 more late*), then to-dos with a time
  carrying a clock chip, then the rest due that day. The thread page's own rows.
- **If you have time**, on Today only: up to three to-dos with no date, offload's pick, each with
  *+ Today* to take it on.
- Empty sections are not drawn. No line for tomorrow.

**Threads are thread pills**, the conversation's moss chip with `lasso`, at 24px to sit on a row's
marks line beside the date chip; a label follows it. A calendar name stays plain text.

**Customize Today** opens from `sliders-horizontal` in the app bar, which only Today draws:
Needs you, Your day and What moved, each dragged to order and switched. What Needs you and If you
have time hold is the server's rule, not a setting. The layout is one small document per account,
read by the server; no model call is involved.

**The forwarding tip** (026): *Forward emails to offload*, the address `over@to.offload.club` and
the sign-in address in its line, with *Copy address* and *Got it*. Never shown to an Apple hidden
email. A filed or failed email stays in Activity.

## Not in a thread

Decided 1 October 2026 off `explorations/loose-items.html`. A thing can be put down without
belonging anywhere, and that is a state, not a thread. **Always on is retired**: My threads is one
list by last activity, then Older threads, which is about time; a slow thread sinks and comes back
up when something lands.

**Storage is the default thread** (`accounts.default_thread_id`), unchanged and under its own key.
It is never drawn as a thread: not in My threads, not as a thread pill, not in the move sheet, not
shareable. A row elsewhere (Today, search) draws nothing in its thread slot.

**The group** sits between the list and Older threads, titled *Not in a thread* with its count.
Rows are the things themselves with their type tile, no thread name, and the meta *Photo · Monday*.
Type chips under the heading, only for types present and only when there are two, filter the group
in place: three rows, then *All 5 links*. *All 14* opens a pushed screen, *Not in a thread*, *Put
down without a thread, newest first.*, the same chips, rows and suggestions. A swipe deletes; Move
is the row sheet's. Not drawn when empty.

**A suggestion is one button under the row**, with a cross beside it that dismisses it for good:
- *Move to* an existing thread: moss soft ground, `lasso` and the name in `--moss-700`. From the
  planner at filing time, when it was not confident enough to file.
- *Create* a new thread: paper with a dashed `--moss-600` outline, `plus`, the name, *new thread*.
  From a daily job, for two or more things only. It opens a sheet, *Create a thread*, *These three
  look like one project.*, the name editable and the things each untickable, Cancel and *Create
  thread*; the thread opens after.
- The name inside is a label, never a link. Most rows carry none. Move is immediate with a toast,
  *Moved to* and the thread, and Undo.

**offload's reply** for a thing filed without a thread is Done alone, with no thread pill and no words (as built, 028). A shared Move to draws the people it would share with as faces: 20px initials marks on `--surface-fill`, overlapping by 6px, then *+1*.

## A thread's map

Decided 2 October 2026 off `explorations/maps.html`. A thread has a map once one live thing in it
has a point: a saved place, a link whose page gives a location, or an event with a venue, offload's
own or from a connected calendar the thread shows. The map is never there by default.

**The switch.** `list` and `map-pin` in a segmented pair in the app bar, before share and More,
only while the thread has a point. Map replaces the body under the app bar: the thread's name moves
into the bar, the label chips float over the map on `--surface-raised` with `--shadow-1` and filter
the pins exactly as they filter the list, and the composer stays. Kept per thread on the device.
Android draws the pair as an outlined segmented button with the picked half on
`--surface-accent-soft`. **The Places section is retired**; located things sit in Everything in here.

**The web column.** From 1200px the thread pane splits: the list keeps its column, the map takes 460px
on the right, full height and sticky, and the switch is not drawn. Hovering a row lifts its pin;
picking a pin highlights its row with `--surface-fill`. Below 1200px the web uses the switch.

**Pins.** 16px dots with a 2.5px white ring, 24px with 3px when picked, each in a 44px target. The
label's colour, split down the middle for two labels (the first two of more), `--ink-900` for none;
events are 5px-radius squares. Overlapping pins become an ink count dot until zoomed apart. **An
approximate place**, a listing that gives an area until booked, is a circle about 300m across in its
label's colour, 16% fill and a 1.5px ring at 70%, picked at 26% and 2.5px; its sheet's Address reads
*Approximate, Alfama*.

**The callout.** 228px on `--surface-raised`, 14px radius (16 on Android), a tail on the point: the
name, the kind and labels, then *Directions* (filled, `compass`) and *Open*. Tapping the map closes it,
another pin moves it, and it is kept inside the frame. **Directions** opens the device's maps app with
the place as the destination: Apple Maps on iOS, or a choice when Google Maps is installed; Google Maps
on Android; Google Maps in a new tab on the web. **Open** is the thing's sheet, the same as its row:
a half sheet over the map on the phones dimming it at 35%, the side pane on the web. Header with the
type tile, name, kind and thread, and a close; rows for When, Address, Link, Labels and Added by; two
equal 48px buttons, *Directions* filled and *Open link* or *Edit* on `--surface-fill` (outlined on
Android).

**Framing.** Fitted to every point, never closer than street level (zoom 15). A filter that leaves
none shows the whole area with *Nothing under Food on the map.* A thing with no point is not drawn.

**The stack.** MapLibre on all three, MapTiler Streets and Streets Dark, with *© MapTiler ©
OpenStreetMap contributors* small at the bottom right. Place lookup is MapTiler Geocoding.

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
- **A fourth control, on a list that can be arranged: the reorder handle.** `grip-vertical`, leading the row's tools and left of the pencil on web, first in the trailing controls on the phones, and alone at the trailing edge of a row that has no pencil. **It is the one row control whose hover does not invert to ink**, because it does nothing when pressed: it keeps `--surface-fill` and takes a `grab` cursor. Its target is the glyph plus 8px of slop rather than a full 44, which sits inside the row's own target and is the compromise the row's other controls already make. **The row being moved lifts** to `--surface-raised` with `--shadow-2`; **the row the drop would land against takes a 2px `--ink-950` line** on that edge, at the row's full width, because every other boundary in the list is full width and this one is a boundary. **The drop is a priority**, the midpoint between the two neighbours on the 0 to 100 scale the reprioritise already used, never a tie.
- **The way to the archived pile is a row at the foot of the list**, not a tool on the pane: "3 archived" with a chevron, below everything live. The archive is a place you go rather than a mode you toggle into, and the count is readable without hunting for a highlighted icon.
- **A pane head carries up to three tools and a More menu**, and the third has a criterion, added 17 September 2026 when calendars asked for it. Open full, then `ellipsis`, which holds rename, add note, Leave, and anything a thread gains later. **A tool earns a head slot only if it changes what offload reads or shows; anything that acts on the thread goes in More.** `calendar` is the one scope control so far, so the head is at three and the next capability does not get a fourth by precedent, it gets the same test. The point of the original two-tool rule stands: **the head does not grow every time a thread gains a capability**, because most capabilities are actions.
- **Theme and text size are named rows at the foot of the nav, and a Settings page as well.** Both read the same stored value. An accessibility control behind an unlabelled glyph is not a control anybody can find.
- **Notes are rows, not chips.** A note is a sentence up to 200 characters, so `MemoryRow` sets it as one and the row grows to hold its own editor. A section holding none draws nothing at all, which means the first note on a thread comes from dumping something. **The row carries more since 014**: a date when the note has one, a mark that it has a longer body behind it, and a tertiary treatment for a note past the prompt budget, which is on the thread and not reaching offload.
- **Hiding by stacking order is not hiding.** Anything concealed only by an opaque sibling in front of it becomes visible during any group fade: a screen transition, a modal, a list animating in. Anything that must not appear carries its own opacity or is not mounted. `SwipeRow`'s reveal is the worked example, its opacity driven from the same value as its offset.
- **The bottom plate is a fixed shape** (30 September). A raised conversation covers it rather than changing it: the plate keeps its composer, its tabs slide down under the sheet with their opacity, and its prism band keeps its height. There is no folded row on it; a conversation is raised or closed. **The keyboard never changes its shape**: it covers the tabs first, and the plate rides it only once it reaches the composer. **The tabs fade as it rises**, to nothing over the keyboard's first 60pt, so no label is cut by its edge.
- **A raised conversation follows the finger** (30 September). It rises to 54px from the top with no header, only a grabber, and one shared position drives the sheet, the scrim, the tab bar and, on iOS, the page behind (scale 0.93 from its top edge, down 10px, a 14px corner, under a 45% scrim). **On Android the page does not recede**: it dims under a 55% scrim and stays put, and predictive back drives the sheet. A release past a quarter of its travel or a flick down closes it, springing from the finger's speed; anything less springs back. **Every sheet drags the same way**, and a drag is Cancel. A full predictive back swipe pulls a sheet down by 30% of its travel before the commit closes it. **A conversation put away for thirty minutes ends** on the next tap into the composer or the next dump, on every surface; the web keeps its close. Only the conversation dims or recedes the page for immersion. A thread keeps its tabs.
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
4. **No emoji at all.** 👀 marked a seen-but-unanswered message from 003 and was the only one in
   the product; it went on 16 September 2026, because the writing indicator already said it
   at the same moment. A seen message has no mark.
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
