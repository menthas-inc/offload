# Handoff: offload, all surfaces

## Overview

offload is an AI assistant for organising thoughts and information day to day, alone or with
other people. You dump things in, offload does the filing. This package covers everything
designed for it: three consumer clients, an admin panel, a landing page and one transactional
email.

The repository `menthas-inc/offload_app` is live: a pnpm monorepo with the web app, the Expo
client, the Core API and the agent, the harness in `.claude/`, and this design system committed
at `.claude/skills/offload-design/`. Tokens are generated from it by `packages/tokens`, so a
token change here reaches every client by rerunning `pnpm tokens` rather than by anybody
retyping a value. Framework choices are made; `docs/tech/stack.md` holds them.

## About the design files

Everything in the design system project is a **design reference written in HTML and JSX for
the browser**. The kits are click-through prototypes showing intended look and behaviour.
They are not production code and they should not be lifted into the app.

The task is to recreate these designs in the target environment: React or similar for web and
admin, native or cross-platform for iOS and Android, whichever the codebase settles on. Carry
across the layout, spacing, type roles, copy, states, motion durations and prop contracts.
Build the components however the platform wants them built.

## Fidelity

**High fidelity.** Final colours, typography, spacing, copy and interaction behaviour. Recreate
the UI closely.

Two qualifications. First, the kits were designed from a written brand brief with no prior
product, no Figma file and no screenshots, so they are a considered proposal rather than a
record of shipped UI. Second, they are drawn at 100% text scale in light theme; the dark theme
and the text scaling rules are specified in `readme.md` but not demonstrated on every screen.

## Where the specification lives

This README is an index, not a restatement. The specification is already written and it is
better than a summary of itself would be.

| For | Read |
| --- | --- |
| Everything: voice, colour, type, spacing, motion, icons, accessibility, the closed brand decisions | `readme.md` at the project root |
| Token values | `tokens/`, via `styles.css` |
| A component's props | `components/<group>/<Name>.d.ts` and the sibling `.prompt.md` |
| A surface's screens, structure and motion | that kit's own `README.md` |
| Why something is the way it is | `explorations/`, 43 logs of what was considered and rejected |
| How to keep code and design in sync | `handoff/CONTRIBUTING.md` |
| What changed since | `decisions.md` |

Read `readme.md` first, in full. It is long because it is the whole system, and almost every
question that comes up during the build is answered somewhere in it.

## Screens

### Web app, `ui_kits/web_app/`

1440 wide. Sidebar, a stack of panes, one composer. Structure and the six pane rules are in the
kit README.

| Screen | Source | Purpose |
| --- | --- | --- |
| Sign in, refusal line, no invite, three tutorial screens | `WFirstRunGate.jsx` | Everything before the shell |
| Today, week strip | `WToday.jsx` | What needs you now |
| My threads, a thread, a task | `WThing.jsx` | Containers and their contents |
| Memories, one memory, all conversations | `WMemories.jsx` | What offload knows |
| Sidebar, composer and its expanded state, conversation turns, a person, ⌘K | `WMisc.jsx` | Shell furniture |
| Share modal, new connection, @ picker, pending and received invitations, quiet empty panes | `WSharing.jsx` | Sharing |
| Settings index and ten pages | `WSettings.jsx` | Two panes, index never leaves |
| Shell: pane stack, breadcrumb, composer, delete and undo, palette, calendar | `WApp.jsx` | State and routing |
| Layout vocabulary: `WPane`, `WPaneHead`, `WBody`, `WRow`, `WSection`, `WCrumbs`, `WTile` | `W.jsx` | Primitives specific to web |

### iOS, `ui_kits/mobile_app/`

390×844. Three tabs, screens push from the right.

| Screen | Source |
| --- | --- |
| Today / Tonight, time aware on real sunset | `TodayScreen.jsx` |
| My threads | `ThreadsScreen.jsx` |
| Memories, a memory, a conversation, all conversations | `MemoriesScreen.jsx` |
| A thread | `ThreadScreen.jsx` |
| Thread widgets: map, timeline, tag-filtered file grid | `ThreadWidgets.jsx` |
| A person | `PersonScreen.jsx` |
| Settings, and ten category pages from four row types | `SettingsScreen.jsx`, `SettingsDetail.jsx` |
| Share sheet, new connection, @ picker, pending strip, invitation screen | `Sharing.jsx` |
| Sign in, no invite, tutorial, day one empty states | `FirstRun.jsx` |
| Activity sheet | `NotificationSheet.jsx` |
| Agenda, with free time as a first-class row | `DayAgenda.jsx` |
| Live conversation, folded header, chat turns | `LiveConversation.jsx` |
| Composer: text, photo attachments, voice notes with waveform | `Composer.jsx` |
| Shell: tabs, routes, push transition, theme, undo | `App.jsx` |
| Device frame, cosmetic only, do not build | `Phone.jsx` |

Sunset is computed locally in `sun.js` using NOAA solar position, no network. Both mobile kits
load that one file. Port the calculation rather than substituting a fixed hour.

### Android, `ui_kits/android_app/`

360×800, Material 3. Same product, same `data.js`, same screens with an `M3` prefix. Platform
chrome only. The kit README lists every difference and it is a short list: navigation motion
(shared axis X at 300ms on emphasized decelerate), the navigation indicator, and Material's own
component chrome.

### Admin panel, `ui_kits/admin_web/`

1440. Moss sidebar so it is never mistaken for the app. Sidebar plus one pane, no pane stack,
one table at a time.

| Page | Role | What it does |
| --- | --- | --- |
| Waitlist | Support, Owner | Invite staff, bulk actions |
| People | Support, Owner | Disable and delete accounts, 30-day spend |
| Costs | Owner | Budget tracking grouped by job type, not by model |
| Limits | Owner | Daily and monthly caps, thresholds, and one decision about what happens at the cap: slow down, drop to the cheaper model, or stop |
| Staff | Owner | Add, switch role, remove, with self-protection rules |

Source: `AdminApp.jsx`, `A.jsx`, `AdminData.js`. Support does not see the Owner pages at all
rather than seeing them refused. There is always at least one Owner and nobody can edit
themselves out of the panel. Dumps are always still saved, whatever a cap does.

### Marketing, `ui_kits/marketing_site/`

`index.html` is the landing page with the waitlist. `invite-email.html` is the transactional
email shell, plain, no images. Tokens only, no app code.

## Interactions and behaviour

Per-surface motion tables are in each kit README. The system-wide rules are in `readme.md`
under Motion, and the short version:

- 140ms hover, press and colour. 200ms toggles. 280ms toasts and cards. 340ms sheets.
- `--ease-out` `cubic-bezier(.22,.85,.24,1)` for interaction, `--ease-entrance`
  `cubic-bezier(.16,1,.3,1)` for arrival.
- Things translate 8 to 14px and settle. Nothing bounces, overshoots, springs or spins,
  except the 720ms hairline spinner.
- Navigation motion belongs to the platform. Web slides a pane 260ms, Android uses shared axis
  X at 300ms, iOS pushes 350ms on `cubic-bezier(.32,.72,0,1)`.
- Reduced motion removes movement entirely rather than shortening it.
- One spinner, no skeletons, no progress bars, no shimmer.

## State

Both mobile kits and the web kit read the same `ui_kits/mobile_app/data.js`, so every string,
count and event is consistent across platforms. It is a useful shape to start the real data
model from, though it is a prototype fixture and not a schema.

Nothing leaves `data.js` on delete: it is a flag flip, which is what makes undo cheap. Worth
keeping in the real implementation, since undo has to hold for eight seconds and nothing may
be destroyed while the toast is up.

## Design tokens

`styles.css` is the entry point and contains `@import` lines only. Consume it directly rather
than transcribing values. Files: `fonts`, `colors`, `typography`, `spacing`, `radius`,
`elevation`, `motion`, `base`.

The values, for orientation only, are in `readme.md` under Visual foundations. Two things to
know before you touch them:

- Use semantic aliases, not ramps. `--text-accent`, never `--moss-600`.
- The `font:` shorthand resets `font-variant-numeric`. Any rule setting a composite type role
  must restate `font-variant-numeric: tabular-nums` or carry `data-numeric`.

`_adherence.oxlintrc.json` is the machine-readable version of the token rules. Wire it into
the lint step.

## Assets

- `assets/mark.svg`, `assets/mark-inverse.svg`, `assets/app-icon.svg`. Designed in this project
  in August 2026: a dot above an open vessel. One colour, no greys, no accent. Clear space
  equals the dot's diameter, 16px floor.
- The wordmark is live text, Instrument Sans 600 at `-0.03em`, always lowercase. Not an
  outlined file, so it depends on the typeface loading.
- `assets/icons/`, 80 Lucide glyphs vendored as SVG so the system works offline. Outline, 2px
  stroke, 24px grid, no fills, no colour. Rendered as a `currentColor` mask so a glyph inherits
  the colour of the text beside it.
- No photography, no illustration, no bespoke SVG. Imagery in the product is user content only,
  shown as-is in a 10px-radius thumbnail with no treatment.
- Instrument Sans and Literata from the Google CDN. Self-host via `tokens/fonts.css` when
  hosting matters.

## Design queue, answered 5 September 2026

All fifteen were decided off `explorations/design-queue.html`, which shows what the app does today
beside the options. Full reasoning per item is the 5 September entry in `decisions.md`. Two of these
are changes to code rather than to the kits, marked below.

| Owed | Answer |
| --- | --- |
| The memories section | Rows, not chips. `MemoryRow` is in the system |
| A memory, open | The row expands to hold its own editor |
| The archived toggle | A row at the foot of the list; the pane tool goes |
| A finished task | Tertiary ink, 1px strike, no opacity; past five, show five and "Show all" |
| Row tools | Conditional and absent, never refused; the fourth action goes behind More |
| The pane head | Two tools and a More menu holding rename, add memory and Leave |
| The swipe and the long press | Both kept. `RowActionSheet` is in the system |
| A React Native icon contract | `Glyph`, a second contract beside `Icon` |
| Filter or group in a widget | **Filter.** Grouping comes out of `Widgets.tsx` *(code change)* |
| A failed or half-finished turn | The turn itself carries it: clay border, one line beneath |
| The reply's thread links | Pills, and a single-thread turn drops the name from the sentence |
| Theme and text size | Named rows in the nav foot, plus a Settings page *(code change: label the glyphs)* |
| Leave versus Delete | Two words, the confirmation names the members, no warning banner |
| A row before its thread is settled | The word **filing**, in moss, in the thread's slot |
| What the share sheet does not say | **Still open.** Dropping the permission line contradicts a closed brand decision |

**What is built:** the two components, and every rule in `readme.md` under States, Vocabulary and the
platform notes. **What is not:** the kit screens. The thread page on three clients, the composer on web,
the nav foot and a Settings Appearance page, and the share sheet once the last item is settled.

## The prism field, added 2026-09-08

Colour on the phones, and the first decoration the system has allowed. A baked prism texture on two
surfaces only, inside the bottom plate and behind the sign-in lockup, held frozen until offload
files something. `handoff/APPLY-2026-09-08-prism.md` is the instruction set;
`explorations/prism-design.html` is the settled design; the 2026-09-08 entry in `decisions.md`
carries the reasoning, including the two contrast mistakes made on the way.

| Piece | Where |
| --- | --- |
| Component | `components/layout/PrismField.{jsx,d.ts,prompt.md}` |
| Card | `components/layout/prism.card.html` |
| Tokens | `tokens/atmosphere.css`, imported by `styles.css` |
| Textures | `assets/prism/p2-band-1.png`, `p2-bloom-1.png` (117KB and 90KB; the other 17 files in that folder are exploration records, not shipping assets) |
| Rules | `readme.md`, four bullets under the state and platform notes |
| Wired in | `App.jsx`, `M3App.jsx`, `FirstRun.jsx`, `M3FirstRun.jsx` |

Needs `@shopify/react-native-skia` on the phones. Light theme only until someone bakes a dark set:
every wash is a light tint chosen against paper and reads as fog on dark. **That bake is the one
thing this side still owes.**

## Dark theme: edges, added 2026-10-07

Dark separates by edges: stronger lines, a small step in the surfaces, and a 1px edge on every grouped list, well,
neutral chip and tint from six `--edge-*` tokens that are transparent in light. `pnpm tokens` carries the values;
`handoff/APPLY-2026-10-07-dark-contrast.md` lists the edge per file on all three surfaces,
`handoff/dark-contrast-standalone.html` is the reference, **Dark theme** then **Edges** in `readme.md` the lasting statement.

## Today: open in your threads, added 2026-10-07

Today's *If you have time* becomes **Open in your threads**: a page per thread with its undated to-dos, swiped on the
phones and two side by side on the web. `handoff/APPLY-2026-10-07-open-threads.md` is the build,
`handoff/home-thread-pages-standalone.html` the reference, **Today** in `readme.md` the lasting statement.

## The thinking row, added 2026-10-07

The conversation's working state becomes one row: the Splash drop, the model's phrase, and a Stop pill from ten
seconds. `handoff/APPLY-2026-10-07-thinking.md` is the build, `handoff/thinking-standalone.html` the reference,
`ui_kits/thinking_row/` the kit copy, **The thinking row** in `readme.md` the lasting statement.

## The Memories tab, added 2026-10-06

038's fast follow: a Memories tab on all three surfaces with a List | Map switch. `handoff/APPLY-2026-10-06-memories.md`
is the build order, `handoff/memories-standalone.html` the clickable reference (iOS / Android / Web),
`ui_kits/memories_tab/` the kit copy, and **The Memories tab** in `readme.md` the lasting statement. Code work:
six kinds become five, add and change on `store.ts`, and embeddings with a nightly layout for the map.

## Known drift in the design files

One item left, and it is deliberate.

**"space" survives in props and data keys.** The screen files are now `ThreadScreen.jsx`,
`ThreadsScreen.jsx`, `M3ThreadScreen.jsx` and `M3ThreadsScreen.jsx`, and their exported symbols
match. Below that, the prototype fixture still calls the collection `D.spaces`, passes it as a
`space` prop, and keys the second tab `"spaces"`. Renaming those in the kits means touching the
shared `data.js` that all three read, which risks the one thing the kits are for, which is
showing consistent content across platforms.

**Use thread everywhere when you build.** The data model is yours to name and it should be named
`thread` from the first commit: table, field, route, type, prop. Treat the fixture's key names as
prototype residue, not as a schema to inherit.

## Setting this up as a working loop

`handoff/CONTRIBUTING.md` is the working agreement and it belongs in the repository.

**Step one, before any code.** Download the whole design system project, not just this
`handoff/` folder, and commit it into the repository at:

```
.claude/skills/offload-design/
```

That is where Claude Code looks for project skills. The folder already carries a `SKILL.md`,
so once it is committed, Claude Code discovers the design system on its own and reads the real
tokens instead of working from memory. Committing it anywhere else still works as a reference,
it just stops being automatic.

Commit the whole tree, including `_ds_bundle.js`, `_ds_manifest.json` and
`_adherence.oxlintrc.json`. Those three are generated and must never be hand-edited, but they
should be in version control so a fresh clone has a working bundle and a working lint config.

Then: consume the real tokens rather than copying values, and when code has to diverge, code
wins and the change gets one entry in `decisions.md`.
