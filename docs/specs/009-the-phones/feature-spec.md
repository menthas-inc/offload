# 009 The phones, feature spec

> The what and the why. No tech choices; those are in `impl-spec.md`.
> The full catalogue of what exists where is in `inventory.md`, which this does not repeat.

## Why

offload is a phone product that only works on a laptop.

Everything since 003 is web-only: the dump, the answer, threads, content, memories, widgets. The
phones have the gate and a first-run screen whose field does not submit. So the one thing the
product is for, getting something out of your head in the moment you have it, is available
everywhere except the device you have on you.

That is the reason to do it now rather than the reason it is urgent. The reason it is **now** is
narrower: the gap only ever widens. Four design-system entries written in the last week already
name the phones as owing something, and every web feature after this adds another. Porting
reasoning written a week ago is a different job from reconstructing it in three months.

## What

The phones get what the web has, in the shape their own kits draw, on iOS and Android.

**They are not the web narrower.** Three tabs on a bottom plate instead of two panes and a
sidebar. A thread that fills the screen instead of sitting beside a list. Swipes instead of
controls that appear on hover. A conversation that rises over the screen and folds away instead
of sitting inline. Where the kit and the web disagree about an interaction, the kit wins, because
it was drawn for the device.

**Where they disagree about a fact, the web wins**, because the fact was decided later: no
placeholder for a summary that does not exist, no trailing count on a thread row, headed groups
rather than a filter chip row.

### What ships

| | |
| --- | --- |
| **Shell** | Three tabs on the plate: Today, My threads, Memories. Everything else is a full-screen push. |
| **My threads** | Three groups, the older expander, swipe to delete. |
| **A thread** | Title, people, standing when there is one, widgets, To do, everything in here, archived. |
| **Thread memories** | The section 008 built, in a shape a phone can hold. |
| **The dump** | The composer, the conversation as a sheet that folds, the whole answer path including partial turns and Undo. |

### What does not

Attachments, sharing, notifications, settings, the person screen, the account-scope Memories tab,
and Today. Each is either unbuilt everywhere or scoped out below.

### The decisions this feature is built on

Taken with the product owner on 2026-09-05, recorded in full in `inventory.md`. Stated here
because they are the shape of the work rather than details inside it:

1. **The conversation is a sheet that folds**, as the kit draws it, not the web's inline turns.
2. **Attachments are out and their controls are not drawn.** A camera that does nothing is worse
   on a phone than absent.
3. **Row actions are swipes**, threads and content alike.
4. **Three tabs, and Memories is empty for now**, the way Today is. Present and honest beats
   hidden and reintroduced.
5. **A thread keeps the composer and loses the tabs.** The kit hides both; dumping from where you
   are is the product's core move.
6. **Widgets group, they do not filter.** One behaviour across three clients.
7. **The swipe deletes with no confirmation.** *Taken against the recommendation on this page: a
   swipe is easier to trigger by accident than a hover-revealed control, and a thread takes
   everything in it. The delete is soft and the toast holds it for eight seconds. Web keeps its
   inline confirmation, so the clients differ on purpose.*
8. **`widgets.ts` becomes a shared package.** A third hand-synced copy of the rule that decides
   what a thread looks like is a drift problem with a date on it.

### The keyboard is a feature, not a detail

**The kits cannot show one**, and this repo has already shipped a form sitting underneath it. The
fix ran against the usual advice, because this app is edge to edge and Android ignores
`adjustResize` outright.

Almost every screen here has a text field: the composer, the memory editor, renaming a thread.
Each one has a failure mode no mock can express, and the mock is the only artefact that exists.
So the keyboard gets acceptance criteria of its own rather than a line in a checklist, and a
device is in the loop from the first screen rather than at the end.

### One product, three clients, and what that has to mean

A person uses offload on a phone and a laptop, often about the same thread within the same hour.
What must be identical is **what is true**: the same threads, the same content, the same
memories, the same rules about who may delete what. What may differ is **how you reach it**: a
swipe here, a hover there.

The line matters because the tempting failures both cross it. Composing a meta string on the
client, which the Android kit does, makes the same thread read differently on two devices for no
reason. And forcing hover controls onto a phone because web has them makes a device worse to
honour a consistency nobody asked for.

## Acceptance criteria

**Both platforms**

- **AC-1** Every screen below exists on iOS and on Android, in that platform's own chrome and
  motion, from that platform's own kit. Android is verified on a device first, because that is
  where it is being used.
- **AC-2** Neither platform is the other with different colours. Where the two kits draw
  different rows, both are built as drawn.

**Shell**

- **AC-3** Three tabs on the plate: Today, My threads, Memories. **Today is unchanged**: it keeps
  the first-run screen it already has and is not rebuilt to satisfy this. **Memories** gets the
  honest empty state, in the kit's own words: *"What offload learns about you collects here.
  Nothing is learned yet."* My threads, when empty, uses the kit's other line: *"Threads appear
  here on their own, once there is enough in one place to be one."*
- **AC-3a** **The bell and the settings icons are not drawn.** Every tab screen in the kit puts
  them in the app bar and both destinations are out of scope, so drawing them is the same
  anti-pattern decision 2 rejects for the camera and the microphone. A control that does nothing
  is worse on a phone than absent. Logged as a kit divergence.
- **AC-4** Everything that is not a tab is a full-screen push with a back control, on that
  platform's own transition.
- **AC-5** Inside a thread the plate keeps the composer and drops the tabs, and the composer says
  "Add to this".

**My threads**

- **AC-6** Three groups, in the kit's order, with the "All N older threads" expander animating on
  height.
- **AC-7** A row carries its name, its meta and its icon, and **no trailing count**.
- **AC-8** The meta string comes from the server. No client composes it.
- **AC-9** Swiping a row **leaves** the thread, which deletes it only when nobody else is in it.
  The toast says which of the two happened, as web already does: "Thread deleted" or "You left
  the thread". *Decision 7's justification for skipping the confirmation, that a thread takes
  everything in it, is true of the first and false of the second, where nothing is destroyed and
  the other members are untouched.*
- **AC-10** Soft, straight to a toast with an eight second Undo, no confirmation step.
- **AC-10a** The default thread cannot be deleted, and swiping it says why rather than doing
  nothing: *"This thread can't be deleted. It's where things land by default."* Carried by a
  plain `Toast` with no action, since `Toast` holds one action and the Undo toast needs it.
- **AC-10b** Which thread that is comes from the server. `GET /v1/threads` already returns
  `isDefault` per row for exactly this, so the phone renders a fact rather than inferring one
  from a group or a name, which would be the client deciding an authorization question AC-34
  forbids.

**A thread**

- **AC-11** The name is a heading inside the scroll, not in the app bar.
- **AC-12** The standing block draws only when a summary exists. No placeholder.
- **AC-13** To do is real checkboxes with label and meta; ticking one is immediate and reversible.
- **AC-14** The list below the widgets is headed **"Everything else" when a widget has lifted
  anything out of it and "Everything in here" when nothing was**, per 007's AC-2. It is not a
  fixed string: it is the anti-duplication contract, and a build that always says one of them
  would pass a test written against the wrong one while showing content twice.
- **AC-14a** The kit's `See all` appears past three, and the screen behind it inherits 005's
  AC-6: cursor pagination, not fetching a thread to count it.
- **AC-15** Every action web offers on a content row is reachable on a phone. **Which gesture
  carries which action is the fifth open design-system question below, and this AC cannot be
  built until it is answered.** No kit draws a content row action on any platform, and web's set
  is authorship-conditional, edit and archive for any member but delete and move for the author
  alone, so the available actions differ row to row and a fixed gesture map would be wrong for
  half of them.
- **AC-15a** **`SwipeRow` reveals a delete and nothing else.** Its `trash-2` glyph and its
  `--clay-600` ground are written into the component; only the label is a prop, so a swipe
  labelled "Archive" would show a trash can. Either phone swipes carry delete alone and
  everything else goes in a sheet, or the contract grows an icon and a tone, which is a design
  system change with an entry rather than a local workaround.
- **AC-16** Archived content is reachable and is not deleted content. **No kit draws it on any
  platform**, and web invented a section-header toggle for it, so this is the sixth open design
  question rather than something to improvise twice.
- **AC-17** A section with nothing in it draws nothing, as on web.

**Thread memories**

- **AC-18** The section from 008, on the thread screen, holding up to ten.
- **AC-19** A memory can be added, edited in full, and either muted or deleted, one control not
  both, by the same rules the server enforces.
- **AC-20** A memory offload wrote is marked as inferred, with a text alternative rather than a
  glyph alone.
- **AC-21** In a shared thread a memory shows who wrote it.

**The dump**

- **AC-22** A dump sent from a phone is stored before anything else, so a resolved send means it
  is safe even if nothing ever answers.
- **AC-23** The answer arrives without the stream. The stream is an optimisation over asking, and
  the phones ship on the fallback.
- **AC-24** The conversation rises as a sheet with its own composer, folds to a header above the
  main composer, and comes back. Folding loses no turn, no draft **and no live Undo toast**: an
  eight second window that disappears because somebody tidied the screen is a window that was
  not really eight seconds.
- **AC-25** 👀 means offload has it. Done means offload **did** something, from the record rather
  than from the reply.
- **AC-26** A turn that filed something offers Undo for eight seconds. A turn that filed nothing
  does not.
- **AC-27** A partial turn says what landed and offers to finish, never to start again. **No kit
  draws a failed, partial or retry turn on either platform**: `LiveConversation` has only your
  turn, seen, done and the writing dots. This is as unmocked as the sheet and needs the same
  deliberate pass rather than an improvised one. The copy is *"Saved what landed. The rest didn't
  come through."* under a **Finish**, because the action resumes rather than restarts.
- **AC-28** Return makes a new line and the send button is the only submit, because there is no
  physical keyboard.

**The keyboard**

- **AC-29** With the keyboard up, on a device, on both platforms, **the composer** is visible and
  its field is not behind it.
- **AC-29c** On the three tabs the composer and the tab bar are in one plate, so the keyboard
  raises both. **The tab bar hides while typing rather than riding up glued under the field.**
  A thread screen sidesteps this by having no tab bar; the tabs do not, and the kit cannot show
  it.
- **AC-29a** The same for **the memory editor**, once the memory chip's open state is designed.
- **AC-29b** The same for **renaming a thread**. Renaming is a capability on web and the phone
  kit draws no affordance for it at all, so it enters scope here, in the `ellipsis` sheet.
  *Split into three because one compound criterion covering three surfaces cannot attribute a
  failure to any of them, and two of the three do not exist yet.*
- **AC-30** The conversation sheet and the plate move with the keyboard rather than being covered
  by it, and the fold still works with it up.
- **AC-31** Verified on Android specifically, where the app is edge to edge and `adjustResize` is
  ignored.

**When a thread goes while a turn is filing into it**

- **AC-31a** A person can swipe a thread away with no confirmation while a turn they just sent is
  still filing into that same thread, and the composer stays live on the thread screen saying
  "Add to this". This is ordinary use rather than a race: decision 7 removed the confirmation
  that would otherwise have slowed it down.
- **AC-31b** The tool call finds the thread gone and gets the one generic refusal, so the turn
  becomes partial rather than failing. **offload does not explain it**, per the design system:
  the reply says what landed, and the way forward is on the screen.
- **AC-31c** Undoing the delete inside its eight seconds and finishing the turn both work, in
  either order.

**Motion**

- **AC-31d** Reduced motion removes movement rather than shortening it, handled once rather than
  per component. This is the first client where that has to mean a shared animation config
  instead of one media query.

**Truthfulness and privacy**

- **AC-32** The session cookie is read from secure storage per request and is never logged, never
  in a URL, and never in a crash report.
- **AC-32a** It is stored **device-only**. `expo-secure-store` defaults to `WHEN_UNLOCKED`, which
  is the variant that migrates in an encrypted backup, and `@better-auth/expo` calls
  `setItemAsync` with no options, so today a session restored onto different hardware is a
  working session for the rest of its thirty days. The storage passed to the plugin pins
  `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`.
- **AC-32b** Signing out resets the navigation tree and in-memory state, not only the two stored
  keys. Once the phones hold threads, a second account signing in on a shared device must not see
  a frame of the first one's thread names before the first fetch resolves.
- **AC-33** No dumped text, thread name, content title or memory reaches a log, an analytics
  event or a crash report from the device (OFF-1).
- **AC-33a** That is enforced by one client logging module, not by everyone remembering. The
  server states OFF-1 in a comment and then enforces it with pino's redact list, and the phones
  get the equivalent: ids and outcomes only, no `console.*` outside it, and no crash reporter
  added before it exists. *React Native makes this harder than the browser: an unhandled
  rejection prints the whole error, a dev red box renders it, and a crash SDK's default
  breadcrumbs capture console output and network activity.*
- **AC-33b** **The app switcher does not show content.** Both platforms cache a screenshot of the
  last rendered screen when the app backgrounds, which is a composer full of dumped text or a
  thread's contents sitting in an OS cache. The root layout covers the screen when `AppState`
  leaves active. *A phone-only egress path with no web equivalent, so no earlier review has
  covered it.*
- **AC-34** Every authorization decision is the server's. The phones draw a control only when the
  server would allow it, and the server refuses regardless.
- **AC-34a** A screen never renders a title, a person or a preview from a navigation parameter.
  `expo-router` plus the registered `offload://` scheme make every screen this spec adds
  addressable by URI, and Android does not guarantee who owns a custom scheme. The screen waits
  for the server's answer, and a refusal is the same whether the thread does not exist or is
  somebody else's.

## Depends on

- **004** to **008** for everything the phones render. No new server work is expected.
- **Six** open design-system questions, which both clients need answered: the change mark, the
  memory chip's open state, authorship on a chip, `Chip` having no disabled state, **the content
  row's action gestures** (AC-15), and **archived content on a phone** (AC-16). The last two are
  new here and neither has a mark anywhere in any kit.

## Out of scope

- **Attachments.** Photos and voice notes, which the kit's composer draws in full. They need
  blobs, upload, R2 and transcription, none of which is built, and OFF-1 has questions about what
  a transcript is. Their own spec.
- **Sharing, notifications, settings, the person screen, the day agenda.** Drawn in the kits,
  unbuilt on every client. Not parity gaps.
- **The account-scope Memories tab.** Needs person scope, a `people` table and compaction.
- **Today.** Skipped on web deliberately; the phones keep the first-run screen they have.
- **`@` mention picking**, which the kit's composer has. Depends on the same missing `people`.
- **Push notifications**, offline queueing and background sync.
- **The web.** Nothing on this page changes it, with one exception named in AC-9's decision.

## Open

- **Whether the phones need their own answer to "somebody is typing into a thread that changed
  underneath them".** The web reloads the open thread when a turn touches it and marks what
  arrived. On a phone the conversation sheet covers the thread it is filing into, so the same
  problem has a different shape and the kit does not draw one.
