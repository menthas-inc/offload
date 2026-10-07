# Decision log

Append only. Newest first. Both the codebase and the design system write here.

Format and the meaning of each field: `handoff/CONTRIBUTING.md`.

When design and code disagree, **code leads**. A decision recorded here from the codebase is
the new truth, and the design system is updated to match on the next sync.

---

## Open

### 2026-10-07 · The landing page says no "things"
**Surface:** web, marketing site
**Raised by:** code, the repo sweep of 2026-10-07 (product lane), against CLAUDE.md's vocabulary.

**Was:** the landing story as the kit draws it: "one for each thing you are keeping track of", the kicker "Getting things in", and "Related things gather in one thread."

**Is:** "one for each trip, plan or job you are keeping track of", "Getting it in", and "What belongs together gathers in one thread." Nothing else on the page moved.

**Why:** in anything a person reads there is no noun for what they put in; the marketing site was the last place it was said.

**Design system impact:** `ui_kits/marketing_site/landing.js` and `explorations/landing-core.js`: the same three lines, reworded as above. `explorations/onboarding-screens.js`: "Related things gather in one thread." only.

### 2026-10-07 · Asked again: first run's last screen, alone
**Surface:** iOS, Android, web
**Raised by:** code, the repo sweep of 2026-10-07 (S20, the owner's call): when the privacy policy, the terms or the companies list moves, an account that agreed to an older version is asked again.

**Was:** no state for it. First run's last screen (the two consent ticks) was only ever reached from first run, and no kit draws the consent step at all (the 2026-09 entry's fourth first-run screen is still to draw).

**Is:**
- The same screen, alone: no carousel, no Bring it in, and the section head promoted to the page title.
- One line above the ticks says the terms or the privacy policy changed, linking both.
- A name is asked for on the same screen when the account has none, as first run does.
- A quiet secondary, *Take a copy or delete your account*, opens the account settings without agreeing first, because the terms promise both to someone who does not agree.
- The failure line under Continue is *That did not go through. Try again.* on both clients, shared, where the phones said *Check your connection and try again.*: the phone cannot tell a dropped connection from a refusal, and offload never diagnoses itself.

**Why:** the policy promised a notice before a material change and nothing gave one; asking in the app is the notice, and the screen people already agreed on is the one they recognise.

**Design system impact:** `ui_kits/mobile_app/FirstRun.jsx`, `android_app/M3FirstRun.jsx` and `web_app/WFirstRunGate.jsx`: the consent step, then its asked-again state with the title swap, the changed line with its two links, and the quiet secondary. The failure line's words wherever the kits draw it.

### 2026-10-07 · Memories speak to the person they are about
**Surface:** iOS, Android, web
**Raised by:** code, the repo sweep of 2026-10-07 (F4, the owner's call: rewrite on display, algorithmically, no model).

**Was:** an account memory read as stored, in the third person: *They are allergic to penicillin.*, shown to that same person.

**Is:** every account memory is shown in the second person on the list, the map's cards and labels, the editor and search: *You are allergic to penicillin.* The memory is still stored as the memory pass writes it, and an edit or a typed memory is saved back in that form, so a memory typed as *I'm allergic to penicillin.* shows as *You're allergic to penicillin.* too. A thread's notes are untouched. The object *them* is left as it is, since in these sentences it is usually somebody else.

**Why:** a person reading facts about themselves as if about someone else.

**Design system impact:** `ui_kits/memories_tab/memories.js` and the 2026-10-05 and 2026-10-06 entries' examples: every memory sentence in the second person.

### 2026-10-06 · The Memories tab as built
**Surface:** iOS, Android, web
**Raised by:** code, spec 040, building the tab from `ui_kits/memories_tab/` and `handoff/APPLY-2026-10-06-memories.md`, checked in the browser on the web and on an iOS simulator.

**Was:** the kit as drawn: a fixed world per shape (800x1500 and 1440x960) with hand-placed cloud centres and radii, a 300-unit column, sentences free to wrap, fainter sub-clouds for groups of meaning, swipe parking at 96, an empty state without the plus, a Memories count in the web sidebar.

**Is:**
- **The map's world is computed, not fixed, and reads as a network** (owner, 2026-10-07). Inside a kind, memories sit by meaning (t-SNE), clustered with air between, outliers pulled in, each sentence clear of the next; no columns. The kinds go where their memories' average sits in one map of them all, so kinds that talk alike are neighbours, stretched past the canvas's shape (down a phone, across the web) and kept a gap apart. The handoff's fixed centres and radii, and the 3-column grid of the first build, are gone.
- **A card on the map is as big as its sentence** (owner, 2026-10-07). One line up to about 16 ems, two up to about 36, more only for a truly long sentence; the width is the narrowest at which the words, wrapped where they break, fill those lines, so there is no dead space after the last word (`pillShape`, shared by the web, the phones and the nightly layout). Placement uses each card's own size, so short sentences sit close and the cards stagger instead of sharing rows. The whole sentence is the card's name and is in the editor.
- **No sub-clouds.** The nightly layout gives places, not groups, so nothing draws the fainter clouds for groups of meaning.
- **Every number the map moves by is shared** (`MAP_ZOOM`, `MAP_LOOK`): the wide threshold, the 0.18 fade, the cloud's reach, the label heights, flying into a kind, the zoom step, Everything.
- **The web map stops above the composer**, as a thread's map does (`--map-foot`), and has a column of its own so the list's scroll never moves it.
- **Swipe parks at the shipped 88**, not 96, with ThreadRow's 13px Forget.
- **Empty keeps the plus**, with *Nothing kept yet. Tell offload something to remember, or add it here.*; no switch and no search.
- **The cap line** sits under By kind and Newest, above the first section.
- **The web sidebar row has no count**: a count would read every memory on every page.
- **The web pane head carries three tools**, the List | Map switch, search and the plus, past `PaneHead`'s two: a thread's pane already puts its map switch there, and the switch is the one tool that changes what the pane shows.
- **A row's meta has two more forms**, *You added* for one typed in the tab and *You changed* for one changed there, matching the editor's lines.
- **Map marks off screen are not drawn on either surface**, so tabbing never lands on one nobody can see; the list holds everything and is the accessible view.
- **The editor** says the severing line under the field before Save, and a refusal in the same place in danger; a failed save keeps it open with the toast's Retry. The new memory's rule line is plain, not *rule* in bold.
- **The web's forget is a toast with Undo**, with no confirmation, where a thread's delete on the web is an inline confirm row (`panes/MyThreads.tsx`). A memory is one sentence and comes back with Undo; a thread is everything in it. (Logged 2026-10-07 by the sweep: 040's review listed it as logged and it was not.)
- **The List | Map switch draws `map`**, where 030's switch on a thread (`components/map/MapFrame.tsx`) draws `map-pin`. Two switches on the web now disagree; `map` is the one to keep, since the pane shows a map of meaning and not of places, and MapFrame is the one to change. (Logged 2026-10-07 by the sweep.)
- **On the phones** the title sizes (30 semibold, 24 regular on Android) are typed inline as other screens type them; Android's fills are the M3 container tokens Edit thread uses; the field focuses in `DragSheet`'s `onOpen`; the pan starts 24pt in from both side edges so the system's edge swipes stay the system's; marks far off screen are not drawn, as the kit culls them.
- **Dark** screens the ground (0.08) and the clouds (0.6) onto the paper instead of multiplying them (owner, 2026-10-06). On the phones the clouds come out fainter than on the web, and the kind labels' ink is mixed toward the light text. The owner judges the screenshots; the designer confirms or redraws.

**Why:** each one is a place the drawing met a real number of memories, a real keyboard, a real composer or a real touch system.

**Design system impact:** `ui_kits/memories_tab/memories.js`: `CLT`, `CLW` and `SUBT` give way to a computed world (`memoryWorld` with kind places and the canvas's aspect), memories placed as a network inside each cloud, each pill sized and clamped by `pillShape`, no sub-clouds, swipe at 88, the plus on the empty state, the cap line, the severing line; forget as a toast with Undo, no confirm; the List | Map switch glyph `map`, and 030's thread switch redrawn to match. `readme.md`, The Memories tab: the map's layout paragraph says the kinds are placed from their extent and a card takes one or two lines at its words' own width. A dark drawing of the map to confirm or replace the screen blend.

### 2026-10-06 · The Memories tab
**Surface:** iOS, Android, web
**Raised by:** 038's fast follow, decided with the product owner off `explorations/memories-v2.html` and `explorations/memories-proto.html`, read from `main` at `066aca5`. Handoff: `handoff/APPLY-2026-10-06-memories.md`.

**Was:** a Notes tab with nothing in it on the phones and a disabled Notes row in the web sidebar. Memories could only be seen by asking, in the export, or in a turn's reply (038's dated exception to OFF-1).

**Is:** **a Memories tab with a List | Map switch**, always opening on List. List: By kind or Newest, rows that open an editor sheet (text, kind, where it came from, Forget) and swipe to forget with Undo. Map: each kind a cloud of its colour, memories that mean similar things grouped inside it, zoom and pan; dots when far out, sentences from zoom 0.55 that grow with the zoom; off-screen kinds docked along the top. Tall layout on phones, wide on web, picked once when the map opens. **Five kinds:** their words folds into About, and no label says *their*. Typing a memory is new (origin stated); changing a learned one makes it yours.

**Considered and not taken:** B, filter chips and a review queue; C, a portrait grouped by subject (needed a subject per memory); D's drag between clouds and drop-to-forget vessel. Kind labels pinned to the screen edges, which collided.

**Design system impact:** `readme.md` gains **The Memories tab** and the vocabulary row for *memory* comes back (038). New kit `ui_kits/memories_tab/`. No new tokens: the kinds take `--label-2`, `--label-1`, `--label-6`, ink and `--label-5`. Code: a migration from six kinds to five, `prompts/memory.md`, add and change on `store.ts`, embeddings and a nightly layout for the map.

### 2026-10-05 · Have a code? on the sign-in screen, and review codes on the Waitlist page
**Surface:** iOS, Android, web, the sign-in screen and the no-invite screen; the admin panel's Waitlist and Limits pages
**Raised by:** code, spec 039, for going-public item 21: Apple and Google reviewers sign in with their own accounts and an emailed invite cannot reach them. Placement on the sign-in screen is the owner's, 2026-10-05.
**Was:** the sign-in screen had its two providers and the waitlist line. The no-invite screen had its two buttons and caption. The Waitlist page ended with its table and Notes.
**Is:** under the sign-in screen's waitlist line, *Have a code?* in the caption's accent. Tapped, it becomes a field at the providers' height (centred, capitals, *Your code*) above the two providers, and the code rides with whichever is picked. Not drawn when the *Review codes* switch is off. On the phones the screen now avoids the keyboard, as the waitlist screen does. A code that did not work ends on the no-invite screen with the gate's refusal block, *That code did not work.*, and the outlined button reads *Try another code*. The Waitlist page gains a *Review codes* section before Notes: *New code* opens the invite dialog's shape with Note, Uses (5) and Days (30); the new code is shown once in a bordered row with *Copy* and *Done*; the table is Note, Used (*2 of 5*), Expires, State (live, expired, used up, revoked) and *Revoke* on a live row behind a danger confirm. Limits gains the *Review codes* switch.
**Why:** a reviewer should sign in once, as anybody does. A quiet line keeps the screen the kit's for everybody else.
**Design system impact:** `web_app/WFirstRunGate.jsx` `WGate` invited branch, `mobile_app/FirstRun.jsx` `SignInScreen` and `android_app/M3FirstRun.jsx` `M3SignInScreen`: the *Have a code?* line under the terms and its open field above the providers. The no-invite screens on all three: the refusal block for a code and the *Try another code* label. `admin_web/APeople.jsx` `WaitlistPage`: the Review codes section between the table and Notes; `AOps.jsx` Limits: one more switch. No new token or component.

### 2026-10-05 · A loose to-do has its checkbox, and loose rows lose the meta line
**Surface:** iOS, Android, web, My threads' Not in a thread and its full list
**Raised by:** code, from the owner: a to-do outside any thread could not be ticked from the list.
**Was:** every row drew its type tile, a to-do included, and a meta line under the title, *To-do · Thursday*, the type's singular then when it was put down. The web had no way to tick a loose to-do at all; the phones only through a long press into the action sheet.
**Is:** a to-do leads with the thread page's checkbox in the tile's slot. Ticking takes the row out at the press with *Ticked off* and Undo, since the group holds no ticked to-dos and the box leaves with the row. No meta line on a live row; an archived row on the full list still says *archived 3 Oct*. The suggestion sits under the title.
**Why:** ticking is the thing people come to a to-do to do, and the meta line said twice what the tile already says, at the cost of a line per row.
**Design system impact:** `mobile_app/LooseParts.jsx` `LooseRow`: a `task` row draws the To do widget's checkbox in place of its tile, and the meta line goes; the web kit's `WThings` draws the same rows. 028's readme section on rows loses *Photo · Monday*.

### 2026-10-05 · The consent ticks accept the terms and name AI services from other companies
**Surface:** iOS, Android, web, first run's Before you start
**Raised by:** code, from the legal review of 2026-10-05 (Apple 5.1.2(i), and terms accepted by use rather than by a tick).
**Was:** *I have read the privacy policy.* and *I understand offload will hold whatever I dump in, which can include health, money and other private matters, and I agree to it being processed to run offload.*
**Is:** *I agree to the terms and have read the privacy policy.*, with both words linked, and the second tick ends *...processed to run offload, including by AI services from other companies.* Same two ticks, same layout, same server contract.
**Why:** Apple asks for explicit permission before personal data goes to third-party AI, and the old line did not say anyone outside offload received it. A tick is also what makes the terms bind; using the app alone often does not.
**Design system impact:** `explorations/onboarding-screens.js`: `CONSENT` gains `termsBefore` and `termsLink` before the policy link, `policyBefore` becomes " and have read the ", and `processing` gains the closing clause. No layout, token or component change.

### 2026-10-05 · Connected apps is the cards alone, and dark settings lift their edges
**Surface:** iOS, Android, web
**Raised by:** code, from the owner looking at settings in dark on the web.
**Was:** Connected apps had a summary under the title (*Calendar and Mail*) and a *Connected* section heading with the link tile over the two cards. The app cards and the Appearance tiles were ringed with `--border-hairline`; the Switch's off track was `--surface-fill-strong`. Signed in on listed every live session, so one phone that had signed in five times was five rows.
**Is:** the title, then the cards, no summary and no heading. Card and tile rings are `--border-lift`; the Switch's off track is `--border-lift` (the phones' `trackColor.false` and `ios_backgroundColor` too). Signed in on is one row per device description: *Since 4 Oct* for one session, *3 sessions since 5 Sept* for several, and End ends them all.
**Why:** the heading and summary repeated what the cards say. In dark the settings pane is `--surface-raised`, the same as the cards on it, so a hairline edge measured 1.15:1 and the cards dissolved; an off switch was a `#191919` knob on a `#2C2C2C` track on a `#212121` row and could not be seen. The lift is 1.82:1 there, and in light it is the hairline's own value, so light does not move. Sessions: there is no device id, every sign-in is a session, and nobody thinks in sessions.
**Design system impact:** `forms/Switch.jsx`: off track `--border-lift` in place of `--surface-fill-strong` (identical in light). `web_app/WSettings.jsx`, `mobile_app/SettingsDetail.jsx`, `android_app/M3SettingsDetail.jsx`: Connected apps drops its sub line and the *Connected* section head; app cards and choice tiles ring with `--border-lift`; the Signed in on rows are per device with the count in the note.

### 2026-10-04 · The landing page says what offload is
**Surface:** web, the landing page
**Raised by:** code, for Google's OAuth review of the Calendar scopes; decided with the product owner off `explorations/landing-scroll.html`. Handoff: `handoff/APPLY-2026-10-04-landing.md`.

**Was:** one screen: the cycling headline, one sentence, the field. No plain description of the product and no mention of Google Calendar, which is two of the four things the reviewer checks.

**Is:** **one scroll, direction C.** The hero as built plus a scroll mark; scrolling zooms into the mark until the prism fills the window; one frosted panel held still while four steps swap inside it (what offload is, the ways in, threads, Google Calendar with a link to `/privacy`); the waitlist again under the mark. Sticky header that goes solid, centred, once scrolled. A 3px progress bar along the bottom of the window. Copy verbatim in the handoff.

**Considered and not taken:** A, the pinned atmosphere behind plain rows (too close to a generic marketing page); B, a scroll-scrubbed onboarding on a pinned stage (kept for the drawings, which C reuses); D, the dot falling into the vessel with velocity colour split (long, and costly on a cheap phone). A step progress indicator inside the story, replaced by the page-wide bar.

**Design system impact:** `ui_kits/marketing_site/` rebuilt (`index.html`, new `landing.js`, `landing.css`); `readme.md` gains **The landing page**. No new tokens; the shader gains `hue` and `zm` uniforms.


### 2026-10-04 · The landing page, as built
**Surface:** web, the landing page
**Raised by:** code, building `handoff/APPLY-2026-10-04-landing.md`.
**Was:** the reference build in `ui_kits/marketing_site/`.
**Is:** the handoff, with these differences.
- **The two threads carry the glyphs the product picks from their names:** luggage for *Lisbon trip*, hammer for *Bookshelf build*. The kit drew lasso and bookmark, and bookmark is not one of the seventy.
- **The scroll mark goes to 95% of a window down,** where the panel has arrived with its first step. In the reference the story starts under the hero, so scrolling to its top goes nowhere.
- **Without JavaScript the story is a plain column:** the panel in the page's flow with its four steps one under another, every word showing. The pinned layout is switched on by the script that drives it.
- **On a phone a step packs to the top of the panel,** so a short step's drawing sits under its words and not at the bottom of a cell sized by the tallest step.
- **On a phone under 740px tall, step 01 draws two of the four dumps and no line between them and the threads,** so the panel fits one window. A panel taller than its window runs off the bottom, never up under the header.
- **The agenda's new row is `--surface-attention-soft` with the check in `--text-attention`,** the semantic names for the blue the reference took from the ramp. The faces are label hues 9, 5 and 10. The photo is the sand and blue washes.
- **The header's transition is `--duration-slow`,** 280ms where the handoff says 300.
- **A link in a step that is not showing brings its step in when it takes keyboard focus.**
- **The film draws at most thirty times a second while the page scrolls,** and ten at rest as before. The mark and its mask still move on every frame. The scroll position is written on the bar and the scroll mark, not the frame, where it restyled the whole page on every frame.

**Why:** each is either the product's own rule applied to the drawing (the seventy icons, semantic tokens over ramps), or something the reference could not show: a window that is not a frame, a reader with no JavaScript, a keyboard, a short phone.
**Design system impact:** `ui_kits/marketing_site/landing.js`: `THR` takes `luggage` and `hammer`; the cue's target is `0.95 * vh`. `landing.css`: `.ld.m .ld-cstep` gains `align-content: start`, and a short-phone rule hides `.ld-fv .arw` and the third and fourth `.ld-bub`. `handoff/APPLY-2026-10-04-landing.md` item 6 should say where the scroll mark goes.

### 2026-10-04 · Disconnect is on the calendar card, and the cards are one to a line
**Surface:** iOS, Android, web
**Raised by:** code, from the owner using Connected apps on the web.
**Was:** the Google Calendar card held *Calendars offload can use* and *Ask before adding*, and *Disconnect Google Calendar* was one level down, on the calendar page under the list. On the web the Calendar and Mail cards sat side by side from 280px each.
**Is:** the card carries *Disconnect Google Calendar* as its last row, in the danger colour, with the same note under it: *Notes offload made from your days stay. offload stops reading your calendars and cannot add to them.* With more than one account there is a row each, *Disconnect jo@hey.com*. It asks once: the row's own confirm on the web, the row action sheet on the phones. The calendar page keeps the list and *Ask before adding* and has no Disconnect. On the web each card takes a full line.
**Why:** the row that led to it is named for the list, which says what that page is for, and nobody looks behind it to disconnect. Side by side, the account line wrapped under the *Connected* pill and the rows broke into three lines each at the pane's usual width.
**Design system impact:** `web_app/WSettings.jsx`: the *Connected* block drops `cols`, so its cards stack, and the calendar card gains the Disconnect row. `mobile_app/SettingsDetail.jsx` and `android_app/M3SettingsDetail.jsx`: the same row on the card, and the calendar page loses it.

### 2026-10-04 · The row that opens Privacy says Privacy
**Surface:** iOS, Android, web
**Raised by:** code, from the review before going public, with the owner's answer.
**Was:** the Settings index row was *Reaching the web* with the `orbit` glyph, named by 016 when the page held two switches. 031 considered renaming it to Privacy and did not. 035 then put *Your copy* on that page and 036 put *Storage* there, so the only way to an export or to what is kept was a row about the web, and the privacy policy sends people to *Settings under Privacy*.
**Is:** the row is *Privacy* with the `lock` glyph, on all three. The page behind it is unchanged: titled *Privacy*, holding *Reaching the web*, *Storage* and *Your copy* as sections.
**Why:** the row has to name what is behind it, and three things are. This overturns 031's "not taken", which was right for the page as it stood that day.
**Design system impact:** none to draw: `web_app/WSettings.jsx` and both phone kits already have a *Privacy* row with `lock`. Readme **Settings**: the index row is *Privacy*; *Reaching the web* is a section on its page.

### 2026-10-04 · Somebody else's note opens to be read
**Surface:** iOS, Android, web
**Raised by:** code, from the security review before going public, with the owner's answer.
**Was:** any member of a thread could open any note and change its words. Delete and Move were already its author's alone.
**Is:** a note opens as before. Its author gets the editor. Anybody else gets the words in a field that cannot be typed in, no character count, no *Save*, *Mute* (or *Unmute*), and *Close* where *Cancel* was. On the phones the keyboard does not come up. A note whose author has gone from the thread is everybody's to edit, as it is to delete.
**Why:** what somebody typed is theirs, and overwriting it destroys it as surely as deleting it. The server refuses the edit, so the screen never offers one it would refuse.
**Design system impact:** the note editor in `web_app` and the note sheet in both phone kits gain a read state: field not editable, no count, no *Save*, the one way out is *Mute*, and the dismiss is *Close*. Readme **Notes**: editing is the author's.

### 2026-10-04 · The gate tells a disabled account it is disabled, and staff why they are signing in again
**Surface:** iOS, Android, web, admin
**Raised by:** code, from the review before going public, with the owner's answers.
**Was:** an account staff had disabled, or one in the day before its deletion, signed in and read *You are not on the list yet* with *Join the waitlist*, about an account that exists. And the admin panel opened on the app's own session.
**Is:** the no-invite screen has a third state: title *Your account is disabled*, line *jo@hey.com cannot sign in. Write to hello@offload.club about it.* (the address a mail link on the web), one button, *Use a different account*, and no waitlist, no invite caption. The admin panel asks for a sign-in made in the last ten minutes: staff without one land on the gate, which reads *Sign in again to open the admin panel.* where the invite line goes, and come back to the panel after. Two lines lose the retired noun: day-one Today on the web is *Dump anything and offload will sort it.*, the phones' wording, and the calendar card's line is *See your week in offload, and let it add to your calendar.* The audit page gains the phrase *Opened the panel*.
**Why:** the screen says what is true and where to go, next to the control that goes there. The first refusal was two false sentences and a button that did nothing.
**Design system impact:** `web_app/WFirstRunGate.jsx`, `mobile_app/FirstRun.jsx` and `android_app/M3FirstRun.jsx`: a disabled state on the no-invite screen, as above, and *Dump the first thing* becomes *Dump anything* in all three. The web gate's sub line has the admin variant. `admin_web`: nothing to draw; the panel has no locked screen of its own.

### 2026-10-04 · Storage is a section on Privacy, with its limit (036)
**Surface:** mobile, web, admin
**Raised by:** code, building the storage limit in 036 (`docs/specs/036-storage-limit/`), with the owner's answers and the client review.
**Was:** The phone kits draw a pressable *Files and photos, 128 MB* in *What offload keeps* on a *Memory and data* page that was never built (`mobile_app/SettingsDetail.jsx`, `android_app/M3SettingsDetail.jsx`). The web kit draws nothing.
**Is:** A *Storage* section on Privacy on all three, after *Reaching the web* and before *Your copy*, in 031's section format: the `image` glyph, heading *Storage*, caption *Deleting a photo makes room.*, one row *Photos and voice notes* with the value *312 MB of 1 GB*. Not pressable. The composer's refusal line at the limit is *Your storage is full.*, where *Enough for today.* goes. Admin: the cap is *Storage*, in megabytes, in its own group on Limits (*Per person, everything kept*) rather than under the 24 hour one, and a person's page shows it beside Files rather than under Today. And in the conversation: deleting a photo deletes its file, so a dump whose only photo is deleted leaves the conversation together with offload's reply under it, rather than drawing an empty bubble above a reply about something gone; a dump that had three photos draws two.
**Why:** Privacy is where 031 put what offload keeps and 035 put the copy of it, and *Memory and data* is retired vocabulary. The row names what is counted, says the limit it is measured against, and has nothing behind it to press: the owner chose deleting photos from a thread's Files as the way back for now, so a list is a later spec.
**Design system impact:** `mobile_app/SettingsDetail.jsx` and `android_app/M3SettingsDetail.jsx`: retire the *Files and photos* row with *Memory and data*, and draw the Storage section on Privacy beside *Your copy*. `web_app/WSettings.jsx`: the same section on Privacy. The composer kits gain the one line at the limit. The conversation kits: a dump whose photos are all deleted is not drawn, and neither is its reply. `ui_kits/admin_web`: a *Storage* cap in megabytes, in its own group on Limits, beside Files on a person's page.

### 2026-10-04 · Thread icons, as built (037)
**Surface:** iOS, Android, web
**Raised by:** code, building *Every thread has a mark* (`handoff/APPLY-2026-10-03-thread-marks.md`) as 037, with the owner's answers of 4 October and the client review.
**Was:** the handoff: offload picks by the word list alone, a rename with no match falls back to `lasso`, the seed is the thread's id, the pill is 26 everywhere, Move suggestions draw the mark at 24, the picker's grid fades out over its last 15%, and the phones' sheet runs from 150px below the top.
**Is:** built as drawn, with these differences.
- **The model may name the icon** when it creates a thread, from the same seventy; the word list is the fallback and picks for threads a person makes. Owner, 2026-10-04.
- **A rename with no match keeps the icon it has.** The icon may be the model's, and *Lisbon* becoming *Lisbon 2027* is no reason to lose it.
- **The seed is the last eight hex digits of the id.** The ids are v7 and lead with their timestamp, so the head is the same for threads made together.
- **The pill in a turn's footer stays 30**, where every mark in that row is 30; Today's grows to 26. The icon in both is 18.
- **A Move to suggestion's chip draws the icon at 16**: the chip is one line of 13px text. The Move picker's rows are 24.
- **Places the handoff's table did not list:** the web sidebar's thread rows at 20, the web's crumbs at 18 as a circle, the composer's *In thread* chip on the phones at 18, the list in People's remove confirmation at 24.
- **The phones' grid has no fade**: there is no gradient or mask library in the app. It scrolls on its own inside its well.
- **The phones' thread row is centred**, not top-aligned, so a name with no line under it sits against the middle of the icon (owner, on a device, 2026-10-04).
- **The phones' Edit thread sheet is as tall as its contents**, not pinned 150 below the top: the space under the colours was empty (owner, on the Pixel, 2026-10-04).
- The component is `ThreadIcon` on both clients, as the handoff asks. Picked states use `--text-primary` on the web for the ink ring, which follows the theme.
**Why:** each is above.
**Design system impact:** `readme.md` **Thread marks**: the pick rule (the model's pick, keep on no match), the seed, the two pill heights, the 16 in a suggestion chip, and the extra places. `handoff/thread-marks-standalone.html` if it is kept as the reference. No token changes.

### 2026-10-04 · The 034 answers, pulled
**Surface:** admin, iOS, Android, web
**Raised by:** code, pulling *The 034 asks, answered* (`handoff/APPLY-2026-10-03-admin-034.md`).
**Was:** the admin's destructive confirm drew its clay from `--text-danger` with a mixed hover, the plot area was a literal 96px, and the solid destructive fills on the web and the phones named `--clay-600`.
**Is:** `--surface-danger`, `--surface-danger-hover` and `--plot-height` are in the tokens and in use: the admin's `.dangerSolid` and `.plotArea`, the web's destructive buttons (thread delete, the viewer's delete, People's remove), and on the phones the delete-account button, the confirm sheet's danger button, the label delete pill and the swipe-to-delete ground on rows. The unread dots stay `--clay-600`: they are a mark, not a danger surface. The phones' on-solid scan counts `bg-surface-danger` as a fixed fill.
**Why:** one alias for one meaning, and the dark value can now move in one place.
**Design system impact:** none. The 24 entries ending *(034)* are closed by this one. Still the owner's: the dark value of `--surface-danger`.

### 2026-10-03 · The 034 asks, answered
**Surface:** admin, and the solid danger fill on all three
**Raised by:** the design system, answering the 24 entries above ending in *(034)*, read from `main` at `963d7a2`. Overview: `explorations/coder-asks-034.html`. Handoff: `handoff/APPLY-2026-10-03-admin-034.md`.

**Was:** the admin kit drew the panel before 034: pounds, five pages, a cap behaviour choice, Warn at, a recipients list, Discard, a grey-until-hover Delete for anyone, moss bars, eight-second toasts with the app's Undo. No solid danger token and no plot height token.

**Is:** every one taken as built. The kit is redrawn: nine pages in two nav blocks, dollars, grouped Limits with switches and an old-to-new confirm, the 24-hour delete hold, a person's page, a deleted account's page, Health, Costs with plots by model and vendor, Audit, ink plots with a range, sideways-scrolling tables, a four-second toast with no Undo. **`--surface-danger`** (clay 600 in both themes, white text at 5.4:1) and **`--surface-danger-hover`** land in every scope; **`--plot-height: 96px`** lands in spacing.

**Open:** the dark value of `--surface-danger`, clay 600 (in) or the salmon `--text-danger` with dark text; the owner's call.

**Design system impact:** `tokens/colors.css`, `tokens/spacing.css`, `ui_kits/admin_web/` (two new files, `APeople.jsx` and `AOps.jsx`).

### 2026-10-03 · Every thread has a mark
**Surface:** iOS, Android, web
**Raised by:** the product owner, off `explorations/thread-marks.html` and `explorations/thread-marks-v2.html`. Handoff: `handoff/APPLY-2026-10-03-thread-marks.md`.

**Was:** every thread drawn with the same `lasso`, in My threads, pills, answers and the Move picker; past five threads the only way to find one was to read every title. The app bar had the name and no mark. Renaming was its own sheet.

**Is:** **a Lucide glyph on a wash of one of the ten label hues per thread**, picked by offload from words in the name (no model call), changeable by anyone in the thread. The wash is `oil-ground` in luminosity blend over the hue. **Seventy glyphs**, one scrolling grid, no groups. **Edit thread** joins rename, icon and colour in one sheet, opened from the mark or the name in the bar. The bar is otherwise as built: no heading in the scroll.

**Considered and not taken:** Fluent Emoji Flat (MIT, recognisable, but against the no-emoji and no-colour-icon rules, and loud beside label colours); colour only (fails past ten threads and for colour blindness); OpenMoji (share-alike) and Twemoji (attribution); the phones' own emoji (different on every OS); a suggestions row and glyph groups in the picker; a model call to pick.

**Design system impact:** 59 Lucide glyphs vendored, 154 in all. `readme.md` gains **Thread marks**, and Iconography names the thread mark as the one coloured glyph. No new tokens: the hues are `--label-1` to `--label-10`.

### 2026-10-03 · The admin panel counts money in dollars (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** Pounds throughout the admin kit.
**Is:** Dollars, to the cent, on every page that shows money.
**Why:** The ledger prices calls in dollars and every vendor bills in them.
**Design system impact:** `ui_kits/admin_web/AdminApp.jsx` and `AdminData.js`: the currency sign and the `money` helper.

### 2026-10-03 · The weekly batch is 25 (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** The kit's Waitlist and Limits show a batch of 20.
**Is:** 25, read from the `waitlist.batch` setting, editable on Limits.
**Why:** It is what 002 shipped and what the owner uses.
**Design system impact:** `ui_kits/admin_web/AdminApp.jsx`: the batch figure on Waitlist and Limits.

### 2026-10-03 · Caps are a rolling 24 hours (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** Limits says caps reset at midnight.
**Is:** Every per-person cap is measured over the last 24 hours, rolling. The person's page labels its Today section *the last 24 hours, rolling*.
**Why:** That is how the caps have worked since they were built; midnight would need a time zone per account.
**Design system impact:** `ui_kits/admin_web/AdminApp.jsx`: the Limits section note and any *resets at midnight* line.

### 2026-10-03 · A cap means stop, and nothing else (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** Limits offers *When a cap is reached* with a choice of behaviours.
**Is:** The control is gone. The next turn is refused and what was already dumped is safe.
**Why:** Owner's decision: one behaviour, so support never has to ask which one an account had.
**Design system impact:** `ui_kits/admin_web/AdminApp.jsx`: remove the *When a cap is reached* block from Limits.

### 2026-10-03 · Warn at is gone (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** Limits has a *Warn at* percentage per cap.
**Is:** No warning threshold. Alerts are conditions on Health, not percentages on Limits.
**Why:** Nobody was going to act on a warning that a single account was near a cap.
**Design system impact:** `ui_kits/admin_web/AdminApp.jsx`: remove *Warn at* from Limits.

### 2026-10-03 · A monthly budget replaces the per-person monthly cap (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** Limits has a per-person monthly spend cap.
**Is:** One figure for the platform, the monthly budget, which Costs draws spend against. The per-person spend cap is the daily one.
**Why:** A per-person month is a second window over the same money and the owner wanted one number to watch.
**Design system impact:** `ui_kits/admin_web/AdminApp.jsx`: Limits loses the per-person monthly cap and gains *Monthly budget*; Costs draws against it.

### 2026-10-03 · Alerts go to every owner (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** Limits has an editable list of alert recipients and a Slack target.
**Is:** No list and no Slack. Every owner gets the email. At most ten condition alerts a day; staff and deletion alerts are never counted.
**Why:** A list is one more thing to keep right, and the people who must know are exactly the owners.
**Design system impact:** `ui_kits/admin_web/AdminApp.jsx`: remove the recipients block and the Slack row from Limits.

### 2026-10-03 · Limits gains switches, photo bytes and voice minutes, in grouped sections (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** One list of numeric caps.
**Is:** Groups, each under its own label: per person in any 24 hours (spend, turns, photos, photo megabytes, voice notes, voice minutes, mail), the platform in any 24 hours (the cap that refuses everyone), the month (the budget, and what each subscription costs, typed by an owner), the waitlist (the batch), and switches, where off stops a path for everyone within seconds. Bytes are typed in MB and milliseconds in minutes.
**Why:** The settings that exist are more than the kit drew, and one flat list of fifteen fields hid which ones stop everybody.
**Design system impact:** `ui_kits/admin_web/AdminApp.jsx`: the Limits page regrouped into these sections, with a switch row and an affixed field (`$`, `MB`, `min`) in `A.jsx`.

### 2026-10-03 · Saving Limits shows old to new, and Discard is Cancel (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** Save writes at once; the other button is *Discard*.
**Is:** Save opens the confirm dialog listing each change as *old to new* in words. If somebody else changed a value meanwhile the save is refused, the page reads again and says so. The other button is *Cancel*.
**Why:** A cap changed by a typo refuses real people, and two owners can be on the page at once.
**Design system impact:** `A.jsx`: a `Diff` list inside `AConfirm`. `ui_kits/admin_web/AdminApp.jsx`: *Discard* becomes *Cancel*.

### 2026-10-03 · What has been hit: a count and a scope, not What we did (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** The hits table has a *What we did* column.
**Is:** Day, cap, whose (theirs or the platform's), and how many times. No *What we did*.
**Why:** There is one behaviour now, so the column would say *stopped* on every row.
**Design system impact:** `ui_kits/admin_web/AdminApp.jsx`: the hits table's columns.

### 2026-10-03 · Delete is owner only, held for 24 hours, and can be cancelled (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** Any staff member sees Delete on a People row. The dialog says *their memories* and *inside 24 hours and cannot be undone*, and the row disappears at once.
**Is:** Only an owner is sent the action, as an outline clay button last in the row and last on a person's page. The dialog is the kit's `AConfirm danger` with the address typed back and *Delete account*; its body says *its threads, its notes and every conversation*, that they are signed out now, that it is destroyed in 24 hours and that until then an owner can cancel. After confirming, the account is disabled, the row stays, its pill reads *deleting*, the line under the name says *To be deleted 4 Oct, 14:05*, and the only action is *Cancel deletion*, a small secondary button with no dialog, which leaves the account disabled. Toasts: *Ana will be deleted in 24 hours*, *Deletion cancelled. Ana stays disabled*. A refusal is one clause: *Not deleted. That account is the last owner*. The notes under the table say what Delete does and that the address gets one email once the account is destroyed.
**Why:** Owner's decision: the hold is the undo for the one action in the panel that destroys something, and memory was retired as a word on 2026-09-10.
**Design system impact:** `ui_kits/admin_web/AdminApp.jsx`: Delete drawn for owners only, the dialog body, the *deleting* row state with *Cancel deletion*, the two toasts and the notes list. `AdminData.js`: a marked account in the fixture.

### 2026-10-03 · A deleted account's page (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** Not drawn.
**Is:** Under the *People* back link: the title *Deleted account*, one line, *This account was deleted on 12 September 2026.*, and for an owner a three column table of its audit entries (when, who, what). No name, no address, no sections, no actions. An id that was never an account still says *Nobody here.*
**Why:** A link from the audit log or a bookmark should say what happened and nothing about who it was.
**Design system impact:** A new state for the person page in the admin kit: head, one line, audit table.

### 2026-10-03 · People rows open a person's page, gain Joined, and can be sorted (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** A People row is not a link and has no Joined column.
**Is:** The whole row opens the person's page; its buttons act without opening it. Columns gain *Joined*. A *Sort* choice (joined, last active, spend) sits above the table, and a sorted list says when it is only the top 200.
**Why:** Troubleshooting starts from one account, and the list is the way to it.
**Design system impact:** `ui_kits/admin_web/AdminApp.jsx`: the People table's columns and the row as a link; `A.jsx`: `ARow` with an `href`.

### 2026-10-03 · Waitlist gains invite by address, and Remove (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** Waitlist invites from the list only, and a row cannot be removed.
**Is:** An *Invite somebody* field takes an address that is not on the list. Each waiting row has *Remove*, an outline clay button that is clay at rest, behind the confirm dialog. The stats row the kit draws is there: waiting, invited this week, signed up, weekly batch.
**Why:** The owner invites people who never joined the list, and a mistyped or unwanted address had no way out. Clay at rest is the owner's ask, so Remove reads as destructive before the pointer is on it.
**Design system impact:** `ui_kits/admin_web/AdminApp.jsx`: the invite field and the Remove action on Waitlist. `A.jsx`: `ADanger` is clay at rest, not grey until hover.

### 2026-10-03 · Staff: any address that has signed in once, no Name field, no email on adding (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** The add dialog asks for a name and an address and implies an email is sent.
**Is:** The dialog asks for an address and a role. The address must belong to an account that has signed in. Nothing is emailed to the person; every owner is told.
**Why:** The name comes from the account, and staff is a role on an account, not an invitation.
**Design system impact:** `ui_kits/admin_web/AdminApp.jsx`: the Staff add dialog loses *Name* and its line about an email.

### 2026-10-03 · Costs gains trends, usage, by model and by vendor (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** Costs is a stats row and a by-feature table, with the row *Memories*.
**Is:** Costs adds a cost per day plot, usage per day, a table by model, and a table by vendor that sets what the ledger metered beside what the vendor billed or what an owner typed as a subscription. The sub line says the range. The row *Memories* is *Notes*. *Export CSV* is a plain secondary button with no icon.
**Why:** Owner's ask: see where the money goes and whether it matches the bill. The icon set has no plain download glyph.
**Design system impact:** `ui_kits/admin_web/AdminApp.jsx`: the Costs page's new sections, the *Notes* row, and Export CSV without an icon.

### 2026-10-03 · A person's page, Health, Audit and overrides are new (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** No mock.
**Is:** Built from the `A.jsx` vocabulary. A person: who, today against each cap, limits with a per-person override (owner), cost and activity plots, counts of what they have, what happened (jobs, eight columns: the error code sits under the kind and the tokens under the model), limit hits. Health: services with uptime and incidents, the queue, scheduled jobs each with its own page, stuck and dead jobs with Retry and Dismiss, model calls, vendors, backups. Audit: every staff write, newest first, filtered by staff member, kind and person.
**Why:** Owner's ask; support needs one account's story with nothing the person wrote on it.
**Design system impact:** Three new pages and the override dialog for the admin kit, drawn from the build.

### 2026-10-03 · The roles are redrawn (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** Owner pages are the ones about money.
**Is:** Support sees Waitlist, People and a person's page. Owners also see Health, Costs, Limits, Staff and Audit, open on Health, and are the only ones sent Delete, overrides and the audit entries of a deleted account. A page a role cannot open is not in the navigation and answers as not found.
**Why:** Access to people, not only money, is what needs the higher role.
**Design system impact:** `ui_kits/admin_web/AdminApp.jsx`: the navigation's owner group and its label.

### 2026-10-03 · Plots are ink, one series each (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** The kit's bars are moss.
**Is:** Every plot is one series in the text colour on the page surface, with a range picker of 24 hours, 7, 30 and 90 days kept in the address. Small multiples, two across, for a person's activity.
**Why:** Moss is the navigation and the primary action in the panel; a plot in it read as something to press.
**Design system impact:** `A.jsx`: the plot colour, and a `--plot-height` token is requested (the build holds the height in the admin stylesheet until it lands).

### 2026-10-03 · The panel is pinned light (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** The kit follows the theme.
**Is:** The admin panel is light whatever the system says.
**Why:** It is a work surface read beside spreadsheets and vendor dashboards, and one theme halves what has to be checked.
**Design system impact:** The admin kit's README: say light only.

### 2026-10-03 · No eight-second Undo in the panel (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** The product's toast carries Undo for eight seconds.
**Is:** The panel's toast is four seconds and has no Undo. Anything that cannot be quietly reversed asks first in the confirm dialog, which holds the keyboard while open.
**Why:** Staff act on purpose; the confirmation is the safety net and an Undo on an email already sent would be a lie.
**Design system impact:** `A.jsx`: the toast's duration and the absence of Undo, stated in the README.

### 2026-10-03 · The confirm pill is for a bulk selection only, and section labels are the kit's (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** Built in 002 and unlogged: a floating confirm pill, and section labels of the build's own.
**Is:** The floating pill appears only while rows are selected on Waitlist. Every other confirmation is the dialog. Section labels are `ASection`'s.
**Why:** One way to confirm one thing; the pill is right only where the count is the subject.
**Design system impact:** none.

### 2026-10-03 · An admin table scrolls sideways before it crushes a column (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** Tables shrink with the pane.
**Is:** A row has a least width: its fixed columns plus 140px for each open one. Below that the table scrolls sideways.
**Why:** At 1280 the open column of an eight column table went to nothing.
**Design system impact:** `A.jsx`: `ATable` gains the least width and the sideways scroll.

### 2026-10-03 · A solid danger surface is requested (034)
**Surface:** admin
**Raised by:** code, building the admin panel in 034 (`docs/specs/034-admin/`), with the owner's answers and the client review.
**Was:** There is `--surface-danger-soft` and `--text-danger`, and no solid clay surface.
**Is:** The confirm button of a destructive dialog is solid clay, the only solid clay anywhere. The build draws it from `--text-danger` in one class, `.dangerSolid`, until a token exists.
**Why:** The kit's `AConfirm danger` is solid and there was no alias to draw it with.
**Design system impact:** Add `--surface-danger` (and its hover) to `tokens/colors.css` in every scope; the build then swaps one class.

### 2026-10-03 · Your copy, as built (035)
**Surface:** iOS, Android, web
**Raised by:** code, building the export in 035 part B (`docs/specs/035-account-deletion-and-export/`), with the owner's answers of the same day and the client review.

**Was:** one row, *Export everything*, note *A single file, readable without offload.* On the phones it sits on a page that was never built (`SettingsDetail.jsx`, `M3SettingsDetail.jsx`); the web kit already has it on Privacy, as a plain `SBlock` titled *Your copy* (`WSettings.jsx`). No state after the tap is drawn anywhere.

**Is:**
- **A section on the Privacy page, under *Reaching the web***, in 031's format: glyph tile, heading *Your copy*, caption *Kept for 7 days. One every 7 days.* The glyph is `archive`: the set has no plain `download`, and `cloud-download` says the wrong thing about where the file comes from.
- **One row whose words change with the copy's state**, the same words on all three, from one shared rule (`copyRow` in `@offload/widgets`):
  - none: *Export everything*, note *One file, readable without offload.*, outline pill *Export*;
  - being made: *Making your copy* and the one spinner where the pill was, nothing to press, no skeleton;
  - ready: *Ready, 3 Oct*, note *Kept until 10 Oct*, pill *Download*, and under it a second row, *Delete copy*, medium weight with no pill and no chevron;
  - failed: *Couldn't make your copy*, pill *Try again*, no reason;
  - deleted inside the 7 days: *Next copy from 10 Oct*, nothing to press.
- **The pill is 031's outline pill for a row that acts in place**, not the kit's chevron: nothing opens.
- **A press that did not go through is the page's toast with Retry**: *Couldn't start your copy*, *Couldn't download your copy*, *Couldn't delete your copy*.
- **The web's Download is a plain link in a new tab**, since the file is on the API's origin, and the row is read again when the window is come back to. The phones download with the spinner on the row, then iOS raises the system's share sheet, which has Save to Files, and Android raises the system's folder picker: its share sheet offers people and apps and nowhere on the phone.
- **The web's spinner in a row** is the pane spinner's ring at the row's trailing edge (`.settingsSpinner`), while a copy is being made and while a press is in flight; the row's words are its status.
- **A session that ended under the page goes to sign in**, with no retry.
- **The delete confirmation gains *Make a copy first***, a text link under the body on all three, `--text-accent` on iOS and the web and the Android scope's blue on Android, at the tap floor, which leaves the confirmation for the Privacy page.
- **Activity gains a kind**, *Your copy is ready*, with the `archive` glyph and no *Not sent* tag; it opens the Privacy page.

**Design system impact:** `SettingsDetail.jsx`, `M3SettingsDetail.jsx`: the *Export everything* row moves to Privacy as the *Your copy* section. `WSettings.jsx`: the existing *Your copy* block gains the glyph tile and the caption. All three draw the five states. A row with a trailing spinner in place of its pill is a state the settings `Row` should describe on the web as it does on the phones. The delete confirmation's mock gains the *Make a copy first* link. The Activity kit gains the row. Icons: `archive` for the section and the Activity row; a plain `download` would be the better glyph and is not in the set.

### 2026-10-03 · Delete your account, as built (035)
**Surface:** iOS, Android, web
**Raised by:** code, building account deletion in 035 (`docs/specs/035-account-deletion-and-export/`), with the owner's answers of the same day and the client review.

**Was:** `ui_kits/web_app/WSettings.jsx` draws `SDanger` at the foot of Account: label *Delete your account*, body *Everything offload keeps goes with it, on every device. There is no undo for this one.*, action *Delete everything*, on `--clay-100` with a `--clay-600` button at `--radius-sm`. No confirmation is drawn anywhere.

**Is:**
- **The panel is in semantic tokens**: `--surface-danger-soft`, `--border-danger`, `--text-danger`, where the kit uses the clay ramps. It carries no heading of its own, as in the kit.
- **The copy has no noun**: body *Everything only you can see goes with it. There's no undo.*, action *Delete account*. "Everything offload keeps" was untrue: what was added to a shared thread stays.
- **The action is the people modal's danger pill**, the one Remove, Block and Take out use, not a third button shape at `--radius-sm`.
- **The confirmation is the people `Modal`** with one addition, a field: title *Delete your account*, a body that says what goes and what stays, the field *Type delete to confirm*, Cancel and *Delete account*. The button is disabled until the word matches, trimmed and whatever its case; the field does not capitalise, correct or spell-check.
- **States**: in flight the button reads *Deleting* and the dialog cannot be dismissed; a failure is *Couldn't delete your account* in `--text-danger` with the button reading *Try again*; the last staff owner sees *Hand offload's ownership to someone else first.* with Close and no destructive button.
- **After**: the sign-in card shows *Your account is deleted.* where the invite line is, in `--text-secondary`, not as a refusal.
- **A public page, `/delete-account`**, in the privacy page's frame: How, What goes, What stays, If you can't sign in. No field of any kind.
- **The instruction sits above the field, not in it**, on all three: *Type delete to confirm* as a caption in `--text-secondary`. A placeholder is gone at the first keystroke and it was the only line naming the word.
- **The web panel carries the shared threads sentence too**, ahead of its own line, in the same paragraph. The panel body is at full opacity where the kit's `SDanger` draws it at .85: at .85 `--text-danger` on `--surface-danger-soft` fails contrast.
- **The phones' sheet cannot be closed while the delete is in flight**: `DragSheet` takes `locked`, which stops the scrim, the grabber, the drag and Android's back. With a screen reader on, the field does not take the focus as the sheet rises, so the sentence is heard first.
- **About on the phones gains *Terms*** above *Privacy policy*, as the web's Help did.
- **On the phones the kit's *Ending things* is a last group on My account**, after Sign out, with no heading: *Shared threads* with its note, then *Delete account* with its title in `--text-danger` and no chevron. Sign out stays where 031 put it. Both notes lose the kit's noun: *A shared thread belongs to everyone in it. Deleting your account takes away your access and what only you could see, and leaves what you added with the others.* and *Everything only you can see goes with it. There's no undo.*
- **The phones' confirmation is a `DragSheet` that lifts with the keyboard**: the same title, body, field and states as the web, Cancel and the destructive pill at the foot in `SheetFoot`'s shape, the pill on `--clay-600` with `--text-on-solid`, as the row's swipe-to-delete ground is. The field takes the focus as the sheet rises. In flight the pill carries the one spinner and reads *Deleting*.
- **After, the phones' sign-in screen says *Your account is deleted.*** in place of *Sign in to start.*, once.

**Design system impact:** `WSettings.jsx` `SDanger`: semantic tokens, the copy above, the pill. A confirmation with a typed word is a new pattern the kits should draw once, on the web modal and on both phones' sheets, with its in-flight and failed states. `SettingsDetail.jsx` and `M3SettingsDetail.jsx`: *Ending things* moves below Sign out as built, with the two notes above; a danger row is a new state the settings `Row` should describe. Tokens: there is no solid danger fill, so the destructive pill reaches for `--clay-600` as eight other sites do, and in dark it parts from `--text-danger`; a `--surface-danger` alias with a dark value would close that. A field caption above the input is new on the web modal (`.fieldLabel`). Readme: destructive actions that cannot be undone are confirmed by a typed word; everything else keeps Undo. The marketing kit gains `/delete-account` and `/terms` beside Privacy, and its footer reads address, Terms, Privacy.

### 2026-10-03 · First run, as built (033)
**Surface:** iOS, Android, web
**Raised by:** code, building *First run is three screens* in 033 (`docs/specs/033-first-run/`), with the owner's answers of the same day and the project, client and security reviews.

**Was:** the 2026-10-03 entry and `explorations/onboarding-v2.html` as drawn.

**Is:** built as drawn, with these differences, code leading:
- **No *thing* in the copy** (owner): intro line 1 *Dump what you would otherwise forget. offload remembers it and puts it in order.*, line 2 *What belongs together gathers in one thread. Share it, and plan it with the people in it.*, and the screen title **Bring it all in**. The notifications card's line gains a full stop.
- **The story bar's track is `--ink-950` at 10%**, which flips with the theme; black at 10% vanished on a dark page.
- **Pills are `--text-accent` on `--surface-accent-soft`** (*Connected*, *Allowed*, *All four filed in Lisbon trip*), since `--moss-700` there measured 3.81:1 in dark (031). The phones reuse 031's `StatusPill` for *Connected* and *Allowed*.
- **The name field rings on focus**, not on having text: the exploration's filled ring is a mock of focus, and a focus ring is never removed.
- **The intro's people are flat circles on `--label-1/2/6`**, not `Avatar`, which would fetch the mark of an account that does not exist. The photo tile is `--surface-accent-soft` with `image` in `--moss-700`, not the raw gradient; the waveform's bars are `--icon-on-well`.
- **Android:** cards and rows `a-c-low`, wells `a-c-high`, every outline `--border-strong`, as 031 mapped them. The thread rows ring blue only on a hit.
- **Reduced motion and screen readers:** nothing advances on its own and each scene draws its end state, scene one filed with counts 4 and 3. **The web pauses while hovered or focused within** (owner), since it cannot tell whether a screen reader is running.
- **The web copy fades in** rather than cross-fading; the phones cross-fade.
- **The web's Copy address confirms in a status line under the card**, *Copied*, since first run's pages have no toast host. The phones toast.
- **Bring it all in is its own web page, `/welcome/bring`**, which the calendar's connect returns to on every surface.
- **The consent boxes are 24px at radius 7 on iOS and the web**, larger than `Checkbox`'s 20 at 6, for first run only, as the handoff asks.
- **The name field is 54 tall at radius 14 on iOS and the web** (Android 4), with 18px text, against the 52 and `rounded-md` Settings keeps: `NameField` takes `large` for first run.
- **The phones' art carries no `--shadow-1`**, which is near invisible on paper and has no phone value; the hairline does the work. The scene-two card takes `--shadow-2` on iOS and Material's tonal ground on Android.
- **The web's card buttons keep their drawn 38px**, as 031 decided for the web's pointer controls; the phones reach 44 by hit slop.
- ***Connected* and *Allowed* on the phones are 031's 24px status pill**; the web draws the exploration's 30px pill.

**Design system impact:** readme **First run**: the reworded copy and title, the focus ring, `--text-accent` pills, the bar track, the web pause and `/welcome/bring`. `Checkbox`: a first-run size, 24px at radius 7 on iOS and the web, Android 20 at radius 3 (or keep 20 at 6 everywhere and log back). The name field: a first-run size, 54 at radius 14 (Android radius 4), 18px text. The status pill: one size across the three surfaces, 24 or 30, to decide. The kits' first-run screens are still superseded by the exploration; when they are redrawn, draw them as built here.

### 2026-10-03 · First run is three screens
**Surface:** iOS, Android, web
**Raised by:** the product owner, off `explorations/onboarding.html` and `explorations/onboarding-v2.html`. Handoff: `handoff/APPLY-2026-10-03-onboarding.md`.

**Was:** seven screens after sign in: three still tutorial screens, the name, the consent, the notification dialog, Forward what matters, Bring in your calendar, ending on the Calendar page for anyone who connected. Copy under the illustrations at `title-1` and 16px. `GateBackdrop` behind every step with no veil, including the consent's `body-sm` paragraph. Skip and Not now as 15px labels top right, the main action a full-width button at the bottom.

**Is:** **an animated intro** (three scenes: offload keeps track, threads you share, any way in) with **one button, Continue**, since the scenes advance themselves and Next beside Skip intro read as two ways of doing one thing, **Before you start** (name and consent on one screen), **Bring things in** (Mail, Calendar, notifications as optional cards on one screen), then Today. **Skip beside the main button**, tonal on the left. **Large first-run type.** **The prism behind the intro's art only.** The notification request moves from after consent to its own card. Connecting Calendar returns to Bring things in.

**Why:** the owner's brief: text too small for the room, the consent hard to read on the prism, too many screens with little function, an intro that said little, and a Skip that was out of reach beside an easy Next.

**Considered and not taken:** B, one setup screen after the intro (two screens, but long, with Get started under a consent and three rows); C, a first dump inside first run with connections moved to Today; a stacked footer.

**Design system impact:** `readme.md` gains **First run**; the boundary in `GateBackdrop`'s comment ("nothing on a gate screen is small text over the field") is now enforced by placement. `FirstRun.jsx`, `M3FirstRun.jsx` and `WFirstRunGate.jsx`'s tutorial, step bar and connect screens are superseded by the exploration; their sign-in screens stand. No new tokens or glyphs.

### 2026-10-03 · A thread's map, as built (030)
**Surface:** iOS, Android, web
**Raised by:** code, building *A thread's map* in 030 (`docs/specs/030-maps/`), with the owner's answers, the three reviews, a browser check and a check on an iPhone simulator and a Pixel.

**Was:** the 2026-10-02 entry and `explorations/maps.html` as drawn: MapLibre with MapTiler on all three, a column from a 1200px window, Open as the row's sheet, 16px points.

**Is:** built as drawn, with these differences, code leading:
- **Google's map on all three**, the owner's call for cost: the Maps JavaScript API on the web with one cloud map id in Google's default style, Google's SDKs through `react-native-maps` on the phones with no map id. Place lookup is Google Places. Attribution is Google's own logo and legal line, never hidden, and every map's padding keeps it above the composer, the keyboard and the place sheet.
- **Points are 20px, 28px when picked**, up from 16 and 24 (owner, 2026-10-03), with the 2.5px and 3px rings and the 44 target as drawn.
- **An approximate place draws its point at the circle's centre** as well as the circle (owner, 2026-10-03), and the circle is a 300m radius. The point is the area's named target for a keyboard and a screen reader.
- **The web column is decided by the pane's width, not the window's**: a top thread pane at 1000px or wider (with 16px of give) splits, the list drops its 700px cap, and the column carries no chips of its own; the list's filter bar filters both. A pane behind draws neither.
- **Open shows a place sheet**, not the row's sheet: header, the rows present, Directions with Open link or Edit, Directions alone for a calendar's event. On the web a 360px side pane, over the list's side beside the column, and beside a map that narrows in switch mode. On the phones a half sheet on `DragSheet`; Android's ground is `a-c-low` with `rounded-t-a-sheet`, as the calendars sheet, since there is no `--surface-sheet`.
- **Directions is always Google Maps**, a new tab with no referrer on the web, the app or the browser on the phones; never Apple Maps, since Google's results may not sit beside another map.
- **The count dot**, which the exploration does not draw: 24px in `--text-primary`, a 2px `--paper` ring, the count at 12px semibold in `--surface-page`, inside a 44 target. Tapping it zooms until its points separate.
- **The switch is `SegmentedControl`'s icon variant**: `list` and `map-pin`, a pill track with 36 by 30 halves and the picked one raised on iOS and the web; on Android an outlined `--border-strong` pair of 44 by 32 with the picked half on `--surface-accent-soft` and the glyph in `--text-accent` rather than `--moss-700`. Its halves are narrower than 44 across, reached by vertical slop, accepted. Each half carries its name, *List* and *Map*.
- **The phones' app bar with the switch is back, title, switch, share, More**, with the label tool and the calendars tool moved to the top of More while the switch is drawn.
- **The chips over the map are raised on `--surface-raised`**, with no counts and no plus; in dark, where `--shadow-1` is none, they and the switch's picked half take an inset `--border-lift` edge.
- **The map's text follows Larger text**, and the callout closes on Escape and takes the focus on the web.
- **New tokens** `--shadow-point`, `--shadow-point-picked` and `--shadow-callout`, the same value in both themes since they sit over the map (landed on `main` 2026-10-02).

**Design system impact:** readme **A thread's map**: Google on all three with its logo and legal line as the attribution, the 20 and 28 points, the area's centre point, the pane-width column at 1000px without the list's cap or chips of its own, the place sheet in place of the row's sheet, Directions always Google Maps, the count dot, the switch's icon variant and the phones' bar order, the raised chips and the dark lift. The `SegmentedControl` contract gains an icon variant (each option an icon and a name, a group label); the `AppBar` contract's trailing order gains the switch before share; `ChipFace`'s raised face for chips over a map is a new state the `Chip` contract should describe. `explorations/maps.html`'s stack paragraph and its Open handler (which opens the row's sheet) are what catch up.

### 2026-10-02 · A typed row is saved as typed (032)
**Surface:** iOS, Android, web
**Raised by:** code, building 032 (`docs/specs/032-fewer-better-model-calls/`) from the product owner's decision to stop reading typed rows with a model, and the client review.

**Was:** a row typed into a section's + drew at once with the one spinner while offload read it, and its title could change a few seconds later (decisions of 2026-09-14 on the provisional row and the spinner). The field's placeholder read *Type it, offload will sort it out*.

**Is:**
- **No spinner on a typed row**, on the row or on the provisional row drawn at the press: nothing reads it, so nothing is pending, and the title never changes after enter. `filingAt` stays in the API, always null.
- **The placeholder is *Add to this***, the kit's nearest line (`ui_kits/web_app/WApp.jsx`), on the four typed-row fields: web and phones, To do and the timeline's day.
- **A line that is one web address shows its domain chip from the press**, since the provisional row carries the address the server will write.
- **On the phones a section's + stays open at the day's limit**, where the composer drew *Enough for today*: a typed row is not a model call.

**Design system impact:** none in the kits, which never drew the typed row's spinner and have no mock for the section's +. Readme: wherever it describes a typed row being read or tidied by offload, it is saved as typed.

### 2026-10-02 · Settings, as built (031)
**Surface:** iOS, Android, web
**Raised by:** code, building *Settings, tightened* in 031 (`docs/specs/031-settings/`), with the owner's answers of the same day and the client review.

**Was:** the handoff and `explorations/settings-v2.html` as drawn.

**Is:** built as drawn, with these differences, code leading:
- **The found row's button is *Ask to connect***, in My people and in the Share sheet, where the built step said *Request* (owner). **A refused lookup has its own line**, *Too many lookups. Try again in a few minutes.*, with no retry, where a 429 fell into the generic failure (owner).
- **Status pills are `--text-accent`, word and dot**, not `--moss-700`, which measures 3.81:1 on `--surface-accent-soft` in dark. The section tile's glyph stays `--moss-700`, which clears 3:1 for a graphic.
- **Android outlines are `--border-strong`.** The exploration's `#79786F` is Material's outline; the Android scope's `a-outline` is outline-variant, the hairline, at 1.29:1. The card `#F1EFEA` is `a-c-low` and the wells `#E4E1DA` are `a-c-high`, as built before.
- **The person mark stays 36 on Android**, where the handoff asks 40: `Avatar`'s contract lists five sizes as every size the product draws.
- **The Mail card has no door to the phones' Mail page**, which a refused email in Activity still opens (owner).
- **Where you are's caption is *Used to show dates and times in local time.*** (owner).
- **The phones' app bar is a step larger**: Customize Today, the bell and settings at 24 with 16 between them, and the mark and wordmark at 24 on Today, My threads and Notes, where both were 21 (owner).
- **Theme previews take their colours from the light and dark scopes' own values** (`surface-page` and `ink-200` light, `surface-page` dark and `ink-700` light), so a preview depicts a theme whichever is showing.
- **The web's pointer controls drawn under 44px** (the card actions, the combobox field) keep their drawn size; touch targets on the phones reach 44 by hit slop.
- **Text size's first option is *Default***, renamed from *Normal* so the nav foot and the tile say one word.
- **Connect on the Calendar card goes straight to Google.** The connect screen's *You choose which calendars after this.* stays on the calendar page, which is now one level down on the web too (`/settings/apps/calendar`).
- **Profile carries the exploration's caption**, *How you appear to people you share with.*, which the handoff did not restate.

**Design system impact:** readme **People, and connecting** and **Sharing**: the found row's button is *Ask to connect*, and the 429 line joins the step. Readme **Settings**: status pills are `--text-accent`; Android outlines are `--border-strong`; the person mark is 36 on both phones; Where you are's caption is *Used to show dates and times in local time.* The mobile and Android kits: the app bar's glyphs at 24 with 16 between, and the lockup at 24. Consider an `a-outline-strong` in the Android scope so the outline is a token rather than a borrowed alias. The kits are not redrawn for this.

### 2026-10-02 · Settings, tightened
**Surface:** iOS, Android, web
**Raised by:** the product owner, off `explorations/settings.html` and `explorations/settings-v2.html`. Handoff: `handoff/APPLY-2026-10-02-settings.md`.

**Was:** every settings page built from `Group` and `Row`, the group label at 12px tertiary over 15px rows; Theme and Week starts on as a bare segmented control; Country and Time zone on the web as a native `select`, unreadable in dark; Signed in on drawing *Nothing else* when its read failed; My people with no way to start a connection; Connected apps as four one-row groups, two of them not built and one a paragraph.

**Is:** **sections open with a 32px glyph tile, a 17px semibold heading and an optional caption** (direction B), on every page and surface. **Preview tiles** for Theme, Week starts on and Text size. A token-drawn **combobox** for Country and Time zone on the web. **This device always heads Signed in on**, and a failed read says so. **My people gains Connect with someone**, reusing the Share sheet's lookup. **Connected apps is one card per app**: Calendar's carries *Ask before adding*, Mail's carries the address and *Copy*, and **the Mail card is always shown**. *Not built yet* and *What offload may do* are removed. **Help gains See the tutorial again.**

**Considered and not taken:** A, the current cards with only a larger label; C, a summary head and a raised card per section; radio cards and the segmented control for choices; a Tonight after sunset switch; a Conversations kept row in Privacy; renaming Reaching the web to Privacy.

**Design system impact:** `readme.md` gains **Settings**. Eight Lucide glyphs vendored, 95 in all: `smartphone` `monitor` `user-plus` `globe` `copy` `log-out` `ban` `type`. No new tokens. The kits are not redrawn; `explorations/settings-v2.html` is the reference.

### 2026-10-02 · A thread's map
**Surface:** iOS, Android, web
**Raised by:** the product owner, off `explorations/maps.html`. Handoff: `handoff/APPLY-2026-10-02-maps.md`.

**Was:** a thread with a located place earned a **Places** section in its list, rows and no map; *the split pin waits for a map provider* (025). Places resolved through Google Places Text Search, for `location` rows only.

**Is:** **A List | Map switch** in the thread's app bar, there when one live thing has a point: a saved place, a link with a location read from its page, or an event with a venue, offload's own or a connected calendar's the thread shows. Map replaces the body below the app bar, the thread's name moves into the bar, the label chips float over the map and filter the pins, the composer stays; the choice is kept per thread on the device. **On the web at 1200px and wider** the pane splits instead: the list on the left, a 460px sticky map column on the right, no switch; hovering a row lifts its pin, a pin highlights its row. **Pins** are 16px dots in the label's colour with a white ring, split for two labels, ink for none, rounded squares for events, 24px when picked; **an approximate place is a soft circle** in the label's colour. **A tap opens a callout**, name, kind and labels, *Directions* and *Open*; Directions hands off to the device's maps app; Open is the thing's sheet, a half sheet on the phones and the side pane on the web, with two equal 48px buttons. A place with no point stays in the list and off the map. **The Places section is retired.** **MapLibre on all three, MapTiler Streets and Streets Dark, and place lookup moves to MapTiler Geocoding**; every existing place is looked up once more.

**Considered and not taken:** a pin row that unfolds; one map in three sizes; a map column on the phones; Google everywhere; Apple on iOS with Google elsewhere; OpenFreeMap and Stadia as tile providers; a callout card that slides up; a list scroll on tap; numbered pins.

**Design system impact:** `readme.md` gains **A thread's map**, and 025's line on the split pin is closed. No new tokens: pins use `--label-1` to `--label-10` and `--ink-900`. The kits are not redrawn for the map in this pass; `explorations/maps.html` is the reference.

### 2026-10-02 · The composer closes for the day
**Surface:** iOS, Android, web
**Raised by:** the daily limits (`docs/tech/decisions.md`, 2026-10-02): once an account has spent the day's model budget or started its hundred turns, a dump can only be refused.

**Was:** no kit draws a closed composer. A refused send put *Enough for today.* in the line under the composer and handed the words back, and the next send was refused again.

**Is:**
- **The field gives way to one line in its place**, *Enough for today. Back tomorrow.*, in the field's own type and padding so the composer keeps its height, in `--text-secondary` rather than the disabled grey, because it is read.
- **Photo, voice and Send are disabled** on the same state; the rest of the app is untouched.
- **It closes on load** when the account says it is at the limit, and on a refused send before the account is read again.

**Design system impact:** add the closed state to `Composer` in the mobile, Android and web kits: the line in the field's place, controls disabled. Copy is fixed: *Enough for today. Back tomorrow.*

### 2026-10-02 · Not in a thread as built (028)
**Surface:** iOS, Android, web
**Raised by:** the 028 build of `handoff/APPLY-2026-10-01-loose.md`, with the product owner's answers during planning and the project-lead, client and security reviews. Spec and divergences: `docs/specs/028-loose/feature-spec.md`, `at-merge.md`.

**Was:** the handoff's Not in a thread, drawn in `LooseParts.jsx` and `explorations/loose-items.html`.

**Is:**
- **A turn that filed only loose shows Done and nothing else.** No *Saved.* reply: a filing turn says nothing on every other path, and *Saved.* is only a stopped turn's partial reply for what landed loose.
- **A Move to into a shared thread draws the faces of its other members** after the name: up to two 20px initials marks on `--surface-fill` with a 1.5px ring in the button's ground, overlapping by 6px, then *+N*. The owner's decision, so the tap is informed. The kit draws no faces.
- **Eight chip types**, To-dos, Links, Photos (photos and screenshots), Notes, Events, Places, Voice notes, Files, against the kit's five. Files uses `paperclip`: the set has no `file`.
- **The chips are 025's `Chip`**: a 30px pill (32 on Android) on `min-height` in a 44px target, ink when selected on all three. The kit draws 34px pills and Android's selected chip in moss, and moss means offload did this.
- **The suggestion button's target is 44px** while it draws 32, and the cross is a 44px target beside it so the two do not overlap.
- **Copy:** *These three look like they belong together.* (not *one project*, which is on the vocabulary's never list); *A name is 60 characters at most.* under the field; toasts are plain strings, *Moved to Flat admin* and *Created Kitchen shelves*, not a pill on the toast; an answer's loose result cut short says *The rest of the answer is in the list.*; a note opened from the list asks *What is worth remembering?*.
- **A row leaves as a deleted row does**, not with the kit's tinted fade.
- **The full list keeps the composer and the tabs**, as every screen does. Its empty state is the title *Nothing in here yet* alone, with no mark: the lasso is a thread's mark. Neither client has the design system's `EmptyState` component yet.
- **The archived foot row** opens an *Archived* section with *Back to the list*, as the thread page's does.
- **Loose notes draw as loose rows** with the `text-quote` tile, not the thread page's note row, which has a drag grip and no swipe. The meta line is *Note · Monday*: today, yesterday, the weekday within the week, then the date, one wording on every surface.
- **Web:** the create sheet is a modal, not the kit's side pane; Move is in the row's edit modal, so the hover tools stay two; a note's Move is a ghost pill in its editor's foot (on the phones, a row above the foot); loose rows use the thread page's 32px tile.

**Considered and not taken:** the kit's 34px moss chips; *Saved.* as a reply; a confirm sheet before a shared Move to (the security review's recommendation, declined by the owner); a *New thread* row in the move sheet.

**Design system impact:** `LooseParts.jsx`: faces on a shared Move to, the eight chip types with `paperclip` for Files, 025's `Chip` for the chips, a 44px accept target, plain-string toasts, a leaving row with no tint, and the create sheet's line *look like they belong together*. The web kit's create sheet becomes a modal and its rows gain the hover tools. The readme's **Not in a thread** drops *offload's reply ... is Saved.* for *the turn shows Done*, gains the faces, and states the full list's empty state. `explorations/loose-items.html`'s *one project* line changes. An `EmptyState` component on both clients is still owed.

### 2026-10-01 · Whose an event is: Today shows yours, a thread marks the rest
**Surface:** iOS, Android, web
**Raised by:** the product owner on production: a calendar shared with his wife put her daily classes on his Today, as his next line and under Where you will be.

**Was:** every event on a ticked calendar was the person's, on Today and on a thread, and Today's events read *Google, Family*.

**Is:** Today draws a calendar's event only when the person created it or is invited and has not declined, so somebody else's day on a shared calendar is neither under Where you will be nor the next line. The calendar line reads *Calendar: Family*. A thread keeps every event and marks one the person is not in: its title in quiet ink, *Family, not yours* under it.

**Considered and not taken:** a switch per calendar for Today (blunter: it takes an event the person is invited to off with the rest); filtering a thread by a note, which needs a thread preference the model can set and is its own change.

**Design system impact:** readme, Today: Where you will be and the next line are the person's own events; the event card's calendar line is *Calendar:* and the name. readme, the thread's calendar events: one the person is not in is quieter and says *not yours*. `TodayParts.jsx`'s `s:"Google, Work"` becomes *Calendar: Work*.

### 2026-10-01 · Things without a thread, and Always on retired
**Surface:** iOS, Android, web
**Raised by:** the product owner, off `explorations/loose-items.html`. Handoff: `handoff/APPLY-2026-10-01-loose.md`.

**Was:** a dump with no obvious home went in Miscellaneous, an ordinary thread that `accounts.default_thread_id` points at, drawn in My threads under **Always on** with Read later, Flat admin and Gift ideas. offload said *Saved to Miscellaneous.*

**Is:** **Always on is gone**: My threads is one list by last activity, then Older threads; a slow thread sinks and comes back up when something lands. **The default thread is storage, never drawn as a thread**: not in My threads, not as a pill, not in the move sheet's list, not shareable. Its contents are a group, **Not in a thread**, between the list and Older threads: the things themselves with their type tile, type chips that filter the group in place (three rows, then *All 5 links*), and *All 14* to a pushed screen of the same rows newest first. **A row can carry one suggestion**, drawn under it as one button: *Move to* an existing thread on moss soft ground with the lasso, or *Create* a new thread on paper with a dashed moss outline, a plus and *new thread*; the cross beside it dismisses for good. Move to comes from the planner at filing time when it was not confident enough to file; Create from a daily job, only for two or more things, and opens a sheet with the name and the things, each untickable. offload's reply for a thing it files without a thread is *Saved.*

**Considered and not taken:** a nullable `thread_id` with account-key encryption; sorting by type as homes; leaving loose things to Today and search alone; a tray above the composer; loose things fading into Memories; tapping the pill to accept; pinning, for now.

**Design system impact:** `readme.md` gains **Not in a thread**; the moss role drops Always on; the 27 August naming of Miscellaneous is superseded. `ui_kits/mobile_app/LooseParts.jsx`, shared by the three kits, and `OFFLOAD_DATA.loose`; `kind:"always"` is gone from fixtures.

### 2026-10-01 · Today as built (027)
**Surface:** iOS, Android, web
**Raised by:** the 027 build of `handoff/APPLY-2026-10-01-today.md`, with the product owner's answers during planning and on the simulator, and the project-lead, client and security reviews. Spec and divergences: `docs/specs/027-today/feature-spec.md`, `at-merge.md`.

**Was:** the handoff's Today, drawn in `TodayParts.jsx` and `explorations/today.html`.

**Is:**
- **Customize Today:** What moved is held back until it is designed, so the sheet draws Needs you and Your day. Needs you has no switch of its own; under it, four kinds each have a switch: Account issues, People, Questions, Tips. The last switch on is disabled, so Today is never blank. Its switches are Settings' own switch, ink when on. On the web it is a second pane at `/today?customize=1`, with Today at 520px beside it.
- **The zone strip** is now a *Time zone* card in Needs you, with Use and Keep and no clock, since Keep already answers once per zone.
- **New card words:**
  - The calendar card's line is *Sign in again to see its events here.*, preceded by the account's address when two accounts are connected. The kit's *Events after Sunday are missing from your day.* had no source. The card has no *Not now*.
  - The notifications card, phones only: *Notifications are off* / *Reminders can't reach this phone.* / Turn on.
  - The invitation card uses 022's preview line.
  - The connection request card has no context line.
- **A question card is `QuickReplies`:** no option is filled, *Not that* sits alone on its line, and the clock is beside it. Its chips are 30px on the web and 34px on the phones.
- **Kind colours** are `--text-attention` and `--text-accent`, replacing `--blue-700` and `--moss-700`, which fall below 4.5:1 in dark.
- **Past events** dim their title only, not the whole card. Another member's event carries *Ana's*.
- **The thread pill** is one component: 24px on Today and 30px in the turn footer, with a 44px target.
- **Today's To do rows are tighter than the thread page's**, at the owner's request: 12 at the sides, 8 between the checkbox and the title, and the checkbox at its own width. The rows sit on the card's `--surface-fill`.
- *N more late* is in quiet ink. Past the read's caps, *and N more*.
- **An empty day** reads *Nothing today.*, *Nothing on Thursday.*, *Nothing next Monday.* and so on.
- **The stepper's week** ends on the day *Starts on* sets, and the stepper stops twelve months ahead.
- **An offload event** opens its thread.
- **Launch's second line** shipped as *Trying again.* (see the entry below).

**Considered and not taken:** What moved drawn from Activity rows without a design; one switch for the whole of Needs you (the owner asked for one per kind); late to-dos in Needs you.

**Design system impact:**
- **readme, Today section:**
  - Customize Today: two rows, the four kinds and the disabled last switch.
  - The zone strip folded into Needs you as a card.
  - The calendar, notifications and invitation cards' words.
  - The question card as `QuickReplies`.
  - Kind colours by alias.
  - Past events dimming only the title.
  - Today's tighter To do rows.
  - The *Nothing* lines and *and N more*.
- **readme, launch:** *offload isn't answering* / *Trying again.*, since the client cannot tell an outage from a captive portal.
- **`TodayParts.jsx`** and **`M3TodayScreen.jsx`** follow the above.
- **`QuickReplies`** gains a `trailing` slot.
- **`ui_kits/web_app/WToday.jsx`** is wholly superseded by the web Today in the exploration and should be redrawn from it.

### 2026-10-01 · Text on a fixed fill is on-solid, and the row tools sit on the title line
**Surface:** iOS, Android, web
**Was:** the web's Done chip, Send, the admin link and the admin nav, its logo included, drew `--paper` or `--text-inverse` on moss or blue, and Android's filled blue buttons and its consent and calendar ticks did the same. Those flip to near black in dark mode while the ramps do not, so the words read dark on green or blue. The web row tools were drawn against the row's top edge: a `margin-block` written after the tools' `margin-top` replaced it.
**Is:** any text or glyph on a moss, blue or clay fill is `--text-on-solid` (`COLOR.onBrand` on the phones), white in both themes. iOS keeps `--text-inverse` on `--surface-inverse`, which flips with it. The row tools take the tile's own offset, so they sit on the title line exactly as the tile does, and a negative bottom margin alone keeps them out of the row's height. Both are pinned by a scan in each app's suite.
**Why:** seen by the owner on the web in dark mode, the Done chip and a row's tools on hover.
**Design system impact:** readme, colour: state that text on a ramp fill is `--text-on-solid`, never `--text-inverse` or `--paper`, which are for `--surface-inverse` only. `WRow`: the tools align with the tile, not with the row's top. `M3*` kits: any filled primary in blue draws its label in `--text-on-solid`. `Logo`'s contract already declares `style`; the app implements it now, over the tone, and the admin nav passes `--text-on-solid` through it, since `inverse` is for ink.
### 2026-10-01 · The mobile kits redrawn to the app as built (5A)
**Surface:** iOS, Android kits
**Is:** Today, the row sheet, Activity, Notifications, the Mail page and first-run step, the conversation at 54pt with no fold, and launch's two failure states, in both kits; Today's body, Activity, launch, the Mail step and the row sheet are one shared file, `ui_kits/mobile_app/TodayParts.jsx`. `NotificationSheet` now renders Activity.
**Design system impact:** none; the kits follow the readme.

### 2026-10-01 · Launch when nothing answers, and the tabs under the keyboard
**Surface:** iOS, Android, web
**Raised by:** the two design impacts left by the 30 September build, decided off `explorations/finishing.html`.

**Was:** launch drew *That didn't go through.* in `--text-danger` with Try again beside it, and waited for a tap. Under the keyboard the tabs were covered as it rose.

**Is:** **two messages**: *You're offline* / *offload picks up when you're back.* with no network, retrying on reconnect; *offload isn't answering* / *It's on our side. Trying again.* otherwise, retrying at 2, 4, 8 then every 15 seconds; a Try again pill under both, never in danger red. **The tabs fade** over the keyboard's first 60pt as it rises; the plate's geometry is as built. *Amended 2026-10-01 by 027: the second line shipped as "Trying again." alone.*

**Considered and not taken:** the built single line; a quiet retry with one message.

**Design system impact:** `readme.md` launch and plate notes; the kits' launch gains both states.

### 2026-10-01 · Today: what to expect and what to do
**Surface:** iOS, Android, web
**Raised by:** the product owner, over five rounds on 30 September and 1 October, off `explorations/today.html`. Handoff: `handoff/APPLY-2026-10-01-today.md`.

**Was:** `main`'s Today was a placeholder: the day-one invitation, the zone strip, and three groups of rows (Overdue, Today, Tomorrow).

**Is:** **Needs you** on top holds interruptions only (account issues, people, questions, one tip) as one stacked card, drawn only when it holds something; late to-dos are not in it. **The day** under it: a stepper (Today, Tomorrow, weekdays, Next Monday...), the next event in one line with a blue countdown, the day's events as a sideways strip, **To do** (late, timed, the rest), and **If you have time** (up to three undated to-dos, offload's pick, each with *+ Today*). Threads are thread pills. **Customize Today** from `sliders-horizontal` in the app bar: three sections, dragged and switched, stored as a small per-account document with no model call. Today is not a calendar; an event opens in the calendar app.

**Considered and not taken:** a prompt that compiles to a layout (the drag and switches were enough), a brief in offload's voice, a written layout as the page, a rail, hours to scale, cards split by free time, free time as cards, a now line, day chips, a week strip, a calendar-first list, a planning tray, cards per thread, a tomorrow line, and late to-dos in Needs you.

**Design system impact:** `readme.md` gains **Today**; `sliders-horizontal` and `mail` vendored, 87 glyphs.

### 2026-10-01 · The 30 September build's asks, folded in
**Surface:** iOS, Android
**Raised by:** *2026-09-30 · The immersive conversation as built* and its FROM-CODE note.

**Is:** **Scrim 35%**, and `--surface-scrim` moves to 0.35 in light. **A sheet over a sheet draws no scrim of its own.** `--spring-sheet-stiffness` 380 and `--spring-sheet-damping` 36 in `tokens/motion.css`. `Sheet.prompt.md` gains every sheet dragging, the grabber, focus as it rises and the keyboard put away on close. The readme's two conversation notes gain the thirty minute end, the 30% back pull, every sheet, and the keyboard covering the tabs.

**Design system impact:** the launch failure state and the plate under a keyboard remain for the kit redraw.

### 2026-09-30 · Mail becomes a door, and the set gains a mail glyph
**Surface:** iOS, Android, web
**Was:** the icon set had no mail glyph. The mobile kit draws *Mail* under *Not connected* with *Connect*, *So a confirmation files itself*; the web kit draws it as a card with a switch, *Watching for things you dump*, beside a *What came from where* block. First run's step count is a constant, and its one offer is the calendar.
**Is:** 026 builds forwarding to `over@to.offload.club`. `mail.svg` joins the set, Lucide's envelope at the set's stroke. On the phones *Mail* in Connected apps is its own group, a door with the address as its note and no value, or *Unavailable* with the relay note for an Apple hidden email; it opens a Mail page with the address and Copy (an action row with no chevron), Add to contacts, and two lines on how it works. **The web draws the same block inline in Connected apps**, as it draws the calendar there, with no switch, because forwarding has nothing to turn on. *What came from where* is not built. First run gains a *Forward what matters* step in the calendar step's layout, with the mail glyph on the stand-in's tile, **before the calendar's**, since connecting a calendar ends first run and nothing after it would be seen; it is not shown to an Apple hidden email, and the dots count the steps each account is shown. An email in the conversation draws the mail glyph, its subject and *Forwarded*, then the person's note, never the forwarded header. A mail row's body line quotes the email's subject. On the phones a mail row opens its thread or Today, since there is no route to a single row; the web opens the row, the thread, or Today.
**Why:** an email you forward is a dump rather than a connected inbox, so there is no connection to switch; a missing icon name draws an empty circle that only `dead-icons.mjs` catches.
**Design system impact:** add `mail` to the icon list in the readme. `SettingsDetail.jsx` and `M3SettingsDetail.jsx`: the `apps` page's Mail row moves to its own group as a door with the address as note, plus a Mail page whose Copy row carries no chevron. `WSettings.jsx`: the Mail card becomes an inline block without a switch, and *What came from where* is marked unbuilt. `FirstRun.jsx`, `M3FirstRun.jsx`, `WFirstRunGate.jsx`: a Mail step **before** `ConnectScreen`, the mail glyph on the stand-in tile, and `StepBar`'s `total` passed per account rather than `STEPS`. The conversation's person bubble: a mail variant with the glyph, the subject and *Forwarded* in `--text-tertiary`.
### 2026-09-30 · A digest's title counts, overdue rows are named, and its Activity row opens Today
**Surface:** iOS, Android, web
**Was:** the morning digest's title was always "Due today" and the evening's "Tomorrow". Overdue rows were a counted sentence, so a morning with nothing due and five overdue read "Due today" over "Five are from last week." In Activity a digest row drew its title alone and opened nothing, so it read "Due today" and went nowhere; no row on either client drew its words, though 024's sketch always had them.
**Is:** the title says the day in counts and never a person's words, 024's rule for a digest title: "Three today", "Five still open", "One today, three from yesterday", "Two tomorrow". The body names today's rows, then a repeating row's clause, then "Still open:" and the overdue rows in the same three arms, or the overdue rows alone when nothing is due today. Every Activity row draws its words under its title in `--text-body-sm-role`, `--text-secondary` (the Material on-variant on Android), and a digest row opens Today: `/today` on both, gone back down to on the phones rather than pushed over Activity.
**Why:** the owner's call on 2026-09-30, from four directions sketched in the session, for a notification that says what is in the day rather than a label and a count.
**Design system impact:** readme, the notifications section: the digest's copy examples become the four titles above, and "Overdue is a second sentence" becomes "what is still open is named after today's list". Any Activity mock draws a digest row with its words under the title and as a door to Today. The switches keep their names, Due today and Tomorrow, and "Due today was off" still names the switch.

### 2026-09-30 · Every composer placeholder fits on one line
**Surface:** iOS, Android
**Was:** the kit's twenty placeholders, five of them longer than 25 characters. On the Pixel "Even if it's three things at once" wrapped, and the empty composer grew to two lines to hold it.
**Is:** 25 characters at most, pinned by a test. "Something you'll want later" is "Something for later", "Don't file it, just drop it" is "Don't file it, drop it", "Even if it's three things at once" is "Several at once is fine", "Type it badly, that's fine" is "Type it badly, it's fine", and "Where does this go? Not your problem" is "Where it goes is on me".
**Why:** an empty composer should hold its size. The field is about 234dp beside its controls on the Pixel and a little less on a 375pt phone.
**Design system impact:** `PLACEHOLDERS` in `Composer.jsx` and `M3Composer.jsx` take the five new lines. The readme's composer section can state the 25 character limit.

### 2026-09-30 · The plate's corners and shadow reach both phones
**Surface:** iOS, Android
**Was:** the plate was rounded but the band inside it, which clips the prism field, was not, so the field painted square corners over the round ones and both phones drew a straight top edge. The shadow was the old shadow props, which Android reads as `elevation` lit from above, so the plate cast nothing upward there.
**Is:** the band takes the plate's corners, `--radius-a-xl` on Android and `--radius-lg` on iOS as before. The shadow is `--shadow-sheet` drawn as a box-shadow on both phones, in each theme's value.
**Why:** seen on the Pixel against the kits, which draw the plate with rounded top corners and an upward shadow.
**Design system impact:** `M3App.jsx` draws the plate's shadow as a literal, `0 -6px 12px -6px rgba(0,0,0,0.22)`; it should be `var(--shadow-sheet)`, as `App.jsx` already is. The iOS kit rounds the plate at `--radius-xl` while the iOS app has used `--radius-lg` since 009, on the conversation sheet too; one of the two wants settling.

### 2026-09-30 · Launch holds when nothing answers, and only a 401 is signed out
**Surface:** iOS, Android, web
**Was:** launch on the phones sent any failure to `/api/me` to the gate: a 401, a 404, a timeout, no network. The web sent any response that was not ok to the gate, and a fetch that threw held the shell blank for good.
**Is:** only a 401 goes to the gate. Anything else holds. On the phones the mark stays, and where the spinner sits it draws one clause, "That didn't go through.", with Try again beside it. The web's shell and first run draw the same line alone in the middle of the page. Try again asks once more, and on the phones the spinner shows while it waits. It is the line the people and invitation screens already draw when a read fails: `--text-danger`, with Try again in `--text-accent` on the phones and `--text-link` on the web. **The plate no longer draws on the launch screen.** Its route list still held `/` from when Today lived there, so the composer and tabs showed under launch whenever launch held, the ordinary slow-start spinner included.
**Why:** on 30 September between 07:33 and 07:42 UTC Railway's edge answered 404 for api.offload.club with every service healthy, and the Pixel showed the gate to a session that was still good. The gate says signed out, which was not true. A blank screen was already ruled out on a device, because a frame that never changes looks like a broken app. No kit draws either state: `find-kit.sh` finds nothing for launch, splash, offline, retry or loading.
**Design system impact:** the phone kits' launch has one state, the mark and a spinner under it. It wants a second: the mark, with the failure line and Try again in the spinner's place, and no plate. `WFirstRunGate.jsx` wants the same held line for the web, alone on the page with no card.

### 2026-09-30 · The immersive conversation as built, and what the build changed
**Surface:** iOS, Android
**Was:** `handoff/APPLY-2026-09-29-conversation-sheet.md` as drawn.
**Is:** Built to the handoff, with these differences, each found on the simulator frame by frame. **Every sheet drags**, not only the row sheets: Move, Calendars, Share, Confirm, the label list, the note editor and the rename sheet take the same grabber and `DragSheet`, at the owner's call. **A conversation put away for thirty minutes ends** on the next tap into the composer or the next dump, which then starts a new one; with the x gone nothing else ended one (owner, 30 September). **Android back** is predictive app-wide, and a full back swipe pulls a sheet down by 30% of its travel before the commit closes it. **The keyboard never changes the plate's shape**: the old "clears to the composer alone" is gone; the keyboard covers the tabs first and the plate rides it only once it reaches the composer. **A sheet's field is focused as the sheet starts to rise**, not on mount, and a sheet opens from the keyboard's edge, so the two move as one. **A pin's "In thread" chip rides the keyboard** on top of the composer. The Android grabber is M3's 32 by 4 and does not widen when held, as the exploration draws it; iOS keeps 36 and widens to 44. **Thirty minutes of silence ends a conversation on every surface**: the server's window went from six hours to thirty minutes the same day, and the web keeps its close for ending one sooner. **The scrim is dark ink in both themes**: it was the `ink-950` ramp, which is #EDEDED in dark, so every phone sheet dimmed to white. The grabber is the Close button to screen readers, since the scrim is outside a sheet's modal region.
**Why:** each was a visible fault otherwise: a keyboard up a quarter second before its sheet, a plate that re-laid itself out twice under the conversation's keyboard, a pin's chip under its own field, and conversations that never ended.
**Design system impact:** `readme.md` *A raised conversation follows the finger*: add the thirty minute end, the 30% back pull, and "every sheet", not "every row sheet". *The bottom plate is a fixed shape*: add that the keyboard covers the tabs and the plate rides it from the composer up. `Sheet.prompt.md`: the grabber is on every sheet, and a field in a sheet is focused as it opens. The mobile kit redraw (5A) should draw the plate under a keyboard with the tabs behind it. **Motion**: a dragged sheet moves on a spring, stiffness 380 and damping 36 from the release speed, which no token names; `--duration-sheet` and `--ease-entrance` now govern only the plate sliding off for a screen sheet. `Sheet.jsx` still animates `offload-rise` on them, and wants a `--spring-sheet` or a note.

### 2026-09-29 · The code's entries of 26 to 29 September, folded in
**Surface:** iOS, Android, web
**Raised by:** the code entries of 26 to 29 September and 025's as-built entry.

**Is:** `readme.md` gains **The row and its sheet** (a tap opens the sheet and phone rows draw no tools, an `ellipsis` on a link, top alignment on the title line, no details anywhere, pictures at 50 and 72, the handle space and the finished rule, the one edit sheet with panels in place, the three-pill foot, the note row, the thread's line, "thing" retired). **Labels** is rewritten to what shipped: labels from the edit sheet, `tag` in the app bar with no labels and no filter-bar empty state, no fade, the colour swap, the empty line, the no-noun copy, the 30px footer mark, the web's three ways to hold, the calendar's marks, the map waiting, the nightly sort off. **The timeline** is a month at a time with a picked calendar's hollow rings and the 16px anchors. `LabelMark` takes `size={30}`; the `Chip`, `AppBar` (up to four), `Sheet` and `RowActionSheet` contracts match the code.

**Design system impact:** the kit screens are not redrawn in this pass; that is decision 5 in `explorations/immersive-conversation-decisions.html`.

### 2026-09-30 · A more immersive conversation (idea 1)
**Surface:** iOS, Android
**Raised by:** the product owner, after Meta's Muse.

**Is:** the sheet rises to 54px, loses its header row for a grabber, follows the finger with the scrim, the receding page and the tab bar tied to it, and a thread keeps its tabs. Decided 30 September: **no fold** (a release closes; the composer brings the same conversation back); **every row sheet drags** with the same physics and a drag is Cancel; the turn footer is unchanged; only the conversation recedes the page, and **on Android nothing recedes**: the page dims under a 55% scrim, for frame cost, the status bar and the platform's own sheet; phones only. `handoff/APPLY-2026-09-29-conversation-sheet.md` carries the why-it-janks reading of `Conversation.tsx` and the one-shared-value build.

**Considered and not taken:** keeping the fold, a conversation glyph in the composer, a row chip in the footer opening its sheet stacked on the conversation, every sheet receding the page, a web pass.

**Design system impact:** `Sheet`'s grabber is on every row sheet and draggable; the readme's conversation states lose *folded*. The mobile kit is redrawn next (5A).

### 2026-09-29 · To do's finished rows sit under a rule, in line with the rest
**Surface:** iOS, Android, web

**Was:** a finished task draws no handle, since it cannot be dragged, so its checkbox sat a handle's width left of the unticked ones and the two groups read as one list drawn wrong.

**Is:** a finished row keeps the handle's space with nothing in it, so its checkbox sits under the others', and a 1px rule in `--text-secondary` separates the two groups, standing in for the last unticked row's own hairline rather than adding to it. Only while both groups show.

**Design system impact:** `ContentRow` gains `handleSpace`, an empty handle column. The kits' To do widget draws the rule between the groups, full row width, in `--text-secondary`.

### 2026-09-29 · When, Repeats and Labels open inside the edit sheet, and every row sheet has one foot
**Surface:** iOS, Android

**Was:** the edit sheet's When, Repeats and Labels each opened a second sheet over it. The When sheet's foot was Clear beside Save with no Cancel, so going back without a change meant choosing between two actions that both changed something.

**Is:** they open in place, in the same sheet, and hand their value back on Done; the sheet's own Save still writes once. The sheet's fields stay mounted under a panel, so the title field does not raise the keyboard again when one closes. Every row sheet shares one foot, `SheetFoot`: the way out or the undoing on the left where Delete sits (Delete, Archive, Put back, Clear), Cancel and the confirming action on the right. The confirming action says Save where it writes and Done where it hands back to a sheet that will. The When and Labels sheets the long press opens alone use the same foot, so both gain Cancel, and Labels loses its full-width pair. Custom repeat still opens as its own sheet. Each sheet grows by the keyboard from its foot rather than rising by it, so its top never leaves the screen.

**Design system impact:** the kits' edit sheet shows When, Repeats and Labels as panels inside it, not as stacked sheets. `RowActionSheet`'s sibling sheets (When, Labels) take the three-pill foot: lead action left, Cancel and Save or Done right. A new pattern worth naming in the readme: a sheet's sub-section opens in place and confirms with Done.

### 2026-09-29 · The label list keeps its name in view with the keyboard up
**Surface:** iOS, Android

**Was:** the label's list runs from under the status bar to the bottom and rose by the keyboard's height when the name field took focus, so in a thread with many rows its top, the name and the colour, went off the screen.

**Is:** the keyboard pads the sheet's foot instead. The name and the colour stay where they are and the list of rows is what gives up the room, and scrolls.

**Design system impact:** none; a keyboard is something no kit can draw.

### 2026-09-29 · A thread's line says what is in it, and who with
**Surface:** iOS, Android, web

**Was:** "33 · just you" under a thread's name in My threads and on the web's thread head: a total that counted ticked-off rows and said nothing about what they were, then "just you", which is most threads.

**Is:** the two biggest open kinds, largest first: "15 to do, 3 links". A shared thread gives one kind and the people, by first name: "6 to do, with Ana", "with Ana and Tom", "with Ana and 2 more". A to-do counts while unticked, an event until it ends, nothing archived counts, and photos and screenshots count together. No "you", ever. An empty thread of your own draws no line at all. Composed on the server, as before.

**Design system impact:** the kits' `ThreadRow` meta line and the web's `WPaneHead` sub take this shape. Kind names: to do, event(s), link(s), photo(s), place(s), voice note(s), file(s).

### 2026-09-29 · No details, on a row or a note
**Surface:** iOS, Android, web

**Was:** a row's edit had a details field under the title, and its details were drawn under the title in lists, on Activity, in an answer, on the web's row page and under a photo in the viewer. A note had a second field and a "more" marker.

**Is:** none of these. offload is for short things; the second field took space, looked odd and confused people. What is stored is left as it is and an edit never touches it. **The photo viewer keeps a caption**: a photo's details before their `Text:` line, which the filing prompt writes as why it was kept and what is in it. The words read out of the picture after `Text:` stay stored for search and answers and are shown nowhere; a document's worth of text is not a caption. The caption is also the photo's accessible description. The privacy page says both, and its date and the consent version moved to 29 September.

**Design system impact:** the edit sheet and the web's edit dialog lose the details field; `ContentRow` loses its body line on every surface; the note editor loses its second field and the note row its "more". The 2026-09-27 edit-sheet entry's details styling no longer applies.

### 2026-09-29 · Pictures on rows are larger
**Surface:** iOS, Android, web

**Was:** a link's page picture and a photo row's thumb took the type tile's slot, 36px, centred on the title line.

**Is:** 72px on the web and 50px on the phones, topped with the title line rather than centred on it, since they are taller than it. The type tile and the Files grid are unchanged, so a row with a picture starts its title further in than one without.

**Design system impact:** `ContentRow`'s picture lead is 72px on web and 50px on the phones, top aligned.

### 2026-09-29 · The web's live rows drop "you · date"
**Surface:** web

**Was:** every row in Everything else carried its author and created date, "you · 20 Sep".

**Is:** nothing on a live row, as on the phones. An archived row keeps "archived 20 Sep", the one date there that is useful.

**Design system impact:** the web kit's list row drops the author and date meta except on the archived view.

### 2026-09-29 · The day list's event anchors are twice the size
**Surface:** iOS, Android, web

**Was:** an 8px anchor on a 1px spine, from DayAgenda's EventLine (21 September).

**Is:** a 16px anchor on a 2px spine, the spine through the anchors' centres; the title column moves 8px in. They read as a smudge and a hairline.

**Design system impact:** `EventLine` in the kits' DayAgenda: anchor 16px, spine 2px.

### 2026-09-29 · A day's spoken name never says thing
**Surface:** iOS, Android, web

**Was:** a calendar day with a link or a photo on it was named "2 things".

**Is:** kinds with a name keep it; anything else is counted without a noun, "2 more" after named kinds and "2 on" alone, the other half of "nothing on".

**Design system impact:** none.

### 2026-09-29 · A row's tools move into its sheet, and a tap opens it
**Surface:** iOS, Android
**Raised by:** the product owner, tightening the thread after 025.

**Was:** every row drew its tools on the title line: `pencil` and one way out, with `tag` first on an unlabelled row, so a to-do had a handle, a checkbox and three glyphs. A link's row opened its page on a tap and drew `arrow-up-right` where the tools would be. Labels were reached from the row's `tag` or the long press's sheet.

**Is:** a tap on a row opens its edit sheet, and the row draws no tools. The sheet carries what they did: a **Labels** row under When and Repeats, showing the row's dots and names and opening the label sheet on top, which hands its choice back like When does, so Save still writes once; the way out stays at its foot. A link with an address keeps the tap for its page and draws one `ellipsis` that opens the same sheet; the arrow is gone, since the domain under the title already says the row goes somewhere. Somebody else's row cannot be edited, so its tap opens the long press's action sheet, which gains **Labels**. The swipe and the long press are unchanged.

Beside a handle, the checkbox drops the tile's 36px slot and sits at its own 21px: To do is all tasks, so there is nothing for the title to line up with, and grip, slot and gap together pushed it half an inch in.

**Design system impact:** the kits' `ContentRow` on the phones draws no trailing tools, and an `ellipsis` on a link row in place of `arrow-up-right`. The 2026-09-11 "row draws what the web row draws" and 025's "the tag tool sits first among a row's tools" no longer hold on the phones; the web is unchanged. The edit sheet gains a Labels row with `tag`, dots and names and a chevron. `RowActionSheet` in a thread gains Labels after Edit. The checkbox-in-the-tile-slot rule of 2026-09-26 applies only to a row with no handle.

### 2026-09-29 · A note on the phones: no sparkle, its labels as dots, the handle on its first line
**Surface:** iOS, Android

**Was:** a note offload wrote led with `sparkles` in moss before moss text. A note's labels were not drawn anywhere. The handle was centred on the whole row and touched the text: its −6 margin cancelled the 6px gap.

**Is:** no sparkle, on the thread's Notes and on a day's list under the calendar: the moss ink says who wrote it. A note's labels are `LabelDot`s at the trailing edge, centred on the first line, one per label; the filter bar names them. The handle sits on the first line, as the content row's does, and clears the text by the gap.

**Design system impact:** the kits' note row drops the leading sparkle on the phones and gains trailing label dots. The accessible name keeps "offload wrote this." The web's note row is unchanged.

### 2026-09-29 · The thread's calendar is always a month
**Surface:** iOS, Android, web

**Was:** a rail of whole weeks until the span passed six weeks, then a month (2026-09-11). A trip over three weeks drew as weeks that crossed a month boundary with no way to step.

**Is:** always the month, with the month bar, the swipe on the phones and the directional slide. The rail is drawn nowhere; `railFor` stays in the package because its tests pin the dot rules the month shares, and `WEEKS_BEFORE_MONTHS` is gone.

**A month is drawn once.** With a calendar picked, the thread's own dots drew first and the calendar's a second later, and every step to another month did it again. A month's dots now wait for its events, and the months either side are read ahead, so an arrow or a swipe lands on a complete month.

**A picked calendar's events are quieter than the thread's own.** A calendar with something every day lit every cell, so the dots stopped telling the thread's days apart. Its events are a hollow ring in `--text-tertiary`, drawn after the thread's own dots so the cap never crowds those out, and they never lift a cell: the lift is the thread's own things only. The day's list is unchanged. A day's accessible name says "calendar event".

**Design system impact:** the kits' `TimelineWidget` is a month grid with the month bar (step, name and Today, step), not a Mon to Sun rail. The readme's "past six weeks it is a month" becomes "a month at a time". The dot legend gains a fifth mark, a picked calendar's event: hollow, tertiary, last in the cell. The has-something cell treatment of 2026-09-11 is about the thread's own things only.

### 2026-09-29 · Group with labels is a tag in the head
**Surface:** iOS, Android, web

**Was:** a thread with no labels and six or more things drew an outline chip, *+ Group with labels*, on a row of its own under the app bar.

**Is:** a thread with no labels draws `tag` in the head: first among the phones' bar glyphs, before Share, and among the web pane's tools, before the calendar. It opens a new label's list, as the chip did, and is named *Group with labels* for a screen reader. No six-row threshold: it is one quiet glyph, not a row. Once the thread has a label it goes, and the filter bar's pinned `plus` takes over. Not on the archived view.

The web head's tools were capped at one by the 17 September criterion; this is the second, and it meets the criterion, since grouping changes what the pane shows.

**Design system impact:** the filter bar has no empty state; the `Chip` prompt's *Group with labels* line goes. The phones' thread app bar and the web's `WPaneHead` tools gain `tag` while a thread has no labels. `PaneHead`'s "up to one" tool becomes "up to two".

### 2026-09-27 · Labels, as built
**Surface:** iOS, Android, web

**Is:** the handoff of 26 September built on all three surfaces: `LabelMark` on the row's marks line after the date chip; the `tag` tool on every unlabelled row; the label sheet (a popover on the web); the label's list (a full-height sheet on iOS, a Material bottom sheet on Android, a modal on the web) with Rename, Colour and Delete; the filter bar with either logic, a picked chip in its own colour, No label, the pinned `plus`, and *Group with labels* at six rows; `#` in the composer; the turn footer's marks; Today's marks after the thread's name; the `labelled` row in Activity with Undo.

**Where the code diverged, and why.**
- **The copy says no noun.** *Seven things labelled.* is *Seven labelled.*, *Packing list is Istanbul* is *Packing list is under Istanbul*, and the composer's list shows a label's count without "things": "thing" is retired from anything a person reads, and "is Istanbul" read as a rename.
- **The tag tool sits first among a row's tools**, on every unlabelled row including another member's and a link's (before `arrow-up-right`), where the handoff said "beside the pencil": the phones draw no pencil on another member's row, which would have left labels unreachable there. It is not drawn on Today, which has no thread to label under.
- **Targets.** Every label control reaches 44px tall by a hit area with no paint, and across only as far as the gap to its neighbour allows, touching and never overlapping. The web's row tools stay 32px and sit 4px apart: 44 tall by 36 wide. The phones' tools sit 16px apart, so their slop is 8 either side and 14 above and below: 45 tall by 33 wide; they were 33 by 33. A pressed `LabelMark` is 44 tall on both, 2px of reach either side; the web's `pencil` on a picked chip is 44 by 33. The phones' Rename, Colour and Delete are 44. Neither platform reaches 44 across on the row tools without the row's tools spreading apart, which the kit does not draw; that is the open call.
- **The turn footer's mark is 30px**, the footer's own height, where the handoff said 24, and is capped at three and a count as the sources are. `LabelMark` gains `size={30}`.
- **Timeline.** offload's own dated rows are drawn on the timeline as the thread's rows, so they carry their marks; a calendar's events keep their anchor in the calendar's colour and carry no labels. There is no neutral block for a dot to lead, so nothing else changed there. The rail keeps its type dots and narrows with the filter rather than drawing up to three label dots: one dot meaning two things is worse than either.
- **The map is not built**; there is no map provider. The web's Places widget draws its pins as before, not in label colours.
- **Holding a chip** opens its list on the phones; the web has three equivalents: the chip's context menu (right click, the context menu key, Shift+F10), a long press on a touch screen, and on a picked chip a small `pencil` beside it in the chip's colour.
- **No fade under the pinned `plus`**; it sits on the page's ground (`--pane-ground` on the web, so it matches whichever pane it is in).
- **A taken colour swaps.** The Colour picker marks a taken colour with its label's initial and picking it swaps the two, so the picker is never inert at ten. A new label's list shows no colour picker; it takes the lowest free colour.
- **Empty filter line**: *Nothing under Lisbon yet.*, or *Nothing without a label yet.* for No label alone.
- **The phone chip** is one face (`ChipFace`) shared by `Chip` and the filter bar's label chip, because holding needs a prop outside `Chip`'s contract.

**Design system impact:** `LabelMark` gains `size={30}` for the turn footer. The readme's Labels section wants: the no-noun copy above; "first among the tools" for the tag tool and the note that Today draws none; the timeline and rail sentences replaced by what is written above; the pin rule marked as waiting on a map; the web's three ways to hold; no fade; the colour swap; the empty filter line. The `Chip` prompt's filter bar line drops the fade and gains the web's `pencil` on a picked label chip. The kits' `ContentRow`, `TurnFooter`, Activity row and Today row want the marks, the tool order and the footer's 30px mark drawn.

### 2026-09-27 · The edit sheet has no heading; the title and details differ by size and ink
**Surface:** iOS, Android, web

**Was:** "Edit" over two fields drawn alike, from 023's sketch. On the web the details were larger than the title, 16px regular under 14.5px medium, so the row's own words read as the lesser field.

**Is:** no heading; the title field is 17px semibold in the primary ink, the details 14px regular in the secondary ink, on all three. The fields say which is which, and "Edit" said nothing the pencil had not. The dialog keeps "Edit" as its accessible name.

**Design system impact:** the edit sheet in the kits drops its "Edit" heading; its title field is `title-3` semibold in `--text-primary` and its details field `body-sm` in `--text-secondary`.

### 2026-09-26 · The lead and the tools sit on the title line
**Surface:** iOS, Android, web

**Was:** the checkbox, the type glyph, the picture and the pencil and trash centred on the whole row, from the kits' one-line rows.

**Is:** the row aligns at the top and each of them is centred on the title's line, 21px on the phones and 15.5px at 1.35 on the web, by its own margin: the checkbox is that height already, a 36px tile reaches into the row's 8px of top padding, the 17px tools sit two down. With the chip, the meta and the body under the title, what sits on the title line is the row and what sits below it is its detail; centred on three lines, a checkbox floated between lines that were not its own.

The checkbox sits in the tile's slot, 36px on the phones and 32px on the web, so a task's title starts where an event's does; they were indented 15px apart on Today.

**Design system impact:** the kits' `ContentRow` wants top alignment with the lead and the tools on the title line, the checkbox in the tile's slot, and the same for any row that gains a second line.

### 2026-09-26 · Labels: named, coloured groups inside a thread
**Surface:** iOS, Android, web
**Raised by:** the product owner. Drawn in `explorations/labels.html` against `main` at `089949d` and decided over three rounds the same day. Handoff: `handoff/APPLY-2026-09-26-labels.md`.

**Was:** a thread was one flat list. Nothing in the schema or any surface could group things inside it, and `Chip`'s contract mentioned "inferred tags" in moss that nothing drew.

**Is:** a **label** belongs to one thread, is shared with its members, and a thing can carry several; ten per thread, one per colour, 24 characters. It is drawn as `LabelMark` on the row's marks line after the date chip, and as `Chip label` in a filter bar under the app bar with either logic and the picked chip filled in its own colour. Every unlabelled row draws a `tag` tool, a stated exception to "two controls, never three". Many at once starts from the label: a pinned `plus` chip, or holding a chip, opens every thing in the thread with a tick. # in the composer works as @ does. A thread of six or more things with no labels draws *+ Group with labels*. Outside the thread: the mark after the thread's name on Today, the solid as a map pin (split for two), a dot leading a neutral calendar block, dots on the rail. offload applies labels nightly and while filing, says so only in Activity with Undo, and never touches anything a person set, removed, renamed or recoloured. Deleting a label takes it off rows only.

**Considered and not taken:** select mode with a painted selection, dragging a row onto a chip, a paint mode, suggestions in the row sheet, an eight-second repeat, label sections replacing the type sections, a picker in the app bar, a moss strip announcing offload's sort, and label-coloured calendar blocks.

**Design system impact:** `LabelMark` in `components/core/`; `Chip` gains `label`; `tag` vendored, 85 glyphs; `--label-1` to `--label-10` and `--surface-accent` in `tokens/colors.css`, 366 tokens; `readme.md` gains **Labels** and the vocabulary row *label, not tag*.

### 2026-09-26 · Four code entries' design impacts, folded in
**Surface:** iOS, Android, web
**Raised by:** the open impacts on the 26 September chip entry and the 22 September dates, notifications and web-faces entries, closed before the labels handoff so both sides start from one state.

**Is:** `readme.md`'s Dates and notifications section carries the chip's own line and the late wording, Time and Starts, *This browser says*, the digest copy, Activity as a pushed screen with its two leads, the Notifications page with the one permission ask, Today over the thread's row, the wrapping action row, and **a decline writes nothing**, correcting the 22 September design entry. Code wins on Starts on as a Segmented and on Custom's unit as pills. `--surface-accent` is minted. `tokens/fonts.css` declares the web app's five static faces from `assets/fonts/`.

**Design system impact:** the kits' thread row, Activity, Notifications and Today screens are superseded by the code as built and are not redrawn in this pass; `NotificationSheet` and `NotifRow` in the kits are retired.

### 2026-09-26 · The date chip takes its own line, and a late one says how late
**Surface:** iOS, Android, web

**Was:** the chip at the trailing edge of the title line, always, from the 023 entry, naming the day: "Due Thu 24, 3:00 PM". Beside that a long title had a third of the row on a phone and wrapped into five lines of a word or two, which the owner saw on the Pixel's Today.

**Is:** the chip sits on its own line under the title, above the meta, on every surface. A late row says how late rather than which day and drops the time: "Due yesterday", "Due 4 days ago", "Due a week ago", "Due 2 weeks ago", "Due a month ago", "Due 3 months ago"; an event without the prefix and capitalised, "3 days ago". Today, tomorrow, the coming fortnight and the far future read as before. A wrapping row that kept a short title's chip beside it was tried first; Yoga on the phones would not wrap it, so the rule is one line each, everywhere.

**Design system impact:** the kits' row wants the chip under the title, and the 023 entry's line about the chip trailing the title is superseded; the late wording joins the chip's copy.

### 2026-09-22 · Notifications: Activity as a pushed screen, the Notifications page, and Today's agenda, as built
**Surface:** iOS, Android, web

**Is:** the bell on Today is a control with a 44px hit area and a dot, opening Activity, a pushed screen without the plate: newest first under Today, Yesterday and Earlier, the lead a 28px disc, filled for something that reached the phone and hollow on `--border-lift` for something that did not, the kind's glyph in it, the words as sent, the time, and Not sent as a sentence-case tag, `--text-noticed` and a door to the setting where a setting or the permission caused it, `--text-tertiary` and inert where the product chose. The Notifications page in Reaching you: Due today with "One message each morning.", In the morning at, Tomorrow with "One message each evening.", In the evening at, Connection requests, Added to a shared thread, and System settings with "Sounds, the lock screen, and turning offload off entirely." Today's three groups reuse the thread page's row with the thread's name as its meta, and the two empty states.

**Where the code diverged, and why.** Activity is a pushed screen rather than the kit's roll-down `NotificationSheet`, and the kit's `NotifRow` gives way to the exploration's lead-and-tag row. The Communication settings page is replaced by Notifications, its quiet hours, email, push and weekly summary dropped, and the evening switch reads Tomorrow. The request body carries no pronoun and the share body does not repeat the thread's name; no line carries the retired noun, and group labels and the tag are sentence case. Today's rows reuse the thread page's row rather than the kit's `PriorityRow`, and every control on them acts in place on all three surfaces, with the thread page's sheets, words and Undo: the tick, the pencil into the edit sheet, the trash, the swipe's Archive and Delete, and on the phones a long press into an action sheet of Edit, Mark done, Open the thread, and Delete or Archive; When and Move stay on the thread page. The thread's name is a meta line of its own under the title, so the body and a link's domain keep their place. The sent lead is the exploration's disc on `--surface-fill` with a `--text-secondary` glyph, the hollow lead stays on `--border-lift` with a `--text-tertiary` glyph, and Not sent is the exploration's chip with a ground, on `--surface-noticed-soft` in `--text-noticed` where a setting or the permission caused it and on the fill in `--text-tertiary` where the product chose, 10.5px medium. The row's time takes the numeric role in `--text-tertiary` and each row carries the hairline. A failed save says "Couldn't save that" with Try again beside it, announced as an alert on every surface. The web's hour is a native time field drawn in the row's own type and height where the phones and the mock open a picker; the web's share row opens My threads, where the invitation card is, because the web has no invitation route. An event in a one-thing digest carries no verbs where the apply note gives every one-thing digest two, and a digest whose only row is overdue carries none either, because the overdue sentence counts a row and never names it. The readme's Activity list names a declined request, which nothing writes yet. The Notifications page offers the one permission ask when the system was never asked, which the mock does not draw. The Android small icon is the app's own until a monochrome mark is added, and its accent in `app.json` is `--moss-600` typed as a hex, because the file cannot read a token; the semantic is `--text-accent`, whose dark value differs, and the shade is usually dark, so a token read at build time is the follow-up. The design entry of 2026-09-22 on `main` says a decline is recorded; nothing writes one, by 022's rule that a decline sends nothing and interrupts nothing, and that sentence is amended in the same change as this entry.

**Design system impact:** the kits' `NotificationSheet` and `NotifRow` want replacing with the pushed Activity screen and the exploration's lead-and-chip row as drawn above, with the hollow lead on `--border-lift`; the Communication page wants replacing with Notifications as above, with the failure line and its Try again; the Today kit wants the three groups over `ContentRow` with a meta line for the thread's name and the row's own controls; the digest copy in the exploration wants "Answer in My people." and "Ana added two to Lisbon trip" without the noun; a line on the one permission ask in the undetermined state; and the sentence on declines in the 2026-09-22 entry wants correcting to "a decline writes nothing".

### 2026-09-22 · Dates: the chip, the When sheet, the strip and Date and time, as built
**Surface:** iOS, Android, web

**Is:** the row draws its date as a chip at the trailing edge of the title line, late in the clay soft ground, soon in the amber one, plain past that, and a done row loses the colour; a bell mark on a reminder. The edit sheet holds the title, the details, When and Repeats, and Remind me only while a row is one. When opens a grid with today outlined and the pick filled, All day and the platform's hour, Ends at on an event, seven presets and Custom. The strip on Today says "Showing times in Lisbon. This phone says Tokyo." with Use and Keep inside the card; the web says "This browser says". Date and time sits in The app above Appearance, with Starts on moved out of Appearance on every surface.

**Where the code diverged, and why.** Two aliases were minted for the chip's soft grounds, `--surface-noticed-soft` and `--surface-danger-soft`, because the code may not consume ramps. The strip's disc is `--text-accent` as a background, because the tokens name the accent only as text and the handoff names the same ramp step for both. Week starts on is a `Segmented` under a heading rather than the mock's Week group with a Starts on row. Custom's unit is four pills where the mock draws a select. The Android hour row says Time on a task and Starts on an event. The edit sheet's three pills wrap at an accessibility text size, seen on the simulator. The mock's dashed slot for a row with no date is not drawn, per principle 04. The action sheet's When row says "Fri 25", not the chip's "Due Fri 25", and is offered to every member as the sheet behind Edit is. "Every weekday" carries no trailing "Mon to Fri" note.

**Design system impact:** the two soft aliases are in `tokens/colors.css` already. Worth carrying into the kits: a solid accent surface alias, since two components now paint the accent as a fill; the strip's web wording; the Segmented under a heading for Starts on and the pills for Custom's unit, or a ruling that the mock wins; the Time versus Starts label by type; and the note that a sheet's action row must wrap at large text.

### 2026-09-22 · Two soft grounds for the date chip
**Surface:** iOS, Android, web
**Raised by:** 023, building the date chip the apply note of the same day specifies.

**Is:** `--surface-danger-soft` over `--clay-100` and `--surface-noticed-soft` over `--amber-100`, in all three scopes, for the chip's late and soon grounds.

**The apply note said no new tokens, and named two ramps.** `--clay-100` and `--amber-100` had no alias: `--surface-noticed` is the solid amber and `--text-noticed` its ink, and nothing sat beside them as the soft fill. Code may not consume a ramp, `pnpm lint` reads the generated rule file to make sure of it, so the choice was a third literal or an alias. An alias, as the rail's lift and the two dangers before it.

**Design system impact:** two tokens, 351 in all. The kits' chip, when it is drawn, reads these rather than the ramps.

### 2026-09-22 · Due dates a person can set, and the two digests that read them
**Surface:** iOS, Android, web
**Raised by:** the product owner, ahead of the notifications and due-dates feature. Read off `main` at `b494d0e`, drawn in `explorations/due-dates-and-notifications.html`, decided the same day. Handoff: `handoff/APPLY-2026-09-22-dates.md`.

**The schema has carried dates since 001 and no person has ever been able to write one.** Every date in the product was inferred by a model from a dump: there is no field, no picker, no gesture and no way to clear one on any surface. Notifications forced it, because a notification fires off a date and a date nobody can correct is a notification nobody can stop.

**One field called When, and the row's type decides the column.** A task writes `due_at`, an event writes `occurs_at`, everything else writes `due_at`; duration is the existing `occurs_end_at` and is offered only on an event once an hour is set. **A due date may now carry an hour**, which makes `dates.ts`'s comment that a due date has no time anybody expects to see wrong: "call the clinic at 9" and "rent by Friday" are both tasks. No column changes, since `attrs.all_day` already carries the distinction.

**Recurrence becomes an RRULE, and that is the largest thing here.** The picker follows Google Calendar's presets and Custom dialog, because 019 already writes to a real Google calendar and a vocabulary that survives that trip needs no translation. `repeats` is an enum of six values with `repeats_until` beside it, and it holds four of the seven presets and none of Custom: **no interval, no weekday set, no monthly anchor, no occurrence count.** One RFC 5545 column replaces both, the six existing values map into it losslessly, and `add_content` and `add_note` take a rule rather than the enum. **A schema decision that arrived wearing the clothes of a menu.**

**The control lives in the edit sheet and nowhere else.** The row draws its date and does not act on it: the row's own comment says two controls, never three, and adding a calendar icon beside the pencil would have drawn two calendars meaning different things. The dashed "Add a date" slot on undated rows was rejected outright, principle 04 spent real effort making offload not ask for dates nobody gave, and a to-do list wearing a row of unanswered questions undoes it.

**The chip is coloured by nearness:** `--clay-100` with `--text-danger` for late, `--amber-100` with `--amber-700` for today plus three days, the plain fill for everything later. Amber rather than blue for soon, because blue is the attention colour and would read as offload asking for something. **A done row loses the colour entirely.**

**`accounts` gains three fields, not one.** A default `time_zone`, a `last_seen_time_zone` written by any request carrying the device's zone, and a `follow_device` preference. When they differ, a strip on Today states the fact before offering the change, with both answers inside the card as tinted text buttons. Once per zone, not once per day.

**`is_reminder` finally has a reader, and it gates both digests.** The flag has sat unread since 001 with a comment saying nothing acts on it until notifications ship. A date is not announced; a reminder is. **Most dated rows are therefore silent and an empty digest is the normal morning.** Two consequences worth stating: the filing prompt's decision to set the flag is now load bearing where it was free, and wants a principle and eval cases; and **a person can set a date but cannot ask to be reminded of it**, since the flag has no person-facing writer. A read-only `bell` mark on the chip discloses which rows will be announced, because otherwise two identical-looking rows behave differently on Friday.

**Two sends a day and no per-item pushes**: today in the morning at 8:00, tomorrow in the evening at 19:00, both in the account's zone, both skipped when empty. One copy template with three arms, one thing named, two to four listed, five or more counted after the first two. **A digest carries no actions**, because Done is about one thing and a digest is about five; **a digest holding exactly one thing is not a digest** and gets Done and Tomorrow. Tomorrow writes a date, so there is no notification-level snooze anywhere. Another member's row is named with its author, as *Ana's ferry times*.

**The bell becomes Activity, and this reverses 022.** That work refused a notifications page as "a page that exists to hold a dot" and was right at the time. What changed is that there is now content: alongside what was sent sits **what offload decided quietly and never said**, an expired invite, a calendar write waiting on them, a closed question, a declined request, and any digest a switch or a permission suppressed. Some of that exists nowhere else in the product, and it is the only way to read your notifications when notifications are off. **A decline writes nothing**, as built: the people rule holds where it was aimed, nothing is sent, nothing interrupts, re-requesting stays rate limited, and Activity carries no line for it. (Amended at 024's merge on 2026-09-26; the entry first said a decline is recorded.) Thirty days, then it purges. A dot, never a count. **No Due sheet: forward-looking "what is due" is the Timeline's job.**

**Nothing is sticky.** The model may overwrite a date a person set where the dump states a new one, unlike notes, where corrections beat inference. The defence is the existing change mark and an Activity row, both of which already exist.

**Design system impact:** no new components, no new glyphs, no new tokens. The work is a column on every content row, two rows on the edit sheet, one new sheet, one Today strip, one settings page and one Activity list. `readme.md` gains a **Dates and notifications** section.

### 2026-09-22 · The web serves its own faces, as static instances
**Surface:** web
**Raised by:** the security review of 2026-09-22, M16. Every page linked the two faces from the Google CDN, which sent every visitor's address to a company the privacy page does not name, on a page that says nothing follows a visitor anywhere.

**Was:** `tokens/fonts.css` imports Instrument Sans 400..700 and Literata `opsz,wght@7..72,400;7..72,500` from `fonts.googleapis.com`, and the web app's layout linked the same stylesheet.

**Is:** the web app serves five files from `/fonts`, `@font-face` in `globals.css`: Instrument Sans 400, 500 and 600, and Literata 400 and 500, the static instances the phones already ship from `@expo-google-fonts`. No request leaves for a font. What this gives up is Literata's optical size axis: the static instances are cut at one size, so a heading in Literata is the text cut scaled rather than the display cut. Variable files from the families' own repositories would restore it and are a download nobody has done yet.

**Design system impact:** `tokens/fonts.css` should carry the same five `@font-face` rules against a `/fonts` path, in place of the CDN import, so the kits and the app declare the faces the same way. Note the optical size loss beside Literata in `readme.md`'s type section until the variable file is in.

---

### 2026-09-22 · Sharing, built, and what the build found past the planning entry
**Surface:** iOS, Android, web
**Raised by:** `docs/specs/022-sharing`, built in a worktree and merged to `main` at `5dfc162`. The planning entry below this one holds the fourteen divergences decided before the build; this is what the build added to them.

**Was:** the planning entry's list.

**Is:** that list, plus these, each for a fact the drawing could not carry or a review found.

1. **The lookup answers with the mark inline.** A stranger's mark has no route the viewer may read, so the found row on Add a connection drew an empty circle; the lookup now returns the PNG as base64 and the client remembers it until the person becomes visible. No drawn change.
2. **The dot on the gear is the session's, not a screen's.** `/api/me` carries `requestsWaiting`, refreshed on focus, so Today and the settings row agree and the phones' gear does not need a fetch of its own. Drawn as the planning entry says, an 8px clay dot in a paper ring on the bare glyph.
3. **The Blocked group has no label.** The people page's third group is the one row "Blocked", a door to the list, since a labelled group with a single row that names itself was two words for one thing. Connected and Pending keep theirs.
4. **The share sheet's slide mounts once its rows exist.** With Reanimated's entering animation, a sheet mounted on its loading state froze at first layout on the simulator; the code holds the slide until the members or the failure line arrive. Nothing visible changes when it works.
5. **Dates on the people rows are "4 Aug"**, day then month, no year, matching the timeline's own short form, where the kit wrote "Aug 4".
6. **The person page's mark is in the pane head's title slot** on the web, 36px beside the name, since `PaneHead` has no lead of its own and the kit's `WPerson` drew the mark above the title with nothing to hold it.
7. **The relation line gains a sixth value.** The security review found the tell blocking was meant not to have: a co-member who had blocked you was a blank mark on the pane head, and a share waiting on somebody drew a blank face on the sheet. The one rule now sees a blocker exactly as far as what the block left standing, and sees somebody a thread is waiting on, one way; the person page says "Waiting on a share" for the latter.
8. **Not now leaves a word behind.** In Add a connection, a request answered Not now from the found row says "Not now" in the value slot rather than offering Request, which the server would refuse; and a request refused by the seven-day rule says "You asked recently. Try again in a week." under the row. The Block confirmation lists no threads, since Block touches none.

9. **The answer's turn carries the thread's pill.** Tapping a name on "which Sam?" shared the thread and left the turn bare: no Done mark, no pill, nothing on screen saying where it went. Every answer that changes a thread wears it, and this one now does, which is also the way back to the sheet where the share waits.

**Design system impact:** `Sharing.jsx`, `WSharing.jsx` and `M3Sharing.jsx`: the found row's Not now state and the seven-day line; `SettingsDetail.jsx`'s people page: Blocked as one unlabelled row, dates as "4 Aug"; `PersonScreen.jsx` and `WPerson`: the relation line's sixth value and the mark in the web pane head; the Block confirmation without a thread list. `Avatar`'s contract is unchanged.

---

### 2026-09-22 · Sharing, planned against the people note, and what the code will do differently
**Surface:** iOS, Android, web
**Raised by:** `docs/specs/022-sharing`, planned on `main` from `handoff/APPLY-2026-09-21-people.md`, `explorations/sharing-and-avatars.html`, `Sharing.jsx`, `WSharing.jsx`, `M3Sharing.jsx`, `PersonScreen.jsx`, `SettingsDetail.jsx`'s people page and `components/core/Avatar`. Logged at planning so the kits can move while it is built; the build's own entry follows.

**Was:** the note and the kits as they stand.

**Is:** the note, with these differences, each for a fact the drawing could not carry.

1. **Take out is built as drawn**, and it cost the privacy policy a paragraph and the constitution an amendment. The product owner chose it over the alternative the code recommended, which was an x that only withdraws a waiting share.
2. **The `people` page's first group is `Connected`, not `Sharing with you`**, and a connection who shares nothing has a row with the note "Nothing shared yet". The note's own owed list asked for the second label; this is it.
3. **The Pending row's value is `Withdraw`, not `Remove`.** Remove ends a connection and Take out ends a membership; a third destruction needs a third verb, and the row's tap opens a confirmation, since the lead beside it is a door and a mis-tap would cost a week under the seven-day rule.
4. **`Leave` joins a shared thread's More menu.** The Remove copy says "Leave a thread from its own More menu" and no kit draws it there; the code will, confirmed, only on a thread with more than one member. On a thread you are alone in the swipe's Delete stays the whole story.
5. **In the share sheet the lead is the door and the row is the tick.** `Sharing.jsx`'s row tap toggles the checkbox; the note's rule says every avatar opens the person. Both hold: a 44px hit on the mark opens, a tap anywhere else ticks.
6. **Every list inside a confirmation is two rows and a count.** "The 3 threads you already share" lists two and "and 1 more"; "What she added stays" lists her two most recent and "and 12 more". A member with two hundred rows made the drawn sheet unbounded.
7. **The invitation shows who is already in**, by name, under the count line. The policy now promises you can see who is in a thread before you add anything, and the drawn screen did not say.
8. **The mark carries no letters.** The PNG is the prism alone; each surface draws the initials over it from the current name, which is what `Avatar.jsx`'s span does and what lets a rename change the letters without touching the picture. Drawn on first read rather than at signup, invisibly, since it is a function of the id.
9. **A said share is a proposal with no Undo**, the reply carrying "Share Lisbon trip with Sam?" with Share and Not now and the co-ownership line under it. The readme's "answered in offload's voice with an Undo" is an OFF-6 divergence: sharing is a message to a person.
10. **Not drawn, each for having nothing behind it:** the `people` page's Defaults toggles ("Let people add to my threads" is a second permission; "Tell me when someone opens" is a notification), `WSettings.jsx`'s receiving pick, `WPerson`'s Message tool, and `PersonScreen`'s Waiting on you, Waiting on Ana and What offload knows. They arrive with their features.
11. **The strip's copy stays as each kit has it**, "Ana shared Lisbon trip" on the phones and "with you" on the web, and the card keeps the kit's `Look` over the exploration's `Open`.
12. **Marks on the web are 36 and 56** where `WSharing.jsx` draws 34 and 40, which are not sizes the design gives; and the web's faces exclude you, as `WFaces` does and the code's pane head did not.
13. **The dot is drawn on a bare glyph.** The code's bars draw the gear and the bell as glyphs rather than `IconButton`s, so the 8px clay dot in its paper ring lands on the glyph at the same corner.
14. **Nobody can decline a waiting share, and three may wait per pair.** Not now waits, as the readme says. The security review asked for a silent decline; the cap bounds the nuisance instead, and `declined` stays in the schema unwritten.

**Two facts for the drawing:** a person with no display name is "Someone" in every sentence and "?" in every mark, which is what a thread member with no name is already called; and the code's `Row` on the phones has no lead slot, so `PersonRow` is the first settings row to need one.

**Design system impact:** `SettingsDetail.jsx`'s people page (the group label, the note, the Withdraw value, no Defaults); `Sharing.jsx`, `WSharing.jsx` and `M3Sharing.jsx` (the lead as a door, marks at 36 and 56, the member names on the invitation, two-and-a-count in every confirmation); the thread screens' More (Leave); `PersonScreen.jsx` and `WPerson` (the relation line under the name for a non-connection, the empty state, More holding Remove, Block or Unblock); the readme's Sharing section (a said share is a proposal). `Avatar`'s contract is unchanged: the picture under the span is the server's rather than CSS, which the contract does not see.

---

### 2026-09-21 · The three apply notes, built the same night, and what the code could not do as drawn
**Surface:** iOS, Android, web
**Raised by:** `handoff/APPLY-2026-09-21-voice.md`, `-owed.md` and `-people.md`, applied on `main` the evening they arrived. The people note is the next feature's spec and waits for it.

**Was:** the code as 021 left it, and the owed screens as the 18 to 20 September entries built them.

**Is:** the voice note as the note draws it: `SentVoice` is the contract's component, told what to draw, over a `VoiceNotePlayer` that owns the audio on each platform; play then pause; tertiary at rest, attention over `--ink-300` while playing; the failure pattern with the dismiss `x` and the clay border on a blue bubble. The owed screens as drawn: the launch screen from the design's own `mark.svg` through a script that refuses when `app.json` drifts from the tokens, the holding screen with the spinner placed from the screen's centre, `--surface-viewer`, the white bar and white status bar over the plane, the move sheet with its lasso and its Cancel and its one-thread sentence, the link row as a door with `arrow-up-right`, the day's calendar event as `EventLine`, the phones' photo sheet as `RowActionSheet` with no Cancel row, the people chips gone from the thread head, and the two Android overrides back on the shared tokens.

**Three things the code could not do as drawn, each for a fact the drawing could not carry.**

1. **The web viewer's caption stays a raised card.** It holds the row's title as a field, the body and the confirm, and white text on the plane has nowhere to put a field. The phones' caption is white on the plane as drawn.
2. **The native splash follows the OS, the holding screen follows Settings.** A new account opens light whatever the device says, and the platform splash cannot know that, so on a dark device with the app set to light there is one hop at the handover. The handover only happens past 1000ms, when the spinner is due, so a fast cold start never sees it.
3. **A derived tag cannot be accent yet.** The wire carries a thread's tag dimension and no fact about which values offload derived, so every chip in Files draws plain until the API says.

**Two facts the wire settles for the drawing:** another member's calendar is already named by their display name on the event, so the caption is one string on every event; and nothing writes a thread's standing yet, so its attribution has no date to carry until something does.

**Design system impact:** none to the components. The web kit's `WThing` is no longer reachable from a link row on the web, since the row opens the page; the kit should show the detail for a link opening from somewhere else or not at all.

---

### 2026-09-21 · Voice notes, and eleven items logged against the kit
**Surface:** iOS, Android, web
**Raised by:** 021 on `main`, whose feature spec logs eleven items against this system. Drawn in `explorations/voice-notes.html` and folded in the same day.

**A voice note is words, and that is the whole architecture.** Once offload has written it down the message is a text message to the classifier, the filing turn, the tail, 018's judge, search and 013's answering, and none of them has a rule of its own for voice. So the feature adds a composer state, a bubble and a transcript, and no new screen.

**Three of the eleven were the kit being wrong rather than behind.**

1. **Typed words were hidden while being sent.** The kit replaces the whole field when recording starts, so anything already typed vanished from the screen and went with the note anyway. They stay drawn above the row now, static, primary ink, three lines. **Text you cannot see being sent is the one thing a composer must never do.**
2. **`SentVoice`'s bars were an opacity ramp over a retyped ramp step.** Every bar was `--ink-950` with opacity climbing left to right, so a note appeared to fade in from silence whatever was said, and read as a fill that was always half played. Its fallback drew 26 bars from a sine where the composer's own constant is 32.
3. **The discard control said "Discard recording"**, the one noun the vocabulary bans, in the one place it would have been read aloud.

**Two decisions the drawing produced, both about the played state.** The product owner asked for a play glyph and a more prominent played colour. **The glyph became the control**, `play` at rest and `pause` while playing, since a microphone there says record. And the prominent colour turned out to need its opposite: `--text-attention` measures **1.21:1 against a tertiary remainder**, so the boundary between played and not was the invisible part. **The remainder recedes to `--ink-300` only while playing**, where there is a fill to read it against, and a resting row keeps `--text-tertiary` at 4.76:1, dimming it there would have cost the default state of every note three points of contrast to buy legibility in a state it is not in.

**The transcript is in the person's own bubble and their own face.** `--font-core` at `--text-secondary`, 6.24:1 light and 7.65:1 dark, with the reply below it in `--font-quiet`. **Two faces a line apart is what makes the transcript read as a record rather than an answer.** The spec listed the dark contrast as needing a device and it did not: it is measurable, and it passes.

**One failure pattern, and one exception worth stating.** The clause is the state and the control is the exit: 13px `--text-danger` with the way forward in `--text-accent`, under the composer with a dismiss `x` on every line, or below the bubble on a failed turn, and the bubble keeps its `--blue-50` fill with only its border going clay, so the readme's "a refusal is a sentence, not an error state, no warning colour" holds. **The exception is "Not here yet."**, the playback failure, which sits inside the note with no control at all because the row above it is the retry.

**And the rule about Android was read the right way round, twice.** Drawing this pass I gave the composer pill and the sent bubble Material tokens, and both were wrong: `M3Composer.jsx` keeps the shared pill and `Conversation.tsx`'s `Yours` has no Android branch at all. **"An Android override that is not an `--a-*` token is almost certainly wrong" does not mean every `--a-*` token is right.** What does diverge is the platform's own chrome, the status bar and the gesture bar, which is not the product's to share.

**Design system impact:** `SentVoice` in `components/conversation/`. `play` and `pause` vendored as the 83rd and 84th glyphs, in Lucide's stroke format. `readme.md` gains a Voice notes section. `handoff/APPLY-2026-09-21-voice.md` carries all eleven items per surface and per theme.

**Owed:** the composer's recording row at the largest text size with three lines of words above it, which is the tallest that pill can get and a layout question rather than a device one; and the composer's own recording state as a component, which is drawn here but lives in three kits.

---

### 2026-09-21 · Connecting, and a person gets a face
**Surface:** iOS, Android, web
**Raised by:** the product owner, off `explorations/sharing-and-avatars.html`. Seven items, decided item by item.

**The product had sharing in fragments and no account of connecting at all.** A share sheet, a `people` settings page, a `PersonScreen`, and nothing that said how two people become connected in the first place.

**Email only, exact and case-insensitive, because accounts have no usernames.** That settles a question I had drawn as open: one full email returns one account or none, with no partial match and no name search. **A name search over real people is a directory whether or not it is called one**, and an email is something you can only have if they gave it to you. The found row shows the address as the account stores it rather than as you typed it, which is what confirms the match was case-insensitive rather than lucky.

**Request, not invite**, and that breaks the shipped kit: `SettingsDetail.jsx`'s `people` page has an *Invites* group with **Resend**, and an invite to somebody who is not on offload cannot be resent because it was never sendable. **Pending**, with **Remove**, and it gains the 32px prism every other person row here has.

**A request is answered on the card and there is no notifications page.** The accept screen I drew is withdrawn, and so is the page I drew after it: a request is answered on its `PendingInvite` card and listed under Pending on the `people` page, so a third place to read the same two facts would be **a page that exists to hold a dot**. A shared thread still opens instead of answering inline, because a thread has content to preview and a connection does not.

**One dot, in two places, and it is a prop that already ships.** The gear in the `AppBar` and My people inside Settings, using `IconButton`'s `badge`: 8px `--clay-600` inside a 1.5px `--paper` border, which the bell beside it already passes. **There is no Settings tab**, which is what my first draft assumed. **Only a request needing your answer dots anything**, your own pending requests do not, because nothing is waiting on you.

**Removing a connection leaves shared threads untouched**, of three options drawn. It is the only one that does not lie about what a thread is: a thread with three people in it has nothing to do with whether you and one of them are connected, and the alternative destroys things you never chose to give up. **The cost is in the copy and the copy is load-bearing**, "removed" does not mean "no longer shares things with me", so the second sentence must not be cut. It is also **the one action in the product with no Undo**, because the other person's copy changes at the same moment.

**`Avatar` is new, and the facet is not decoration.** The kits hand-rolled an initials circle in five places. Two measurements decided the algorithm. **The lightness ceiling is 0.52, not the 0.56 I first wrote:** at 0.56 the lightest hue in the wheel put white initials at **4.16:1**, one person in twelve with a monogram that fails and no way to fix it afterwards. And **twelve hues alone is not enough:** twelve accounts land on **eight** distinct hues, so a third of a list of twelve shares a colour. That is what picks the facet split over the sweep, a hard edge at one of eight angles is the only structure that survives 36px, and it takes that list from 8 distinct avatars to 12.

**Every avatar in the product is between 28 and 56px**, three of the five at or under 36, so the mark is scanned and never studied. **88px, which an earlier draft of the exploration used to argue two options were beautiful, is a size the product draws nowhere.**

**Design system impact:** `Avatar` in `components/core/`, with the seed, the two constants and the two wheels in its contract. `readme.md` gains **People, and connecting** and **The prism avatar**. `handoff/APPLY-2026-09-21-people.md` carries it per surface.

**Owed, and larger than this entry:** the kits' five hand-rolled initials circles want replacing with `Avatar`; `SettingsDetail.jsx`'s Ana row is hardcoded and disagrees with `data.js` on both the thread count and the month; the *Sharing with you* group has no row for a connection who shares nothing, which is a common state since a connection outlives the thing you made it for; and nobody has seen a 36px prism at a real phone's pixel density.

---

### 2026-09-21 · The launch screen, the viewer, and six screens the kits owed
**Surface:** iOS, Android, web
**Raised by:** the product owner, off `explorations/launch-and-viewer.html`, after the 21 September pull listed them as owed.

**The launch screen had no entry because nobody had designed it**, and since 20 September it is held for a whole `/api/me` round trip on every cold start. **The mark alone on `--surface-page`**, 216pt on iOS and 192dp inside Android's 240dp canvas.

**Two findings came out of drawing it, and both are traps rather than preferences.** First, **the mark is `--text-primary`**: both ramps invert in dark, so `--paper` there is #191919 and a mark set to it measures **1.02:1** on the page. Second, **no platform splash takes a spinner**, iOS gives a colour and one static image, Android gives a colour, an icon and its own reveal, so a spinner after a second is a second screen the app draws on handover, and **the seam is the whole risk**: the spinner must sit outside the centring flow, or its box re-centres the mark and every cold start blinks.

**`--surface-viewer` minted, and dark is opaque.** A translucent plane cannot separate from a near-black page: `--surface-page` at 92% over `--surface-page` measures **1.00:1** and even the darkest value reaches 1.11:1. So light is `--surface-inverse` at 90%, which composites to about #232323 and reads as depth, and **dark is `--surface-plate` at full opacity**, where what says a viewer is open is that the screen behind it is gone. Everything on the plane is `#FFFFFF` rather than `--text-inverse`, the status bar included, because ink-inverse flips to dark text on a dark plane.

**`arrow-up-right` vendored as the 82nd glyph**, for a link row whose primary action is opening the page. A rotated `arrow-up` would have left an implementer with no slug to call, which is the same reason `grip-vertical` was vendored on the 16th.

**A link's row is a door.** Tapping it opens the page; it was opening a detail screen with the page a second step. A link is the one row in the product whose content lives somewhere else.

**One conflict the kits have to resolve, not the designs.** A to-do is drawn as a `ListRow` with a body, and both phone kits still draw it as a standalone `Checkbox` in a gapped column. Code's 20 September entry settles it the other way twice: it centres the phones' `ListRow` leading and trailing, and it says a to-do draws its body under the title, which `Checkbox` has no slot for. **The kits' task list is what moves.**

**What the pass mostly was, though, is components being read rather than recalled.** Sixteen governed components and kit pieces were drawn from memory and then corrected against source: `SectionHeader` was a different object rather than a smaller one; `FilesWidget` lives in `ThreadWidgets.jsx` and its derived tags are accent with `sparkles`; `DayAgenda` already had an `EventLine`, so a calendar event is that line with two additions rather than a second one; both kits ship their own `StatusBar` and they differ on purpose; `RowActionSheet` in the android scope already **is** the M3 sheet, because `--radius-sheet` resolves to 28 there. **The rule this pass earns: an Android override that is not an `--a-*` token is almost certainly wrong**, since that scope redefines only those, the radii and the heights, two invented ones had a divider token doing a control's job at 1.29:1.

**Design system impact:** `--surface-viewer` in three scopes. `arrow-up-right` vendored, 82 glyphs. `ListRow.jsx` renders the `body` its contract documents, which was written last session and never implemented. `readme.md` gains Launch screen, Photo viewer and Move sheet sections. `handoff/APPLY-2026-09-21-owed.md` carries it per surface and per theme.

**Still owed:** the move sheet and viewer as components rather than mocks, and the two states nobody has asked for: what the holding screen does when `/api/me` never answers, and a set of one.

---

### 2026-09-21 · Twelve entries from code, one of them reversing this system
**Surface:** iOS, Android, web
**Raised by:** `handoff/FROM-CODE-2026-09-21.md`, the entries written since the 16 September pull.

**The one that matters most is the reversal.** On 16 September this system specified a second line under each of the two declining replies, saying which state it was in. Code withdrew it on the 18th and was right. "Can't search that." is the refused-subject line, said when the dump is about politics, weapons, self-harm or sex, **and it is said whether or not the web switch is on**, so "Searching the web is off in Settings." would have been untrue every time it appeared. "Not sure." covers four states and the proposed line is right in one. **The honest version would have offload diagnose itself, which it does not do.** `handoff/APPLY-2026-09-16.md` item 9 is struck in place with the reason, `readme.md` states the four states instead, and `explorations/asking-and-arranging.html` records that its option A is what shipped.

**A second reversal, of the smaller kind.** The 17 September entry said a row's controls centre on the web and nothing moves on the phones. The 20th reverses it: the product owner looked at a two-line row on an iPhone and the phones' two-point nudge read as misaligned there too. **Everything in a row centres on the row, on every surface.** `Checkbox` keeps its own first-line alignment for a standalone tick with a label; inside a `ListRow` the row's centring wins, which is now a line in the contract.

**`Toast` gains its second form**, the one component change in this pass. The failure: one clause and a Retry, per action rather than one generic line, carrying `role="alert"` because a write that did not land has to interrupt rather than wait its turn. **Not red and not an error state**, since a toast is offload reporting and offload reports a refusal in the same voice as a success. With it, the rule behind it: **a write is drawn at the press and the request follows, and Undo is offered the moment the change is drawn**, not when the server answers, because the eight seconds are the person's.

**The loading rule held under pressure and is worth recording as held.** A fading sweep was asked for and declined: a row typed in already has a treatment for "the server is still reading this", and drawing that row a second earlier is the whole of the placeholder. `readme.md`'s *Filing* state gains the sentence that it is also what a row looks like before the server has it.

**`ListRow` gains `body`**, a to-do row's own words under the title, two lines at most. The contract had only `meta`, which is what offload knows about a row; `body` is what the row says. The phones have drawn it since 009 and the web widget rows gained it on the 20th, so the contract was the last thing to know.

**`AppBar` goes to three tools with the criterion** the web pane head took on 18 September: a tool earns a bar slot only if it changes what offload reads or shows, and anything that acts on the thread goes in More. The phones' thread head becomes one line as a consequence, which is drawing this system owes.

**The app icon inverts:** a white tile at #FFFFFF, not paper, since a home screen is not a page, with the mark in ink. The web favicon keeps the ink tile, being the one version that reads on both a light and a dark browser chrome.

**Design system impact:** `Toast.jsx` and `.d.ts` rewritten with the failure form. `ListRow.d.ts` gains `body` and the centring rule. `AppBar.d.ts` goes to three tools. `readme.md`: the two declining paragraphs replaced, *Filing* and *Loading* amended, the write-at-the-press rule added, and the mark's one-colour line excepted for the app icon. `handoff/APPLY-2026-09-16.md` item 9 struck.

**Owed, and none of it drawn:** a launch screen, which has no entry because nobody has designed it and is now held for a whole round trip on every cold start; `PhotoViewer` and `MoveSheet`, two screens in every kit; the phones' one-line thread head; Files as a grid with links leaving it; the day list's calendar event line; Android's photo bottom sheet and the iOS action sheet; and a semantic token for the viewer's dark plane, which is two hand-mixed values today.

---

### 2026-09-21 · A settings value goes under the title when the two do not fit
**Surface:** iOS, Android
**Raised by:** the Pixel 9 at 200% type: the You card stood 350dp tall for one row.
**Was:** `SettingsRow` puts the value beside the title as `flex: 0 0 auto`, and says nothing about a value wider than the space left. In React Native that value took the whole row, the title was laid out at zero width and wrapped one letter per line.
**Is:** The title and the value share one wrapping line. Side by side while both fit, which is every row at the default size, and the value under the title, left-aligned and still one line with an ellipsis, when they do not: an email at 200%, or at 100% on a 360dp phone. A note stays under the pair. The row is otherwise unchanged.
**Why:** The value is the thing the kit already truncates. Cutting the title to keep it whole, or splitting the width between them, leaves a title broken mid-word at exactly the type size the person chose in order to read it. Both platforms' own settings move the value under the title at that size.
**Design system impact:** `SettingsRow` in `SettingsScreen.jsx` and `M3SettingsScreen.jsx`: the title and value in a `flex-wrap` line with `justify-content: space-between`, so the kit shows the stacked state rather than leaving it to the browser.

### 2026-09-21 · The web composer borrows the phones' recording row and sent voice note
**Surface:** web
**Raised by:** 021, building voice notes against `WComposer` and `WTurns`, which draw the microphone inert and text-only turns.
**Was:** `WComposer` draws a mic that does nothing; `WTurns` draws a person's message as text.
**Is:** The web takes the mobile kit's recording row whole, in place of the field: the pulsing dot, the running time, the live window of bars growing from the right at the kit's 3px and 2px pitch, and Discard then Send. The window scales with the row's width rather than sitting 160px wide at the right of a 940px card. The person's bubble draws `SentVoice` between the words and the photos. Enter sends and Escape discards while the row is up, focus moves to Send when the field is replaced, and the live head's Close is disabled while recording.
**Why:** The phones' composer had the whole state designed and the web kit had none; one row on three surfaces beats two designs of it.
**Design system impact:** `WComposer` gains the recording row and the stopped row; `WTurns` gains `SentVoice` under the person's bubble, as it gained `SentPhoto` on 2026-09-18.

### 2026-09-21 · Typed words stay drawn above the recording row
**Surface:** iOS, Android, web
**Raised by:** 021.
**Was:** The kit's composer hides the typed draft when the microphone is pressed and sends it with the note anyway.
**Is:** The words stay drawn above the row as static text at the primary colour, three lines at most with the rest clipped, and go with the note. A recording alone keeps the pill; words above the row or chips beside it open the box, as chips already did.
**Why:** Text you cannot see being sent is a surprise.
**Design system impact:** `Composer.jsx` and `M3Composer.jsx`: the draft drawn above the recording row while it holds any words.

### 2026-09-21 · A stopped note is the row with no dot
**Surface:** iOS, Android, web
**Raised by:** 021's client review: the kit has no stopped state, and a recording that hit ten minutes, a call or the app leaving the screen had nowhere to go.
**Was:** Recording, or nothing.
**Is:** A third state: the time and the waveform stand still, the dot is gone, Send and Discard stay. The absence of the dot is the whole signal, so reduced motion changes nothing about it. A stopped row takes no more photos.
**Why:** "The dot stops pulsing" is signalled by motion alone, and under reduced motion the two states would be identical.
**Design system impact:** `Composer.jsx` and `M3Composer.jsx` gain the stopped row; the readme's composer states gain a sentence.

### 2026-09-21 · The failure lines a voice note can show
**Surface:** iOS, Android, web
**Raised by:** 021.
**Was:** None drawn.
**Is:** On the row, from the server, "Too big to send."; under the composer, "Enough for today." and "Microphone is off for offload." (with Open settings on the phones, alone on the web); on the bubble, "Not here yet." when playback could not start, "Couldn't write that one down." with Try again when the note was never written down, and the 20 September unsent line when the send never landed. Try again on a voice note runs the same turn again on the same note rather than putting anything back in the field, since the audio is on the server.
**Why:** One short clause next to the control that acts on it, and offload never says why.
**Design system impact:** The kits' conversation fixtures should draw the two voice failure lines on a sent bubble.

### 2026-09-21 · `SentVoice` draws thirty two bars over the whole note, stored with it
**Surface:** iOS, Android, web
**Raised by:** 021's reviews: the kit's composer keeps the last 32 samples, 3.2 seconds, and `SentVoice` draws a sine when it is handed nothing.
**Was:** The live window passed through to the sent bubble, or a drawn sine.
**Is:** At stop the device resamples everything it heard to 32 bars, 0 to 255, normalised to the note's own peak, and sends them with the upload; the server stores them and every surface draws the same bars after any reload. A bar is a fixed slice of the note. The bars take `--text-primary`, not the `--ink-950` ramp the kit retypes.
**Why:** A ten-minute note's bubble showed its last three seconds, and bars filling left to right over that would have meant nothing.
**Design system impact:** `SentVoice` in both mobile kits takes 32 bars from data rather than the composer's window; the `--ink-950` becomes `--text-primary`.

### 2026-09-21 · `SentVoice` plays
**Surface:** iOS, Android, web
**Raised by:** 021, the product owner's call that a stored note nobody can hear is a promise with nothing behind it.
**Was:** The kit's `SentVoice` is a static row: glyph, bars, length.
**Is:** The row is a button named "Voice note, 0:14, play". At rest every bar is `--text-tertiary`; a played bar is `--text-primary`, the fill runs left to right as it plays, the length counts down, a second tap pauses, one plays at a time across the screen, and the row is inert while the composer records. Neither accent, since nothing was done by offload and nothing needs you. Through the silent switch on the phones. No scrubbing, no speed, no viewer.
**Why:** The stack said the waveform is part of the product; this is what makes it one.
**Design system impact:** `SentVoice` gains a playing state and a button contract; the readme's conversation section gains a sentence.

### 2026-09-21 · The transcript draws beneath the waveform
**Surface:** iOS, Android, web
**Raised by:** 021, the product owner's call.
**Was:** The kit draws the waveform alone.
**Is:** Once written down, the transcript draws beneath the bars inside the person's bubble, in the bubble's own type at the secondary colour, arriving ahead of the reply; past about four lines it folds with the readme's "Show all". Measured on the web at 6.24:1 light and 7.65:1 dark on the bubble.
**Why:** That is where somebody sees what offload heard, and it is the review a spoken dump gets in place of the one a typed dump gets while being typed.
**Design system impact:** `SentVoice` in both mobile kits and `WTurns` gain the transcript beneath, with the fold.

### 2026-09-21 · Record, from a long press on the app icon
**Surface:** iOS, Android
**Raised by:** 021, the product owner's call that hands-free needs one press.
**Was:** No home-screen actions.
**Is:** One static item, Record, a home screen quick action on iOS with the system `mic` symbol and an app shortcut on Android with a drawable of the mic on white. Choosing it puts the plate's composer into the recording row on whatever screen is up, Today from cold, with no conversation sheet raised; after the gate, first run and the name screen; waiting out a send in flight; releasing a pinned +; asking for the microphone first if never asked.
**Why:** Two taps from the composer is most of hands-free; one press from the home screen is the rest that a screenless intent does not need.
**Design system impact:** The readme gains a line on the home-screen action; neither platform takes the product's own glyphs there, which the kits should note.

### 2026-09-21 · Discard on a note past a minute offers Undo
**Surface:** iOS, Android, web
**Raised by:** 021's project lead review: Discard sits a thumb's width from Send and a nine-minute thought was unrecoverable.
**Was:** Discard throws the note away at once.
**Is:** Under a minute, the same. Past a minute the toast says "Discarded · Undo" for eight seconds and the note is kept on the device until the toast clears.
**Why:** The product's own pattern, rather than a dialog.
**Design system impact:** The composer spec in both mobile kits: a sentence on the Discard toast.

### 2026-09-21 · The Android recording row on its Material pair
**Surface:** Android
**Raised by:** 021.
**Was:** `M3Composer.jsx` draws the row on `--surface-raised` with `--a-on-var` for the time and `--a-on` for the bars.
**Is:** Built as the kit draws it, behind the same `isAndroid` split the composer already carries; the bubble's transcript takes the phones' secondary ink on both platforms.
**Why:** The kit's pair, kept.
**Design system impact:** none.

### 2026-09-21 · A voice note is never a row
**Surface:** iOS, Android, web
**Raised by:** 021, and `decisions.md`'s 2026-08-28 entry on thread wraps.
**Was:** The kits' Files grid draws a paperclip for a `file` and the readme's kinds list carries `mic` as a kind of dumped thing.
**Is:** No row, no tile, nothing in Files. The audio lives in the conversation; the words live in threads as rows, as typed words do. `mic` on a row means nothing writes it.
**Why:** "They are like conversation text essentially." The audio is not what went into the threads; the words were.
**Design system impact:** The readme's kinds-of-dumped-thing list should say a voice note is a message, not a row; the Files grid never holds one.

### 2026-09-21 · Google first on every platform
**Surface:** iOS, Android, web

**Was:** the order flipped by platform: Apple then Google on iOS and web, Google then Apple on Android. The iOS and web order rested on the App Store's rule that Sign in with Apple be at least as prominent as any other option.

**Is:** Google first, Apple under it, everywhere. Same two buttons, same treatment: Apple filled, Google outlined, the same height, both on screen without scrolling.

**Why:** more people arrive with a Google account, and the first button is the one most of them want. The App Store's rule is about prominence, which Apple's guidance spells out as size and not having to scroll; the filled button in the second row meets it. First place was our reading, not the rule.

**Design system impact:** `FirstRun.jsx`'s `SignInScreen`, `M3SignInScreen` and `WFirstRunGate` draw the Google button first. The readme's "Two providers" rule is already reworded on `main`.

### 2026-09-20 · The thread's head is one line on the phones, as it is on the web
**Surface:** iOS, Android

**Was:** `ThreadScreen.jsx` and `M3ThreadScreen.jsx` draw the thread's name as a title-1 heading inside the scroll, with the people chips and a Share chip under it, and a bar above holding back, Share and More. The app followed the kits: the bar carried back and the calendar, the name and the Share chip sat in the scroll and rolled away, and there was no More at all, so nothing on a phone renamed a thread or added a note to one that had none.

**Is:** the bar is the head, one line, the shape `WPaneHead` gives the web: the back chevron, the name, then Share, the calendar when the account has a connection, and More. More holds what the web's ellipsis holds, in its order: Rename thread, Add a note, and Calendars in this thread. Rename opens the same sheet a row's title does; Add a note raises the composer pinned to the thread, which is what the Notes section's `+` already did. The scroll starts at the first section. What stays above it is who else is in and the standing, only when there is either; a thread that is just you with no standing has nothing there.

**Why:** the name in the scroll left the bar nearly empty, spent the top of every thread on a heading a person had just tapped, and the two-level head was the one place the phones and the web disagreed on what a thread's page is. The controls that were missing were missing because the kit's bar had nowhere to put them and the chips under the heading were not it.

**The checkbox, the tile and the row's tools are centred on the row**, on the phones as `ListRow` centres its leading and trailing on the web. The phone row aligned them to the first line with a two-point nudge, which read as misaligned the moment a row had a second line. The 17 September entry below said nothing moves on the phones; the product owner looked at a two-line row on an iPhone and it does.

**Design system impact:** both phone thread kits want the `Standing` heading moved into the `AppBar` as its title and the Share chip replaced by the bar's own share control, with `ellipsis` gaining a menu of Rename thread, Add a note and Calendars in this thread. `Checkbox` keeps its own first-line alignment for a standalone tick with a label; inside a `ListRow` the row's centring wins, which is worth one line in `ListRow`'s contract.

### 2026-09-20 · A write is drawn before it is sent, and a refused one comes back with a word
**Surface:** web, iOS, Android

**Was:** every write in a thread went send, wait, reload, then move the row. A tick was two round trips before the box filled; a rename on a phone held the sheet and the keyboard up for one; a quick add disabled its field until the server answered; a dump's bubble appeared only once the send was acknowledged. Undo arrived after the reload. On the web the thread pane's Undo was wired to nothing at all, so a ticked, archived, deleted or renamed row there never offered its way back, and the app had three separate toasts: the composer's, My threads' own, and that dead prop.

**Is:** the change is drawn at the press and the request follows. Tick, archive, delete, rename, the drag, the fold, a note's edit, delete, mute and move, the privacy switches, the tick inside an answer. **Where an action offers Undo, it is offered the moment the change is drawn**, since the eight seconds are the person's and not the server's; if Undo is pressed before the write has landed it waits for it. Archive, delete, rename, the drag and a note's edit, delete and move offer it; a tick does not, because the kits tick without a toast and the box is its own undo, and the same goes for the fold, mute and the switches. When the server refuses, the screen is put back and the toast says so in one clause with the same action beside it: *Couldn't tick that off · Retry*, *Couldn't archive that · Retry*, and for a refused undo of a row or note write, *Couldn't put that back · Retry*. Per action, not one generic line. The delete toast is the readme's own line, *Deleted, gone in a moment · Undo*, which the mobile row delete gains for the first time. A `+`'s words appear as their row at the press, exactly as the row looks once the server has it, the one spinner and all, with nothing to open or move until the id is real; a typed note likewise. A dump's bubble joins the conversation at the press and, if the send never lands, takes the failed treatment with its own words, **That didn't go through · Try again**, because the existing failed line says the dump is saved and here it is not. The web has one toast, the shell's, floated above the composer as `WApp.jsx` draws it, and the composer's turn Undo and My threads' thread Undo both use it. It also could not be clicked before this: it sat in the composer's block, which turns pointer events off, so every Undo the web offered was dead.

**Why:** a control that waits for a round trip before it moves reads as a control that did not work, and on a phone it reads that way for a second or more every time. The product's safety net is Undo, not a dialog, and Undo does not need the server's permission to be offered. Delete is included because it is soft, eight seconds behind a purge, so drawing it early destroys nothing; the mobile delete gains the Undo the web already had.

**Not a shimmer.** The readme's loading line stands: one spinner, no skeletons, no shimmer. A row typed in already had a treatment for "the server is still reading this", and drawing that same row a second earlier is the whole of the placeholder. Asked for as a fading sweep and declined on that ground.

**Design system impact:** `Toast` gains its second form: the failure, one clause and a Retry, carrying `role="alert"` as the readme's failure rule says, which replaces the Undo it supersedes; and the guidance should say Undo is offered on the press rather than on the reply. The readme's *Filing* state gains a sentence: it is also what a row looks like before the server has it, and such a row offers nothing. The kits' conversation gets the unsent variant of the failed message, on the sent bubble, in `WMisc.jsx` and both phone kits. `WApp.jsx` already draws the one shell-level toast; the code floats it above the whole composer card rather than at the kit's fixed 104px, so it clears a raised conversation, which is worth carrying back. The phones still draw a toast per screen and the shell's; the settings pages gain one, for the switches. The tick inside an answer, which `WApp.jsx` and `M3App.jsx` toast with an Undo, gets the failure word only here, as before.

### 2026-09-18 · Calendars as built: the page, the sheet, and what the mock could not know
**Surface:** iOS, Android, web
**Raised by:** 019, building `handoff/APPLY-2026-09-17-calendars.md` against the code and three reviews of the spec.

**Was:** the note and `explorations/calendars-options.html` as drawn on 17 September.

**Is:** the page and the sheet as the note draws them, with the divergences below, each one from a fact the mock could not carry.

1. **`Shared with you`, not `Shared by Tom Reilly`.** Google's calendar list carries no owner's name, only an address, and another person's address is not a row note. The note says what is true without naming anybody.
2. **The primary calendar is titled with the person's display name**, note `Your own calendar`, as the mock's first row shows. Google names that calendar by the address; the name comes from the offload account.
3. **The group label is `Calendars offload can use` with `4 of 7 in use`**, superseding the section 2 crop that put the address in the label: the address is one line up in the provider block, and the taken page crop already had the label.
4. **`Ask before adding` is one switch for the offload account**, drawn once after the connection blocks rather than inside each, since it is not a fact about a Google account. Its note reads *Off means offload adds it without asking, unless somebody else would see it.*: the drawn line, "lands straight on the calendar", is untrue when the calendar has more than one participant, when the event has guests, and when the thread has picked none or two.
5. **A second `Sign in again` state.** A connection whose grant lacks the new sharing scope keeps syncing and shows 012's row with its own note, *offload needs one more permission: to see who can see each calendar. Until then it checks with you before every write.*
6. **The sheet's captions grow two states and a line.** "none of yours, another member's" reads *offload is not reading any of your calendars for Lisbon trip.*; a shared thread carries *Everyone in Lisbon trip sees what is on them.* as a second line in every state; under the rows, *Ana reads 1 calendar here* counts other members' picks without naming their calendars. A row note carries the account's address when two rows share a name.
7. **Web's popover carries the caption too**, on the More menu's own shell with `role="group"`, which the web crop drew without one.
8. **Two lines no kit draws, named as new.** In the day's list under the rail, a calendar's event: the calendar's colour dot with its hairline ring, the title, the time or `All day`, and the calendar's name as its note, with no checkbox, no tools, no swipe and no sheet. And in the sheet of a person with no approved calendars, the caption *offload has no calendars to read yet.* over one row, *Approve a calendar in Settings*, which opens Connected apps.
9. **The rail is earned by a pick as well as by a dated row**: a thread with a pick and nothing dated shows this week. The span stays the thread's own.
10. **The thread's More row is web-only for now.** The phones' thread bar carries the glyph alone; there is no ellipsis there yet.
11. **Disconnect confirms once**, with the confirmation deleting a thread uses, and its note reads *Notes offload made from your days stay. offload stops reading your calendars and cannot add to them.*, because threads no longer hold events.
12. **On web the page is inline.** Connected apps is already the second pane, so the calendar block replaces the Calendar row in place rather than opening a third level.
13. **The rail names another member's primary calendar by that member's display name**, never by the address Google gives it, and the event line for another member's calendar carries the title and the time only. The sheet counts other members' calendars and never names them; the rail names them, because "whose day is that" is what the line is for, and the name is one the member chose.
14. **The phones' bar control is a bare glyph at 21 with a 10 hit slop**, as the back chevron beside it and every bar control on the phones: the kit's `IconButton` in a bar is the ghost one, and a filled circle read as a state.
15. **Android's Material variants of the checkbox, the switch and the sheet are not built.** Android draws the design system's controls on Material's tokens, as the rest of the phone does; AC-16 stands as owed rather than met.

**Why:** each is the note meeting a fact: what Google's list carries, what a shared thread has to say to be honest, what the code already has (the More menu's shell), and what the reviews found the mock had not drawn (a person with nothing approved, a thread narrowed to none of yours, the event line).

**Design system impact:** `Group` in `SettingsDetail.jsx` gains the trailing count as the note scoped. The settings crops want the four copy changes above (1, 2, 3, 4, 5). The sheet crop wants the two captions, the second line and the others-read line (6), and the empty case (8). The web crop wants the caption (7). A day-list event line wants drawing (8), and `TimelineWidget` wants the earned-by-a-pick rule (9). `AppBar.d.ts` and `WPaneHead`'s comment still say one or two tools. The still-owed list in the note stands: the write target once asked, Android's Material variants as built here, and a thread narrowed to nothing, now given a sentence.

### 2026-09-18 · The two declining lines keep to one line each
**Surface:** iOS, Android, web
**Raised by:** the code, against item 9 of `handoff/APPLY-2026-09-16.md`, which gave "Can't search that." the second line "Searching the web is off in Settings." and "Not sure." the second line "That one is not about your days."
**Was:** the two lines as shipped: one sentence each, no second line.
**Is:** the same. Neither line gains a second one.
**Why:** the design read the two lines as two states, and they are not. "Can't search that." is the refused-subject line, said when the whole dump is a question about politics, weapons, self-harm or sex, and it is said whether or not the web switch is on; "Searching the web is off in Settings." would be untrue every time it appeared. "Not sure." covers four states in the prompts: a question that is not about their days, a lookup that did not work, the web switch being off, and a country offload does not know; "That one is not about your days." would be right in one of the four. The one honest version of a second line would have the model say which state it was in, and offload never explains a failure or diagnoses itself: the sentence says what happened and the screen offers the way forward. The rest of the 16 September note is adopted as written.
**Design system impact:** `readme.md`'s Answering section: the two paragraphs beginning "There are two ways of declining" and "The test is not whether the fact is public" describe a second line the product does not draw; the first is replaced here with the states each line actually covers, and the second stands. `handoff/APPLY-2026-09-16.md` item 9 is withdrawn. The kits' conversation fixtures should draw each line alone.

### 2026-09-20 · The app icon inverts: paper tile, ink mark
**Surface:** iOS, Android
**Raised by:** the product owner, for the next build.
**Was:** `assets/app-icon.svg` as rendered on 2026-09-08: the ink tile with the mark in white, and the mark alone in white over ink as the Android adaptive foreground.
**Is:** the same mark and the same geometry the other way round: a white tile (`#FFFFFF`, not paper's `#FAF9F7`, since a home screen is not a page) with the mark in ink, and the ink mark alone over white for Android. Rendered at 1024 from the SVG with sharp, never hand drawn. The web favicon keeps the ink tile: it is the one version that reads on both a light and a dark browser chrome, which was its reason on 2026-09-09 and still is.
**Why:** the owner's call on how the app should sit on a home screen.
**Design system impact:** `assets/app-icon.svg` becomes the white tile with the ink mark; `readme.md`'s line about the icon, "paper on ink", gains "except the app icon, which is ink on white". `mark.svg` and `mark-inverse.svg` are unchanged.

### 2026-09-19 · Found on a Pixel: the composer's one line, the move sheet under the keyboard, and the stock dialog
**Surface:** Android, iOS, web
**Raised by:** the codebase, driving 020 on a real phone.
**Was:** the composer opened as a two-line box with nothing in it, because "taller than one line" was a number and Android reports one line as 44.6 with its padding where iOS reports 22; the move sheet, whose search field takes focus on open, sat entirely under the keyboard, the waitlist form's own lesson repeated; the Android "Add a photo" dialog was the stock `Alert`, uppercase teal buttons stacked, with Cancel drawn as the emphasised one.
**Is:** the composer measures "taller than one line" against the shortest height it has seen, so it is a pill until a second line exists, on either phone and on the web, where the same number (30, one below what 16px body type with its leading and padding comes to) was opening the box too; the move sheet lifts with the keyboard, the same lift Notes uses; the stock dialog stays for now with Cancel first and Choose from library last, which is the platform's quiet and emphasised slots.
**Why:** the kits cannot show a keyboard or a platform dialog, and each of these was invisible until a device drew it.
**Design system impact:** `Composer.jsx` in the M3 kit owes a bottom sheet for "Add a photo" with two rows, Choose from library and Take a photo, and the iOS kit its action sheet; the code takes it the day it is drawn. Nothing else to draw: the composer and the move sheet match the kits once the platform is accounted for.

### 2026-09-18 · Links leave Files, which is the kit's grid now
**Surface:** web, iOS, Android
**Raised by:** the codebase, building 020, on the product owner's call to draw Files as the kit's grid.
**Was:** 007 earned Files for a link, a file, an image and a screenshot, and drew every one as a row, because nothing had a picture. The kit's `FilesWidget` had always been a three-column grid of square `FileTile`s with a chip filter above, links among them as a glyph tile with a "Links" chip.
**Is:** Files is the kit's grid: three columns of square tiles at `--radius-sm` with a hairline, each the photo itself cropped to the square with no treatment, or the type glyph until the renditions exist. It is earned by a photo or a screenshot and by nothing else. A link row stays in the list, with the page's own picture in its tile as decided on 14 September. The tile has no controls; a tap opens the viewer, where the row's tools are. The chip row above the grid is the thread's tag dimension as 007 built it, and there is no chip by kind. The + does not draw on the Files heading.
**Why:** A link in a grid of untitled squares loses the title and the domain that identify it, and a row that opens the page is more useful than a tile that does not. `file` waits for the spec that brings PDFs.
**Design system impact:** `FilesWidget` and `FileTile` in both mobile kits and the `data.js` fixture: the `link` entries and the "Links" chip leave the file grid, and the filter row is the tag dimension rather than a mixed list of kinds. The web kit gains a Files grid on `WThing`, which it never drew.

### 2026-09-18 · The photo viewer, and the move sheet inside it
**Surface:** web, iOS, Android
**Raised by:** the codebase, building 020. No kit draws either.
**Is:** A photo opened from a tile, a thumbnail or a row's tile is shown on a dark plane over whatever was on screen: the large rendition as big as the window allows, and beneath it, or under a pull on the phones, the row's title and what the row says about the picture. The plane is `--surface-inverse` at 90% in the light theme and `--surface-page` at 92% in the dark, not `--surface-scrim`: at the scrim's 0.32 a white screenshot on a warm page read as a page behind a page. The controls follow the pane pattern, `maximize-2` for Full screen, `ellipsis` for More, `x` for Close, overlaid top right on the web and in the platform's bar on the phones. More holds rename, move for the author, and one way out, never two, as the rows have had it since 5 September: put back when archived, delete for the author, archive for anybody else; on the phones More opens the same action sheet a row opens, so a row's tools live in one place, Move is a new entry on it, and Mark done is not offered on a picture. A set is paged with arrows and the arrow keys on the web, a swipe on the phones; Esc, the scrim, a pull down and the Android back gesture close it; the phones pinch to zoom; reduced motion opens it plain. The move sheet is the share sheet's shape from `Sharing.jsx`: a search field on top, the person's threads beneath minus the one the row is in, a tap moves. It is the first move control the product has drawn.
**Why:** The product owner chose the grid with the row's tools in the viewer, and a picture needs somewhere to be seen at its own size.
**Design system impact:** two new screens to draw in every kit: a `PhotoViewer` with the plane, the three controls, the caption and the paging, and a `MoveSheet` reusing the share sheet's list. A semantic token for a dark viewer plane in both themes would replace the two mixes above.

### 2026-09-18 · A sent photo's thumbnail is the row tile's size
**Surface:** iOS, Android, web
**Raised by:** the codebase, building 020.
**Was:** `SentPhoto` in `LiveConversation.jsx` draws the tile at 34px and `--radius-xs`, as a placeholder, since the kit has no photos.
**Is:** 36px and `--radius-sm`, the row tile's size from the 14 September decision, with the picture in it and the name beside it, so one thumbnail size holds across the product: the sent bubble, the row's tile, the composer's chip glyph.
**Why:** Two sizes two pixels apart for the same picture is a difference nobody chose.
**Design system impact:** `SentPhoto` in both mobile kits takes 36px and `--radius-sm`. `WTurns` in the web kit draws text only and gains the same `SentPhoto` under the person's bubble.

### 2026-09-18 · The web composer borrows the phones' chips, photo and tile
**Surface:** web
**Raised by:** the codebase, building 020.
**Was:** `WComposer` drew the camera and the microphone with no chip, no expanded shape for attachments and no sent photo; `WThing` had no file grid.
**Is:** The web composer takes the mobile kit's `AttachChip` whole: the image glyph, the name at twenty characters, an 18px remove glyph, in the row with the three controls, wrapping, with the pill open to `--radius-lg` and the field above when it holds any; the row scrolls inside the composer's own cap past three lines of chips. A pasted or dropped image attaches. The send control shows a ring while the photos leave. One clause under the composer when a send did not go, with Retry beside it. The microphone stays drawn and inert.
**Why:** The web kit's composer was written before attachments; the phones' was not, and one chip is one chip.
**Design system impact:** `WComposer`: an `AttachChip` row, the expanded shape with chips, paste and drop, the sending ring, the line under the composer. `WThing`: a Files grid. The kit's fixture: photos with real thumbnails rather than the `preview` placeholder.

### 2026-09-17 · Two levels of calendar consent, and a thread that starts empty
**Surface:** iOS, Android, web
**Raised by:** the product owner, for the settings page and a per-thread control, decided item by item off `explorations/calendars-options.html`.

**Was:** a Calendar row in Connected apps with the value `On` that opened nothing, and no way anywhere to say which calendars offload may use or which ones a thread should care about.

**Is:** two levels, and they are different questions. The account approves which calendars offload may use at all; **a thread picks which of those it uses, starting from none.**

**The thread control carries no mark, which is the product owner's call and the right one.** Four treatments were drawn: a plain glyph, `IconButton`'s existing badge dot, a count, and the glyph in ink when narrowed. Three of the four invite a tap that finds nothing wrong, because a dot and a bubble mean attention in every app anyone has used. **The plain glyph is also the only one that stays true** once a thread starts empty: with no inheriting-versus-narrowed distinction there is nothing for a mark to mean, and the accessible name carries the count.

**Inheritance was rejected on safety rather than on taste.** Inherit-and-narrow was the convenient model and it means approving a calendar at the account level silently widens what offload reads in threads set up months ago, shared ones included. **Explicit is the safer default when the thing being widened is other people's days.** It also drops a hidden third state and the `Use all` control that existed only to return to it.

**Three governed components were drawn wrong before they were read, and each one changed the design rather than just the mock.**

1. **`Checkbox`.** Drawn as a 21px box with a **moss** fill, which is the done row's mark that `readme.md` reserves for a finished thing, so every ticked calendar read as "offload completed this". The governed control is 20px, `--radius-xs`, `--surface-inverse` with an inline stroked tick. **A selection is ink, not moss.**
2. **`IconButton`.** A 7px amber dot with a `--surface-page` ring was invented for the thread control when the component already has a `badge` prop: 8px, `--clay-600`, a 1.5px `--paper` ring, whose own comment says it means *something new*. Reading it is what disqualified the dot, and the same collision had already been used to reject the count.
3. **`AppBar` and `Sheet`.** The bar was drawn with 8px gutters and 2px gaps against the real 20px and `--space-4` with −8 group compensation, so the fit arithmetic was wrong by about 24px; the sheet had a 28px top against `--radius-sheet`'s 24, which `readme.md`'s own "24px on sheet tops" line already stated.

**The provider's colour is in, as recognition and not as the differentiator.** Measured on `--surface-fill`: four of seven ordinary Google colours are under 3:1 in light, the yellow at **1.51:1**, and two are under in dark, and they are not the same ones, because a bright hue falls against #F2F2F2 and a dark one against #232323. **No ground flatters a palette we do not control**, so the dot gets a `--border-hairline` ring for definition and the name does the telling apart. An earlier draft argued the dot was what distinguished two calendars both called Work, which at 1.51:1 it is not.

**There is no "Add events to" setting**, which the product owner cut as a thread question rather than an account one. One calendar ticked answers it; two or more and offload asks in the conversation with the thread's calendars as the values, which is what the follow-up control from 018 was built for; none ticked and anything with a time on it stays a thing in the thread.

**Design system impact:** `readme.md` gains a Calendars section. **No new design-system component and no new token**, and two things to scope that are neither: `Group`'s label gains a trailing slot in `SettingsDetail.jsx`, without which the list cannot show its count, and web's calendar popover is new UI because the web kit has no governed popover, built from existing tokens. Everything else is composition over governed `Checkbox`, `Switch`, `Button`, `Chip`, `AppBar`, `Sheet`, `IconButton` and `WPaneHead`. `handoff/APPLY-2026-09-17-calendars.md` carries it per surface and per theme.

**One standing rule is amended, which is the only thing in this pass that reaches outside calendars.** `readme.md` said a web pane head carries two tools and that anything a thread gains later goes in the More menu. A calendar is precisely something a thread gained later, so the web control either broke the rule or went in the menu. **The rule now allows three tools with a criterion rather than an exception: a tool earns a head slot only if it changes what offload reads or shows, and anything that acts on the thread goes in More.** Rename, add note and Leave fail that test and stay in the menu; a scope control passes, because a scope you cannot see is a scope you forget. The original rule's point is preserved, since most capabilities are actions and the head still does not grow for them.

**Still owed:** whether offload remembers a thread's write target or asks every time, which wants drawing rather than assuming; two accounts on the settings page, which is one block each with its own list and disconnect; and Android, where the group is a low container fill and the sheet is a Material bottom sheet.

### 2026-09-17 · A row's checkbox centres on the row, with the handle and the tools
**Surface:** web
**Raised by:** the product owner, looking at a two-line To do row.
**Was:** The tick centred on the first line of the title, offset 2px, as `WRow` draws it, while the grip before it and the tools after it centre on the row. On a two-line row the three sat on two different lines.
**Is:** The tick centres on the row. One row, one line for its controls: grip, tick, edit, way out.
**Why:** The grip arrived beside the tick this week and made the mismatch visible. On the phones the row's controls are top-aligned together already, so nothing moves there.
**Design system impact:** `WRow`: the `lead` checkbox centres on the row rather than on the title's first line.

### 2026-09-17 · The web composer takes lines: Enter sends, Shift+Enter breaks
**Surface:** web
**Raised by:** the product owner.
**Was:** `WComposer`'s field was a single-line input. Enter sent; there was no way to type a second line.
**Is:** A textarea that grows with the text, to the same 380px the phones' composer grows to, then scrolls. A one-line dump keeps the 25px pill; past one line the corners open to `--radius-lg`, the row aligns to its top so the "in thread" label sits centred on the first line (it shares the field's line box and padding), the camera, the microphone and the send drop to the bottom edge beside the last line, and the inner padding gains `--space-2` above and below. Enter sends. Shift+Enter is a line. The person's bubble keeps the breaks (`white-space: pre-wrap`); the sheet's title collapses them to one line.
**Why:** A list is easier to dump as lines, and the web had nowhere to put one. Enter stays the send because on web the keyboard is the whole input; the phones keep Enter as a line because the arrow is the send and the keyboard is already on screen, which is what `Composer.jsx` and `M3Composer.jsx` already draw.
**Design system impact:** `WComposer`: the field is a textarea; a `tall` state that opens the pill to `--radius-lg`, keeps the thread label on the first line and drops the controls to the last; the kit's note on keys, "Enter sends, Shift+Enter for a line". The phones' composers: none.

### 2026-09-16 · The handle leads the row, always, and is not a button
**Surface:** web, iOS, Android
**Raised by:** the product owner, looking at the handle beside Edit.
**Was:** The "A row has a handle" entry, further down: `grip-vertical` first among the row tools on web, shown on hover and focus in a 32px `--surface-fill` box; first among the trailing controls on the phones, beside the pencil; at the trailing edge of a note row.
**Is:** The grip sits at the row's leading edge, left of the checkbox or the tile, on every row in a list that can be arranged, always drawn. No container: no fill, no border, no size of its own, just the glyph in `--text-tertiary` with a `grab` cursor, `--text-primary` under the pointer, drawn inside the row's own left padding so the checkbox keeps its place. On the phones the same glyph in `iconOnWell` leads the row. It is still a button for the keyboard, with the arrow keys, and the focus ring is the only box it ever draws.
**Why:** Beside Edit it read as a fourth action, and it is not one: nothing happens when it is clicked. A list is held at its edge, which is where every list that can be dragged puts its grip, and a move area that is always there says the list can be arranged without anybody hovering to find out.
**Design system impact:** `WRow` and the phones' `ListRow`: the `reorder` slot moves from leading the tools to leading the row, before `lead`, always visible, no container, tertiary ink. `MemoryRow`: the same slot at the leading edge rather than the trailing one. `RowTools` is back to two controls, edit and one way out. That entry stands for the drag, the drop line and the priority arithmetic, and the design's "offload asks with values" entry below stands for everything but the handle's place; only where the handle sits changes.

### 2026-09-16 · offload asks with values, and a row can be picked up
**Surface:** iOS, Android, web
**Raised by:** `handoff/FROM-CODE-2026-09-16.md`, nine items from 018 and the reorder work, decided item by item off `explorations/asking-and-arranging.html`.

**Six of the nine were decisions and three were approvals**, and two of the six only existed because the work was drawn at real size rather than read.

**A value chip's fill does nothing, and that is the finding.** Code described a value as "the Chip contract's shape, 30 tall on `--paper`", which is not a tone `Chip` has. Measured on the reply bubble: `--surface-card` is **1.06:1** against it in light and **exactly 1.00:1** in dark, where the bubble and the card are the same token, while `--border-strong` is **3.17:1** in light and **3.59:1** in dark. So the border is the chip in both themes. Taken as drawn, with the paint living on `QuickReplies` rather than becoming a fifth `Chip` tone: a governed component should not grow a variant for one use, and what this needs from `Chip` is its geometry, which it now copies explicitly.

**The way out carries an `x` and sits on a line of its own.** Plain and borderless beside bordered values, it read as a value whose border had failed to draw, so the product owner asked for the mark. And the line break is the decision it replaces: with five long labels the way out fell on its own line by accident and the forced break changed nothing, while with five short ones it landed beside a value. **The arrangement was a property of the labels rather than a decision**, which is what the break fixes.

**All three typed invitations overran the field.** Measured at 390pt in a 266px field: 309, 269 and 327px, and what each one lost was its example, which is the useful half. The entry had them as three fixed strings and the drawing made them undeliverable, so they lose the preamble: **"Which dates? e.g. Sept 12th at 5pm"**, and the same pattern for the other two.

**A question on a silent turn gets a reply bubble of its own**, after the footer, because the log's grammar is that a bubble is somebody talking and a question is offload talking. The alternative, chips loose on the plate, would have made it the only sentence in the log outside a bubble.

**The drop line runs the row's full width**, not inset to the text: the system's own insets rule says a row spans the full width and pays the gutter back inside, so an inset line would be the one mark in the list that does not follow it, and it reads as underlining the row above rather than as a gap between two.

**Declining got a second line.** "Can't search that." and "Not sure." are different states and were the same shape, so each now carries a tertiary line saying which: the capability is off, or the question is not about their days. The product owner took the explained version over the bare one; the cost is that offload says a little more about itself, and the gain is that the web-search line points at the switch that would change it.

**Three approvals, drawn and taken as written:** every mark in `TurnFooter` becomes 30, which is `Chip`'s height and what the thread pill beside it already was, with one space step above the row; 👀 goes, and with it the product's last emoji, so a seen turn draws no row at all; and the done count moves inside its own control.

**Design system impact:** `QuickReplies` rewritten, five options, `label` as the group's accessible name, `value | plain` kinds with the `x` on the way out and the forced break before it; the `.d.ts` rewritten with it. `ListRow` and `MemoryRow` gain `reorder`, `dragging` and `over`. `TurnFooter` gains a named `MARK_H` of 30 and loses its seen branch. `grip-vertical` vendored as the 81st glyph. `readme.md`: the emoji rule inverted in two places, the answering section rewritten around values, the row-actions guideline gains a fourth control, and the two declining lines are written down. `handoff/APPLY-2026-09-16.md` carries it per surface and per theme.

**Still owed:** the 200% text check on a 360dp frame, which the code entry already lists, and which now means five wrapped chips and a forced break at 200%. And there is still no long-list picker anywhere in the system, which the country row needs and a timezone would need after it.

---

### 2026-09-16 · offload asks back, and the chips are values
**Surface:** iOS, Android, web
**Raised by:** 018, the first feature in which offload asks a person anything.

**Was:** `QuickReplies` held three options, drawn as a plain row; the 2026-09-09 entry said "the turn that asks carries no write tools".

**Is:** five options at most, wrapping to further rows, in one accessible group named by the sentence that asked, so a screen reader hears what the chips answer. The last option is always the way out, "Not that", drawn plain like the calendar control's "Not now". No option is a primary: a choice among values is one offload does not know the answer to, and dark ink would say it did. A chip's label never wraps or truncates; the server caps it at 24 characters for exactly that. The sentence above the chips is plain text, one of five templates with the row's title in its slot, never markup and never a page's words.

**Where it sits:** inside the reply bubble under the sentence and after the calendar proposal when both are on one turn, which keeps its own life. A turn that filed silently and asked has no reply bubble, so the question gets one of its own with nothing else in it. The composer's placeholder holds the open question while it is open; a date, span or time question with no values to offer is answered by typing, and the placeholder is the invitation, "Which dates? Type them, like 10 to 12 October". The field's accessible name stays "Dump anything".

**The trust boundary, restated:** the turn that asked writes only what the dump asked for, as any filing turn does, and an answer never runs a turn with write tools at all. A tap is applied by the server with no model; a typed answer is judged and applied before the planner runs; the one re-run, for a country, is an answering turn and holds no write tool. The 2026-09-09 sentence is replaced by this one.

**Picked up on the way past:** the calendar control's disabled state loses its opacity fade for the disabled aliases, `--state-disabled-surface` and `--state-disabled-text`, as the system says.

**After the client review, the same day:** a value chip is the Chip contract's shape on both platforms, drawn 30 tall on `--paper` (web) or `--surface-card` (iOS) with a 44 hit area around it, 15px on both kinds; the option `kind` on the wire is `value` or `plain`, which replaces the kit's `primary | plain | thread | neutral` for this use, since no option here is a primary or a thread; a tap that lands offers the eight second Undo like any turn, and the way out offers nothing since nothing changed; a request that fails draws the calendar control's line, "That did not go through. Try again.", with the chips still there, and only a 404 takes the chips away silently; the three typed invitations are "Which dates? Type them, like 10 to 12 October", "By when? Type a day, like 30 September" and "Which day and time? Type them, like Friday at 10", the same on both clients; the phones read the sentence that asked as each chip's hint, since a container's name is not read on iOS; a long label wraps on the phones rather than being cut, and the 200% text check on the 360dp frame is still owed.

**Design system impact:** `components/answering/QuickReplies.jsx` grows to five options, gains `label` as the group's accessible name and loses `note` from the product's use (the prop stays). Its contract wants checking in as a `.d.ts` and the adherence file regenerating. `readme.md`'s answering section: "three options at most" becomes five, and the trust-boundary sentence is the one above. The kits' `LiveConversation.jsx` and `WConversation` draw the question inside the bubble already; both want the standalone bubble for a silent turn and the placeholder invitation.

### 2026-09-16 · A row has a handle, and dragging it is changing its priority
**Surface:** web, iOS, Android
**Was:** The To do list and the Notes section were read-only in their order. To do sorted
by priority then recency and the only way to move a row was to know that; Notes sorted by
when each was written and could not be moved at all. No kit draws a reorder on any row.
**Is:** A row in either list carries `grip-vertical`, a Lucide glyph now vendored as the
81st in the set. On web it is the first of the row tools, left of `pencil`, shown with
them on hover and on focus; it is dragged (HTML5, the whole row as the drag image) or it
takes the arrow keys, and the row under the pointer draws a 2px ink line on the edge the
drop would land on while the dragged row takes `--surface-fill`. On the phones it sits
first in the row's trailing controls, beside the pencil; hold it and the row lifts to
`--surface-raised`, follows the finger, and snaps home when let go while the list re-sorts
under it. A note row on the phones, which has no pencil, draws the handle alone at its
trailing edge. The drop is a priority: the midpoint between the two neighbours, a
re-spread of the visible list when they are adjacent, never a tie, on the 0 to 100 scale
the reprioritise already used. Notes gained the same number for it, and moving one leaves
when it was written alone.
**Why:** The product owner wanted to rearrange a list by hand, and a list ordered by a
number a person can already change has an obvious way to do that without a second
ordering mechanism: change the number. One handle, the same on both lists, because a
person dragging a task and a person dragging a note are doing the same thing.
**Three things the kit would want to know.** The handle does nothing when clicked, so it
is the one row tool whose hover does not invert to ink; it keeps `--surface-fill` and
takes a `grab` cursor. The web note row split from one `<button>` into a `div` holding a
text button and the handle, because a control inside a control is reachable by nothing,
and the split is invisible: the inner button inherits the row's type and colour. And the
drag hit area on the phones is the 17px glyph plus 8px of slop rather than a full 44,
which is inside the row's own target and is the same compromise the row's other three
controls already make.
**Design system impact:** `readme.md` gains `grip-vertical` in the vendored list, which is
81 glyphs now, and the guideline "A row's actions are drawn as conditional, never as
refused" gains the handle as a fourth control, drawn on rows in a list that can be
arranged. `WRow` and the phones' `ListRow` want a `reorder` slot: a handle leading the
tools, and a `dragging` and `over` state for the fill and the line. `MemoryRow` wants the
same slot at its trailing edge. `RowTools` on web is the reference for the order: handle,
edit, one way out.


### 2026-09-15 · The fold is yours, and an answering turn says something first
**Surface:** iOS, Android, web

**The fold moves from the thread to the member.** The entry below made it a third
thread preference beside widget order and grouping, so one person folding the
finished rows of a shared list folded them for everyone. The product owner
reversed that the same day: which finished rows you have put away is about what
you have read, not about how the thread is arranged. It is on the membership row
now, the clients read it as part of the same preference object, and the copy
the thread briefly carried is dropped. Recorded as a reversal rather than an
edit to the entry below.

**An answering turn's first step is written before the model is called.** 017
put a line at 2.5 seconds and a way out at 10, and on a question the line landed
at 12 to 27 seconds because it was written by the first lookup, after the answer
model's first round trip. The worker now writes "Looking through your threads"
as the turn starts, which is what happens first, and the model's own lines
replace it. The three dots remain the state for a filing turn, which usually
finishes under the threshold.

**Design system impact:** none. Nothing drawn changes.


### 2026-09-15 · The fold is the thread's, the rail is earned, and the phones get the mark
**Surface:** iOS, Android, web

Four small things the product owner asked for.

**The To do fold is a preference of the thread.** Hiding the finished rows used
to be screen state, gone on the next visit, so somebody who tidied a list tidied
it again on every device. It is stored with the thread's other two preferences
now (`hideDone` in `attrs`) and read back everywhere. Co-owned like the rest of
them: a shared list folded by one member is folded for all, which is the same
rule the widget order already follows.

**"5 done" and its chevron are one control.** The count was text beside a 26px
button, so pressing the words did nothing. One button now, count inside it, on
web and both phones.

**The rail is earned.** 015's opening paragraph said a thread with nothing dated
shows no timeline and its AC-1 said every thread shows this week; the code did
the second. Now the first: no dated thing, no rail. The kits' `TimelineWidget`
already draws nothing for an empty thread, so this is code catching up.

**The app icon is the mark.** Both phones shipped Expo's placeholder. They carry
`assets/app-icon.svg` now, rendered at 1024: the ink square with the white mark
for iOS, which masks its own corners, and the mark alone as the Android adaptive
foreground over the same ink, so the platform's shape is whatever the platform
draws.

**Design system impact:** `WThings.jsx` and the phones' `ThreadScreen` should draw
the done count inside the fold control rather than beside it. Nothing else: the
rail behaviour and the icon are already what the system says.


### 2026-09-15 · What a usability pass on web found
**Surface:** web

Four things from driving offload.club in a real browser, each one already drawn
in the kit and built differently.

**The sidebar stays under 1180.** `WApp.jsx` draws `WSidebar` at both preview
widths; only the pane count and the crumb bar change. The code hid the sidebar as
well, and with it the only way from Today or My threads to Settings, Notes and
Activity: the narrow crumb bar is a back button, and a root page has nothing to
go back to. Back to the kit. The trail hides only when a back button replaces it,
which is the kit's rule too, since a trail of one is still drawn.

**Settings switches are `Switch`.** Privacy's two web switches and the two
calendar settings in Apps were native checkboxes: a tick shape for a setting
that is on, in the browser's own blue. `handoff/APPLY-2026-09-14` asked for the
real `Switch`, a 44 by 26 track, ink when on, and web now has one, drawn over a
visually hidden checkbox so the keyboard and a screen reader get a control the
kit's span never gave them. The country row keeps its `select`, per the entry
below this one.

**A turn that stops twice says it once.** Finish it on a partial turn wrote a
second "That did not finish." under the first, each with the same source chips,
and the chip count grew past its cap on every attempt because the same pages were
recorded again. A turn has one reply: the row is replaced, and a page is recorded
the first time it is read.

**Stop restarts with the turn.** Finish it carried the first attempt's clock, so
the way out was on screen a third of a second into the resumed turn.

**One thing seen and not changed.** The step line 017 puts at 2.5 seconds arrives
at about 11 on an answering turn, after Stop, because it is written when the
model's first lookup starts and the answer model's first round trip is that
long. The three dots are the honest state until then and the fallback already
says so; a filler sentence would be offload narrating itself. Noted here so the
threshold is not tuned again.

**Design system impact:** none. The kit already draws all four.


### 2026-09-15 · One height in the turn footer, and it clears the bubble
**Surface:** iOS, Android, web

Two things the product owner spotted on web.

**The footer row held three heights**: 22 for the Done mark, 26 for a source, 30
for a thread pill. Side by side that reads as a mistake, which is what it was.
They are all 30 now, named once and inherited, so the next mark added to this row
cannot be a fourth.

**30 because that is `Chip`**, the governed component the thread pills already
come from. The other two were bespoke marks that happened to sit beside it.

**This is a divergence from the kit and an inconsistency inside it.** The design
system's own `TurnFooter` draws a 24px Done mark and a 26px source anchor next to
a 30px `Chip`, in one row, which is the arrangement that produced the bug. Worth
fixing there rather than only here.

**And the footer had no gap.** The log's own `gap` separates turns and does not
reach inside one, so the chips sat flush against the reply they describe and read
as an extension of it rather than as a row about it. One space step, matching
what the phones already had.

**Design system impact:** make the three marks in `TurnFooter` one height, 30, to
match the `Chip` beside them, and give the row a top margin. The phones had the
same shape a pixel or two apart and are changed with web, so the two surfaces
still agree.


### 2026-09-15 · Where they are, and a 250 row list on a phone
**Surface:** iOS, Android, web

**Is:** a Country row in My account, under Email. Web draws a `select`; the
phones push a screen with a search field and a list.

No kit draws either. The nearest thing is Appearance, which is a segmented
control over three values, and that shape does not survive 250.

**Why My account and not Privacy.** It is a fact about them, like their name, and
it reads as one. What it changes belongs in the note under it rather than in
where it sits: a date or a forecast is the one where you are.

**"Not set" is a row, not an empty field.** Clearing it is a real choice and the
product behaves differently for it: offload tells the model it does not know and
declines rather than guessing. A blank would read as a row that had not loaded.

**The phones get a search field rather than a wheel.** What somebody knows is the
name, not the code, and a 250 row scroll is not a choice anybody makes twice.
Filtering matches the name or an exact code, so "PT" and "Port" both find
Portugal. The current one is marked "Now", which is the word this product already
uses for the state a thing is in.

**Design system impact:** there is no long-list picker anywhere in the system and
this is the first. Worth drawing once, because the next one is already visible: a
timezone, if that ever follows the country. The web `select` is the platform
control unstyled apart from the row's own value slot, which is a divergence from
every other settings control and the cheapest thing that works; if the kits grow
a picker, web should take it.


### 2026-09-15 · The eyes go, and the footer moves under the reply
**Surface:** iOS, Android, web

Four things the product owner found by using it.

**1. 👀 is gone, and with it the product's only emoji.** It sat on a message
offload had seen and not answered, from 003 until now. The writing indicator says
the same thing, at the same moment, a few lines below: two marks for one state,
and the one that stayed is the one that also says work is happening. The standing
rule in `CLAUDE.md` moves from "one emoji" to "no emoji".

**2. The footer now hangs off the reply when there is one.** It was drawn on the
sent bubble in every case, which put an answer's source chips *above* the answer
they were sources for. The footer still belongs to the turn rather than to either
bubble, and the turn ends at the reply; a turn that said nothing back keeps its
footer on the message, exactly as before.

**3. Stop sits on the line it belongs to.** It was stacked under the progress
line, which read as a second thing appearing rather than as the way out of the
one already there.

**4. A question about the world is declined**, not answered and not searched.
"How do you make leek soup" and "how much is bitcoin" get `Not sure.` The test is
not whether the fact is public: "when do the clocks go forward" is answered,
because a date is what a day is made of and this product is about their days.

**Design system impact:** the kits draw 👀 in `StatusChip` and in the mobile
kit's README, and both are now wrong. The seen state has no mark at all. Worth
checking the kits' conversation files for the footer's position too, since they
were drawn before the footer existed. `Not sure.` joins `Can't search that.` as
the second short line offload says when it is declining rather than failing; they
are different states and should not look identical.


### 2026-09-14 · A link row shows the page's own picture
**Surface:** iOS, Android, web

**Is:** a link row draws the image the page publishes about itself, 36px, where
the type glyph would be. The glyph is the fallback, for every row that is not a
link and every link whose page published nothing.

A listing is recognised by its photo long before its title, and the tile was
already the right size and shape for one. Cropped rather than letterboxed: a
thumbnail with bars reads as broken.

**The address is stored, never the bytes**, and that is a privacy decision rather
than an implementation one. The device loads the image from the site, so the site
sees the reader's IP and when they looked, every time the row is drawn, and in a
shared thread that is every member. Put to the product owner with the two
alternatives, proxying through the Core API and keeping a copy in R2, and this
one was chosen knowing the cost. **Section 9 of the privacy policy says so
plainly, and the sharing table now names "the site a link points to" as a
recipient**, which is the first entry in it that is not a company we chose.

Decorative to a screen reader on both surfaces: the page chose a picture, not a
description of one, and the title beside it already says what the row is.
`referrerPolicy="no-referrer"` on web so the site is not told which page it was
loaded from.

**Design system impact:** the kits draw a type tile and have no concept of a row
whose tile is an image. Worth deciding whether the fallback glyph and the image
are the same slot, as they are here, or whether a link row is its own shape. The
36px and the `--radius-sm` come from the existing tile so the two line up in one
list; if a link row becomes its own shape that constraint goes away.

### 2026-09-14 · A link row opens the page, from its domain
**Surface:** iOS, Android, web

**Is:** a row that came from a page shows the registrable domain under its
title, in accent, and that domain opens the page. Nothing else on the row
changes.

No kit draws this. `WRow` has one `onClick` that opens the row's own detail and
no external affordance anywhere, so this is a divergence rather than an
interpretation.

**The domain is the link, and the title is not.** On web the title already opens
the row's detail pane, so hanging the page on it would mean the same tap doing
different things on two surfaces. The domain is free on both.

**And the domain rather than the title or the URL.** A title is written by
whoever owns the page, and a full URL is unreadable at 13px and carries tracking
parameters somebody did not choose to display. The domain is the part a person
recognises and the part that is ours, which is exactly the argument 016's source
chip already makes. The two now say the same thing in the same words, which was
not planned and is worth keeping.

**It leaves the app.** The system browser on the phones and a new tab on web,
with `noreferrer`, never a webview: a page rendered inside offload is a page
whose owner is impossible to see, and that is the shape every credential-phishing
flow relies on.

**Design system impact:** two things. A link row needs drawing in the kits, which
today have no external affordance on a row at all, and the question of whether
the domain belongs under the title or trailing on the right is open. And `WRow`
wants an `href`, which is the second component this month to want one: `Chip`
needed it for the source chip and was worked around with a bare anchor. Worth
deciding once for both rather than a third time.


### 2026-09-14 · The rail's lift, and one tier held back
**Surface:** iOS, Android, web

**Is:** a day with something on it is a raised surface with a hairline and a
shadow, not a blue inset glow.

Applied from `handoff/APPLY-2026-09-14-rail.md`, which is the whole reasoning.
The short version: blue was carrying five meanings on one screen once the waiting
chip and the task dot were counted, so blue keeps the two that are about time,
today and the day being read, and everything about content moved off the hue.

**Sections 1, 3, 4, 5 and 6 are built.** The lift, the layering with today and
the read day, the empty day stepping back, and the two dots that move to text
aliases. The dots are the part worth repeating: `--surface-attention` and
`--surface-noticed` are fixed across themes, which is right for a chip and wrong
for a 5px mark whose backdrop now changes with the theme, and they measured
2.62:1 and 2.03:1 on the lift.

**Section 2, the amber ring for a day carrying a decision, is not built.** The
note itself says it needs a product answer first and asks two questions, and
building the CSS without knowing which days get the attribute would be a state
nothing can enter.

Two platform notes:
- **The two shadow rules are separate, never one list.** `--shadow-1` is the
  keyword `none` in the dark scope, and `none` is not legal in a comma-separated
  shadow list, so a combined declaration is dropped and the lift vanishes in
  dark.
- **React Native cannot take either token**, since both are whole `box-shadow`
  declarations. `colors.ts` exposes the one thing RN needs, the shadow's colour
  per scheme, and the cell supplies the geometry. Same two values, same two
  rules, spelled the way that platform draws them.

**Parked by the product owner on 14 September**, asked and answered: the amber
tier does not matter for now. Not rejected and not deferred to a date, so the
note stays as written and whoever picks it up starts from the two questions
rather than from scratch.

**Design system impact:** none for the tokens, which arrived with this sync and
are used as given. The open half stays open and is now parked: section 2 needs
the product answer on what counts as needing a decision, and the note's second question, whether one
ink amber reading at two levels is legible as two signals, is unanswered and is
the thing to check on a device once the ring exists. `TimelineWidget` in the kits
is still three shapes behind the shipped rail and there is no governed component
for a day cell on any surface, which the note names as the next thing to build.


### 2026-09-14 · What offload is doing, and the way out of it
**Surface:** iOS, Android, web

**Is:** a progress line and a Stop control, both in the conversation area, and
neither has a mock.

017 gives a turn that reaches the web two things it has never needed: one line
saying what it is doing, and after ten seconds a way to stop it. The kits have
neither, because until a turn could take twenty seconds the three dots were the
whole truth.

**Both live exactly where the three dots already were**: offload's side, at the
log's gutter, the line above and the control under it. The alternative was a
toast, and a toast clears itself and takes the only control away with it, which
is the same reason 003's failure line is inline and not a toast.

Two thresholds, deliberately different numbers. **2.5 seconds for the line**,
because under that a sentence appears and is replaced before anybody reads it and
most turns finish there. **10 seconds for the control**, the product owner's
number. One number for both would either delay the reassurance or offer an escape
to somebody who did not need one.

**A turn with no step falls back to the dots rather than to a filler sentence.**
A turn that is thinking rather than looking something up has nothing to report,
and writing "Working on it" for it would be offload narrating itself.

The line is the model's own words, capped at 80 characters by the server. It is
written on the `look_up` call rather than after it returns, so it cannot contain
anything the page said: a page title reading "Payment failed, verify your card",
drawn in offload's voice, is a phishing message the product rendered itself.

A stopped turn says **"Stopped."** and offers nothing. `partial` offers Finish
because offload stopped by accident; this one they stopped, and offering to undo
their own decision is the product arguing with them. Secondary rather than clay,
because nothing went wrong.

**Design system impact:** two things to draw. A progress line with its
2.5-second appearance and its relationship to the writing indicator, and a Stop
affordance at 10 seconds; both belong in the conversation component rather than
in a new one. The "Stopped." state joins `failed` and `partial` as a third
ending, and the kits draw neither of the first two on a sent bubble yet. Worth
deciding whether Stop is a text button, as it is now, or something with more
weight: it is the only control in the product that interrupts offload, and it
currently looks exactly like Finish and Try again.


### 2026-09-14 · PrismField's contract is missing the prop React Native cannot do without
**Surface:** iOS, Android

**Is:** `shift`, a Reanimated shared value, belongs in `PrismField`'s declared props.

The 14 September sync put `PrismField` into the enforced set for the first time, and its generated
rule lists `variant, basePath, density, veil, pulse, arriveOnMount, style`. The phones pass one
more, and have since 8 September: the web component attaches its own capture-phase scroll listener
so no screen has to know the field exists, React Native has no equivalent, and the plate lives above
the router while the lists live in the tab screens, so they are in different trees and cannot pass a
prop at all. A single shared value spans it, written by whatever is scrolling and read by the field,
both on the UI thread. That is the 8 September entry, "the parallax is handed in rather than
listened for", and it was logged at the time.

So the lint is enforcing a contract that predates a divergence this log already carries. Code wins
and the contract catches up (OFF-7). Disabled at the one call site, with the reason and a pointer to
that entry, rather than removing a working parallax to satisfy a generated file.

**Design system impact:** add `shift?: SharedValue<number>` to `PrismField`'s props, native only,
and regenerate `_adherence.oxlintrc.json`. Once that lands the disable comes out. Worth checking the
same way for any other component entering the enforced set: a first-time rule is the moment every
undeclared prop surfaces at once, and this one surfaced as a build failure rather than a review note.


### 2026-09-14 · The rail stops saying "something here" in blue, and gains a second tier
**Surface:** web, iOS, Android
**Raised by:** the design system, off the open question in the 10 September rail entry: blue now means two more things on one surface.

**Was:** a day with something on it drew a <code>--border-focus</code> ring plus a blurred <code>--border-attention</code> glow. With the waiting chip, today's ring, the day being read and the task dot, blue was carrying five meanings on one screen, two of them introduced by 015.

**Is:** two tiers, neither of them blue. A day with content is a **lift**: `--surface-raised` with `--border-lift` and the shadow its theme has. A day carrying a decision adds a 1px `--border-decision` **inset ring**.

**Both marks are new aliases rather than ramp references**, which is the same fix `--surface-noticed` got on 10 September and for the same reason: an un-aliased colour gets reached for from the ramp and the lint file has nothing to point at. `--border-lift` resolves to `--border-hairline` in light and `--ink-300` in dark; `--border-decision` and `--text-noticed` are both `--amber-700` in both themes, and they are two tokens rather than one because a day needing an answer and a thing offload noticed are two meanings that happen to share a value. Blue keeps today, as its border, and the day being read, as its fill.

**Seven options were drawn, in both themes, and the themes decided it.** Three variations on the shipped treatment, then four replacements for the lit state: a paper lift, an ink ring, ink weight alone, and amber. Every one of them looked fine in light. The dark frame is where they separated, and three findings came out of it that no light mock could have produced.

1. **`--shadow-1` is the keyword `none` in dark**, so the paper lift had no lift there at all: a 1.07:1 fill and a 1.23:1 hairline. That is why the chosen version takes a different border token in dark, which is the one state in the system where the two themes deliberately diverge.
2. **Every tint darkens by design**, so no glow can be the load-bearing mark. The shipped blue glow measures 1.88:1 in dark and the amber tint 1.31:1.
3. **A ring holds its value in both themes**, which is why the second tier is a ring and why `--border-decision` resolves to the ink amber rather than to `--surface-noticed`: 600 measures 2.03:1 as a 1px ring on white, the ink amber measures 7.2:1 on the lift in light and 10.27:1 in dark.

**Moving the ground moved the dots.** Two of the four kinds failed on the lift, the task dot at 2.62:1 in dark and the note dot at 2.03:1 in light, both because they used fill aliases that are fixed across themes while their backdrop now moves. **A dot on a lift takes the text alias of its kind**, `--text-attention` and the newly minted `--text-noticed`, which flip with it; event and other already did and already passed. The note dot's 2.03:1 is also the figure that disqualified `--amber-600` as the ring, so the same standard now applies to the same colour on the same ground.

**A wash dulls and an edge advances**, which is the finding behind the whole thing. The grey version of the lit state made a day with something on it read as *less* prominent than an empty one, because the tint darkened the ground under its number. So the lit day advances and **the empty day steps back**: `--text-tertiary` at regular weight, with today exempt, since a day with nothing on it is still today.

**What the glow was and was not.** An earlier pass of this exploration claimed the shipped lit state disappears in dark. It does not: its ring measures 3.55:1 there and the glow only grades it. The reason to move off blue is the five meanings, not legibility, and the log should say so rather than the stronger thing.

**Design system impact:** **three new aliases in `tokens/colors.css`, in all three scopes.** `--border-lift`, the edge of a raised cell, resolving to `--border-hairline` in light and `--ink-300` in dark, which is the only token in the system that deliberately takes a different step per theme and the reason is that dark has no drop shadow. `--border-decision`, the ring on something needing an answer. `--text-noticed`, the ink-weight counterpart to `--surface-noticed`, minted because the fill alias measures 2.03:1 as a dot on a raised surface and because borrowing the decision ring's token would have said the wrong thing. The last two share a value and are two tokens on purpose.

Both palette cards are updated: `guidelines/colors-surfaces.html` gains a border-alias row, and `guidelines/colors-semantic.html`'s footer names the two meanings the amber step now carries. That is the lesson of the 10 September entry applied on the way in rather than a month later: a token nobody can see on a card is a token the next person reaches past.

`readme.md` gains a Timeline rail section. `handoff/APPLY-2026-09-14-rail.md` carries the values per surface. **Still outstanding, and larger than this entry:** there is no governed component for a day cell or a week rail on any surface, and the kits' `TimelineWidget` is now three shapes behind. Two things want an answer before it is built: what counts as needing a decision, where an overdue thing is arguably louder than a due one, and whether one ink amber reading at two levels holds: the dot rule takes the note dot to `--text-noticed` and the day ring is `--border-decision`, which resolve to the same value today, so the day is a 1px edge and the thing is a 5px fill in one colour. If that is one amber too many the dot moves rather than the ring.

---

### 2026-09-14 · The turn footer, and the Done mark leaves the bubble
**Surface:** web, iOS, Android
**Raised by:** the design system, answering `handoff/DESIGN-2026-09-14-reaching-the-web.md` for 016.

**Was:** two elements in two bubbles. `StatusChip` absolutely positioned into the person's own sent bubble, 10px up and 6px into its bottom left corner; the reference pills rendered inside offload's reply, gated on `t.from === "offload"`.

**Is:** one row belonging to the turn, on offload's side, left aligned at the log's own gutter, holding the state mark, the thread pills and the source chips in that order. Drawn whether or not offload wrote a sentence.

**Why it had to change rather than grow:** 004 settled that an ordinary filing turn says nothing, so it has no reply bubble, and 016 gives that same turn something to report. There was no container for a chip on any of the three surfaces. And the mark could not simply gain chips where it sat: it is positioned *into* the bubble's corner, so a row growing sideways from there runs back under the bubble it is tucked inside.

**Three placements were drawn.** Keeping it in the sent bubble's column was rejected because the footer then inherits an 84% measure and wraps three chips onto two lines with the whole gutter free beside it, and because everything in the row is offload speaking, hung off the half of the log that is the person's own voice. Keeping the mark where it is and putting chips under the reply was rejected because it is exactly today, and today has no home for the silent turn.

**Fixed order, state then threads then sources**, so a turn can be read at a glance without being read. Wraps rather than scrolls; **min-height, never height**; no fill, no hairline, no card, because the chips are the only painted things in it. An empty footer is no footer rather than a 26px gap.

**An answering turn passes no state and no refs.** It wrote nothing and filed nothing, so it has no Done mark and no filed chips; the result card's own header stays the one link to the thread.

**Design system impact:** new component `components/conversation/TurnFooter`, with its card. Wired into `mobile_app/LiveConversation.jsx`, `android_app/M3LiveConversation.jsx` and `web_app/WMisc.jsx`, each of which loses its in-bubble ref row and its in-bubble mark. **Still outstanding:** the older full-screen `ConversationScreen` in both phone kits and its web twin still draw `StatusChip` inside the bubble, so the kit now shows both patterns until those catch up. `readme.md` gains a Reaching the web section.

---

### 2026-09-14 · The source chip is outline, and it is the one external link in the conversation
**Surface:** web, iOS, Android
**Raised by:** 016, where the tone was already decided and the reasoning is what needed recording.

**Is:** a `source` kind in `LIVE_REF_TONE` and `LIVE_REF_ICON` in all three kits, `tone="outline"` with the `link` glyph. The label is the registrable domain and nothing else: no path, no title, no scheme, no `www.`, at a 22ch max-width so only a genuinely long host truncates, from the end. Three chips, then a count.

**Why not moss:** moss means "offload did this, you didn't" throughout this system. A citation is the opposite claim, evidence of where a fact came from, and `MemoryChip` already reserves outline for the external and non-inferred. Drawn both ways in the exploration: beside a moss thread pill, two moss chips make the thread and the domain the same kind of thing and the row loses its order.

**The count is text, not a chip and not a control**, because there is no screen listing what a turn read and a chip would promise one. Threads are never counted this way: three sources is a footnote problem, three threads is a turn that did three things, each somewhere a person may want to go.

**The rule that matters, stated as a rule about the source of the string rather than as an exception:** a reply may not carry an external link, because its words are page-authored and a link in offload's voice is a phishing surface. A source chip's label comes from the record of what was read and its target is the URL that was read, so it is a fact about where a request went. That is why this one is allowed and a link in a sentence is not.

**A read that failed leaves no chip and no mention.** A chip is a record; there is nothing to record.

**Design system impact:** `TurnFooter` renders sources as an anchor rather than a `Chip`, because it leaves the app and `Chip` has no `href`, using the outline tone's own values so it stays the same object. Worth knowing that `Chip` cannot be a link today, and that this is the second component to want one.

---

### 2026-09-14 · The sentence starts with the verb, and contractions are in
**Surface:** all
**Raised by:** 016's refusal line, "I don't search that.", against `readme.md`'s rule that offload never says "I".

**Was:** third person, never "I", and three shipped lines that said "I" anyway: "I could not find that.", "I do not know. Theme is set on this phone...", and the briefed refusal. One line said "offload" as a subject: "offload did not finish that one."

**Is:** in what offload says, **the sentence starts with the verb and names no subject.** "Can't search that.", "Couldn't find that.", "Didn't finish that one.", "Filed both.", "Stopped." Neither "I" nor "offload". Where the interface describes offload rather than speaking as it, the name is used, because a settings row has to say what it governs.

**Why this rather than the amendment 016 proposed.** The brief offered first person for offload's own limits, third person otherwise. "Its own limits" licenses "I filed that", "I couldn't finish", "I'm slow today", and the voice drifts one string at a time, which is how it drifted to begin with. Dropping the subject splits nothing and is shorter, and every existing string already reads better without one. The product owner's call, made against both options.

**Scope:** replies, progress lines, empty states, notification copy and onboarding. Not settings notes, where the name is the subject of the sentence by design. The admin panel is untouched: it is a staff tool in a different register and offload is not speaking in it.

**Contractions are in**, as a second and wider change: every line before this wrote "did not" and "could not" in full.

**Design system impact:** `readme.md`'s Person rule is rewritten. Copy changed in `mobile_app/data.js` (three replies, one notification title and body, one memory blurb), both sign-in screens, and both phone settings pages. **The one shipped line is "offload did not finish that one."**, which lives in `Conversation.tsx`, its web twin and the readme, and becomes "Didn't finish that one." That is code's to move.

---

### 2026-09-14 · The phone's row draws what the web row draws, and the repeat box comes off
**Surface:** web, iOS, Android

**Was:** the phone's row drew a trash and nothing else, so renaming still meant a long press. The rail's day + carried a "Repeats weekly" tick on the web and a chip of the same name on the phones.

**Is:** every row draws the pair `RowTools` has drawn on the web since 007, edit and one way out, and the repeat control is gone from both surfaces.

**"Two controls, never three" is now one rule on two surfaces**, and which way out you get is still decided by the row: Delete for your own, Archive for somebody else's, Put back for an archived one. The phone adds one thing the web version does not have: the pencil and the way out are drawn only where `canDelete` is true, because `edit_content` and the delete need the same authorship the server checks, and the readme's rule is conditional, never refused. The web's pencil is still drawn unconditionally, which is a latent divergence on a shared thread and is worth closing when threads are actually shared.

**The repeat box was a structural answer to a question that turned out to be conversational.** The argument for it was real: `edit_content` carries no repeat field, so a repeat set later can never be corrected, and the day beneath the + is already structural. What that missed is that nothing has to be set later. Typed into the day's + on a device: "weekly bin collection monday 7am" came back as **Bin collection, Weekly, Monday 7am**, a real weekly rule with a real time, because the model reads the words at the moment it writes the row. A box, meanwhile, asks somebody to choose a format before they can put something down, which is the one thing this product does not do.

**The day stays structural.** It is not something anybody said; it is the heading they pressed +  on.

**Design system impact:** `ThreadWidgets.jsx` and any row in the mobile kits want the `RowTools` pair rather than a single control, at 17px with `--space-6` between them, and the conditional rule stated: a row that cannot be edited draws no pencil. Any mock of the rail's day add should lose its repeat control; the field and the day heading are the whole of it.

### 2026-09-11 · A row draws its own delete, and a section's two controls stop being one target
**Surface:** iOS, Android

**Was:** a content row carried a swipe and a long press and nothing you could see. A section heading carried its two controls, the finished-work toggle and the +, six pixels apart at 18px. The sheet's scrim faded in over 140ms while the sheet itself took 220.

**Is:** a row you may delete draws a trash at its right edge. The two heading controls are 22px and a full gutter apart. The scrim and the sheet move together, and the plate fades out with them rather than leaving the screen in one frame.

**Three ways to the same action, deliberately.** `ContentRow`'s own contract says a swipe deletes and a long press opens the rest, and this adds a third. The product owner asked for it after an evening of tidying a list, in those words: a swipe is a gesture you have to remember and a trash is a thing you can see. Drawn only where it is honest, so somebody else's row and an archived row show nothing and fall through to the long press, which offers what they can actually do.

**"It fades black real quick and looks broken" was literal, and the first answer made it worse.** The scrim is an opaque ink drawn at `opacity: 0.35`, and a Reanimated `entering` animation takes that property over and runs it 0 to 1: the screen faded to solid `ink-950` and snapped back to 0.35 only when the animation ended. A screen recording off the device, 30fps, put the darkest frame at 24/255 before it jumped back to 178. Lengthening the fade to 220ms, which is what this entry said first, made the black frame last longer. The scrim is translucent in itself now, through `atOpacity`, so the animation runs to 100% of the dim that was wanted: measured again, the same press falls 254 to 178 in six frames with nothing dark in between.

**It also arrives with the sheet rather than before it.** 140ms against the sheet's 220 read as two movements where one thing is happening. Both are 220, and the plate, which had been disappearing in a single frame since the sheet was put above it, fades on the same beat.

**Six pixels between two controls that do opposite things.** One hides finished work, the other adds more; at 18px with a 6px gap and 10px of hit slop, the two hit areas touched, and the wrong one got pressed. This is the cost of a heading with two controls instead of one, and the answer is space rather than fewer controls.

**Design system impact:** `ThreadWidgets.jsx` and any section heading in the kits want the larger pair and the wider gap, and the numbers are 22px and `--space-6`. `ContentRow`'s contract should name the trash as a third affordance alongside the swipe and the long press, with the rule that it is drawn only for a row this account may actually delete. The sheet contracts should carry the scrim timing, since a scrim that beats its own sheet is a fault nobody can see in a still mock.

### 2026-09-11 · A screen's own sheet takes the plate off the screen
**Surface:** iOS, Android

**Was:** the row actions, the edit sheet and the note editor are anchored to the bottom of the screen they belong to. The plate is mounted above the router, so it painted over all three: a long press showed the word Edit and nothing else, and everything below it, Mark done and Delete, was under the composer and the tabs.

**Is:** a screen sheet says it is up and the plate comes off the screen while it is. The scrim, which was already covering the screen, now covers everything.

**"There is no way to delete a task" was this.** Reported as a missing control, and the control had been there since the sheet was written. A sheet that opens underneath another surface is indistinguishable from a feature nobody built, which is why this is worth a log entry rather than a line in a commit.

**Counted, not a boolean.** Two sheets overlap for the length of one animation while one closes into another, and a boolean let the first one back bring the plate with it.

**Same family as the two the pinned composer already hit.** `Plate` and `ConversationScrim` each deciding `raised` for themselves, and now this. The rule the three of them arrived at: anything mounted above the router decides what it covers in one place, and screens ask rather than assume.

**Design system impact:** `RowActionSheet`, and any sheet contract that opens from inside a screen, should state that the plate is not part of it. The kits draw one screen at a time and cannot show this: the plate and the sheet are the same colour and the same shape, so a mock of either looks right on its own.

### 2026-09-11 · The day heading gets its + on the phone, and the edit sheet gets a way out
**Surface:** iOS, Android

**Was:** the rail's selected-day heading had a + on the web and nothing on the phones, so a day was the one section on the screen you could not add to. Opening a row to edit it offered Cancel and Save and no way to be rid of it.

**Is:** the day heading carries the same + every other section has. It raises the pinned composer, headed "Add to Thursday, 11 September", with two things in the conversation area: the thread pill, and a "Repeats weekly" tick. Ticking it repeats weekly from the open day.

**The tick is a selectable pill, not the web's checkbox.** The phones have no bare-checkbox pattern and the composer's options live in the conversation area rather than under the field, which is the product owner's rule for this composer: there is room up there, and the keyboard is not.

**The tick is final, on both surfaces.** `edit_content` is offload's only tool on the row afterwards and it carries neither a date nor a repeat field, so the day and the tick are what they are from the moment the row is written.

**The edit sheet carries the row's one way out**, Delete for your own, Archive for somebody else's, Put back for an archived one. Same question, same answer as the long-press sheet: having opened something to change it, the other thing you wanted is to be rid of it, and going back out to a long press for that is a menu trip for the second commonest thing there is.

**The field starts out holding the title**, which it did not on a device. It was filled from an effect, so the sheet mounted empty and caught up a tick later, and a controlled `TextInput` that takes focus on mount and has its value replaced a tick later keeps the empty one. Keyed by the row now, so it mounts with the title already in it.

**Design system impact:** `mobile_app/TimelineWidget.jsx` has no day heading and so no +; when it catches up with the rail it wants one, and a pinned-composer option row beside the thread chip. `RowActionSheet`'s contract and the note editor both describe the one-way-out rule; the content edit sheet now follows it too and the contract should say so rather than leaving it to two implementations to agree.

### 2026-09-11 · A + opens the keyboard, and putting one away closes it
**Surface:** iOS, Android

**Was:** the pinned composer arrived with the keyboard down, and stayed focused after a `+`'s write had landed.

**Is:** raising a pin focuses the field, and the pin clearing, written or dismissed, blurs it.

**Found on a device, which is the only place it could be.** The inline fields the pinned composer replaced all carried `autoFocus`, so pressing + used to put the cursor in the field. Routing through a composer that is always mounted lost that: two taps to type one line, on the control whose entire argument was that the keyboard already works there.

**The other half is the one that writes something by accident.** After a pinned add the sheet drops and the same field becomes the ordinary dump composer. Leaving the keyboard up over it means the next thing typed is a dump nobody meant to send.

**An ordinary dump still never opens the keyboard on its own.** The composer is on screen at all times, and a keyboard that raises itself takes the page away from somebody who was reading it.

**Design system impact:** none. The kits have no keyboard to show, which is the third time that has cost something here.

### 2026-09-11 · The composer says where a dump will land
**Surface:** web, iOS, Android

**Was:** the field said "Dump anything" wherever you were, and a dump made from inside a thread went wherever the model thought best.

**Is:** with a thread open, the composer reads "in thread Sustain", and the dump carries that thread to the planner as a default. On the web it sits in front of the field inside the input pill; on a phone it is one line above the pill, at the counter's size and colour.

**A default that changes where things go has to be visible, or it is a surprise.** The whole risk of filing somewhere by default is that somebody does not know it happened; one quiet line is what turns it into something they can see and override by writing "add this to Flat admin". The line is deliberately the quietest text in the composer, `--text-tertiary` at 12.5, because it is the answer to a question nobody asked out loud.

**Nothing is drawn while the composer is pinned by a `+`.** That case already says what it is adding to twice, in the header and in the pill, and this entry's own predecessor drew the distinction: a pin cannot choose a thread, a default can. A third statement of the same thing is noise.

**No mock for it.** `WComposer` and `Composer.jsx` are a field and three controls, with the live header as the only text slot either has, and that slot belongs to the conversation title.

**Design system impact:** `web_app/WMisc.jsx`'s `WComposer` and `mobile_app/Composer.jsx` / `android_app/M3Composer.jsx` want an optional `inThread` name: a quiet prefix inside the pill on web, a quiet line above it on the phones. It is mutually exclusive with the pinned variant from 2026-09-10, and a kit showing both at once would be showing a state the product cannot reach.

### 2026-09-10 · The composer is the single input for adding on a phone
**Surface:** mobile

**Is:** every `+` on a thread (a widget section's, and Notes') now raises the same shell-level composer instead of opening its own field. `Widgets.tsx` lost its inline `TextInput` and `Notes.tsx` lost its "adding" path through the sheet Editor; only editing an existing note still opens that sheet, since that needs mute, delete and a second field the composer has no room for. The `+` still keeps the write it always had, quick add or `addNote`, called on submit rather than routed through a dump.

**The pin is drawn in two places, on purpose split by what each is honest about.** The header shows what kind of write this is, "Add to To do" or "Add a note", the caller's own copy carried over unchanged. The conversation area, where turns would otherwise be, shows a pill, "In thread Sustain", the same shape and tokens as the `Filed` chip that already names where a dump landed. That pill is drawn only for a `+`, because a `+` genuinely cannot choose a thread; an ordinary dump made from a thread screen may default there without being pinned to it, which is a different, weaker claim and this entry draws nothing for it.

**A pin never folds.** `FoldedHeader` in `Plate.tsx` reads `live`, not `pin`, and a `+`'s add has no header row to collapse into, so pulling the sheet down, tapping its handle, or tapping the scrim all close it outright rather than folding it to the plate. The chevron-down control is not drawn while pinned for the same reason.

**Two latent two-composer bugs, found while wiring this.** `Plate.tsx` and `ConversationScrim` each recomputed their own `raised` from `conversation.live`/`folded`, and neither knew about a pin. A `+` with no live conversation underneath would have raised the sheet while the plate kept drawing its own composer beneath it, the exact two-composer failure `PrismField`'s own contract warns about. Fixed by computing `raised` once in `conversation-context.tsx` and having the sheet, its scrim and the plate all read that instead of each other's business.

**Composer gained three props no kit's `Composer.jsx` has**: `maxLength` and `showCounter` (so a note keeps its 200-character running count and quick add keeps its silent 500-character cap), and `submitLabel` (so the button reads "Add" while pinned rather than "Send", which described a dump).

**Design system impact:** `mobile_app/Composer.jsx` and `android_app/M3Composer.jsx` want an optional cap and running-count prop, and a submit-label override. `mobile_app/LiveConversation.jsx` wants a pinned variant: header title from the caller, a threadName chip in place of turns, no fold control, and the pull/scrim/handle all closing rather than folding. `ThreadWidgets.jsx` and any note-adding mock should show their `+` opening that pinned composer rather than an inline field or their own sheet.

### 2026-09-10 · The rail's day heading gets a +, and its repeat box is not the Checkbox component
**Surface:** web

**Is:** the timeline's selected-day heading now has a + like every other section, opening one field under it, "Type it, offload will sort it out", plus a second control: a plain checkbox labelled "Repeats weekly". Ticking it makes the row repeat weekly from the open day. Neither the day nor the tick can be corrected afterwards from what gets typed, because `edit_content`, the only tool offload has on this row, carries no date and no repeat field. That is stated in `quick_add.md` now, since it used to imply the opposite for every typed row.

**The checkbox is a native `<input type="checkbox">` in a label, not `components/forms/Checkbox.jsx`.** That contract strikes its label through and greys it once checked, which is right for a task read as done and wrong here: checked means the row will repeat, not that it is finished, and a struck-through "Repeats weekly" reads as withdrawn rather than as set. `apps/web/src/components/panes/Apps.tsx` already reaches for a bare checkbox for the same reason, for two calendar settings ("Read this one", "Other people see this"), so this follows that rather than inventing a third pattern.

**There is no mock for any of this.** `Timeline.tsx`'s own header comment already says so for the rail; the + and the field match the shape every other section's + already has, and the checkbox has no shape to match.

**Design system impact:** `Checkbox.jsx` covers a task-list tick only. A plain boolean setting tick, checked meaning "on" rather than "done", has come up twice now without a contract of its own (`Apps.tsx`'s two settings checkboxes, and this one). Worth either a `variant` on `Checkbox` that skips the strike-through and grey, or a second, lighter contract for it.

### 2026-09-11 · A month arrives from the side you came from
**Surface:** web, iOS, Android
**Was:** Prev, month name, next, then Today beyond the next arrow. Changing month swapped the grid in place.
**Is:** Arrows at the two ends, the name and Today between them, and the new month slides in from the direction of travel. On a phone a sideways swipe changes it too.

**The arrows are a pair whose whole meaning is direction**, so they are the two ends of the bar and everything else sits between them. Today was beyond the next arrow, which put the two ways of moving through months on either side of a control that is not one of them.

**Today is always drawn, including on this month.** Appearing and disappearing would shift the month name beside it, which is the fault this bar was already fixed for once, and on this month it still does something: it takes the day selection back to today.

**140ms and 12px.** A grid that swaps in place says a month changed and not which way you went. Short and slight on purpose, because somebody stepping through six months in a row should feel six directions rather than wait for six animations. Reduced motion gets the change and none of the travel, through the media query on web and `ReduceMotion.System` on the phones.

**The swipe is the phone's real control and the arrows are the discoverable one.** `activeOffsetX` at 20px is what stops it fighting the thread's own scrolling: it only takes over once the movement is clearly sideways.

**Design system impact:** the month bar is now three slots rather than four, and there is a movement convention in it that nothing else in the product has: a keyed remount with a directional slide. If another surface ever pages through something, that is the pattern to copy, and 140ms and 12px are the numbers. No new tokens; the durations are literals, which is worth a look when motion is next given tokens of its own.

### 2026-09-11 · The lit day is blue, and the day you are reading is white on it
**Surface:** web, iOS, Android
**Was:** A day with something on it took a grey ground and a hairline ring. The day being read took the neutral fill.
**Is:** Blue, and white on blue.

**Grey said it so quietly that it read as nothing.** The first version used `--surface-sunken` and `--border-hairline`, which is the quietest pair in the system, on a cell 40px wide competing with six others. The hue does the work now: `--surface-attention-soft` as the ground with `--border-focus` set inside it, plus a second soft inset, which reads as lit from within rather than outlined.

**The day being read is `--surface-attention` with `--text-on-solid`.** It is the one cell that has to win every time, including over a lit cell beside it, so it takes the solid fill and everything on it goes white: the number, the weekday and the dots. `--text-on-solid` rather than `--text-inverse`, because the fill is blue in both themes and does not flip while the inverse token does, which is exactly how a near-black number ends up on blue.

**Everything stays inset.** A border adds a pixel and the whole row shuffles as things are added and ticked off. React Native has no inset shadow, so the phones keep a 1px border in every state including transparent, which holds the same geometry by a different route.

**The month name takes the whole middle.** Sized to its own text, the right arrow walked left and right between March and September, and further in a language with longer month names. It is `flex: 1` and centred now, so the arrows are the only fixed things in the bar and nothing moves between months.

**Design system impact:** blue now means two more things on one surface, "there is something on this day" and "this is the day you are reading", told apart by soft against solid. That is a real load on one hue and worth a look when the palette is next reviewed: the alternative was moss for the lit day, which would have collided with "offload did this". No new tokens.

### 2026-09-11 · A day with something on it is a cell, and a long span is a month
**Surface:** web, iOS, Android
**Was:** A dot under the day number, and a run of three or more empty weeks collapsed to a line saying how many.
**Is:** The cell itself carries a quiet inward edge and a ground, and a span past six weeks draws a month.

**Five pixels of colour across seven cells is easy to miss**, which is what the rail came back as from the first real thread. The dots stay and still say what kind and how many; the cell now says there is something here at all. An inset ring rather than a border, because a border moves the cell by a pixel and the whole row shuffles as things are added and ticked off. Today stays outlined and the day being read stays filled, so three states sit on one cell without collision.

**Past six weeks it is a month.** Weeks read as time passing, which is the whole reason the empty days are drawn, and a year of weeks is a scroll rather than a shape. A long span now draws one month, whole weeks including the days either side of it drawn quietly rather than blanked, with a step either way and a **Today** that returns to the current month and selects today. The collapsed run of empty weeks is deleted: it made a year of nothing short without making it navigable.

**Design system impact:** three new things with no governed component and no mock anywhere: the has-something cell treatment, the month bar (step, step, month name, Today), and the outside-this-month day. `--surface-sunken` and `--border-hairline` do the tint, so no new token. The month bar is the first time this product has drawn calendar navigation; the kits' `TimelineWidget` had an Overall/Daily toggle instead and is now two shapes behind.

### 2026-09-10 · The timeline stopped being a widget and became a rail
**Surface:** web, iOS, Android
**Was:** A Timeline widget: a flat list of dated rows in priority order, drawn only when a thread had something dated, collapsing a repeating series into one line that said "every week, 30 held".
**Is:** A rail of weeks at the top of every thread, and the day you pick open underneath it.

**It is drawn whether or not the thread has a single date on it**, which is why it left the widget set rather than becoming a widget that is always earned. Widgets split content by what it is; this is about time passing, and the empty days are most of what it says. A thread with nothing dated shows the current week.

**A dot per thing, coloured by what the thing is**: task blue, event ink, note amber, anything else quiet grey. A day with three things has three dots, four at most and then a count. **A done thing keeps its colour and loses its fill**, so the legend stays about kind and weight says state. Colour is never the only read: every day card carries a generated label saying what it holds in words.

**A span covers every day it touches and a repeating thing draws every occurrence.** The list collapsed thirty yoga classes into one row because a list spends a whole row saying what the row above said; a rail has a cell per day already, which is what `decisions.md` said the phone's daily view should do all along.

**Runs of three or more empty weeks collapse to one line** saying how many, and open on tap. Two are drawn. A note dated a year out would otherwise draw fifty empty week rows between here and there, which is the passage of time rendered as scrolling.

**The week starts on Monday, with Sunday in Settings under Appearance**, kept on the device beside theme and text size.

**Two token findings came out of the review and one of them is a gap in the system.** Amber has meant "offload noticed this" since the kits drew a Noticed memory and had no semantic alias to say so, so every use reached for the ramp, which the rules forbid and the lint file could not catch because there was nothing to point at. `--surface-noticed` exists now, in `tokens/colors.css`, and the rail is its second caller. The other is the dot itself: 5px is smaller than any size token the system has, so it is a literal on all three surfaces and named here so the three do not drift by hand.

**Design system impact:** the kits' `TimelineWidget` is the shape this started from and is now behind in four ways: one dot per day becomes several, the dot means kind rather than state, the Overall/Daily toggle is gone because picking a day is the toggle, and the gap row is new. There is no governed component for a day cell or a week rail on any surface, and no kit draws either. Web had no timeline mock at all before this and now has the primary one. Worth drawing properly, because the four states this ships with are the ones a mock would have argued about: a thread with nothing dated, a day past the dot cap, a collapsed run, and a past day that is quiet but still live. **`--surface-noticed` is new and belongs in the palette page.** And the dot cluster inside a 40px cell at the larger text size is the one thing nobody has looked at on a device.

### 2026-09-10 · Memories became notes, and the row grew what a note now carries
**Surface:** web, iOS, Android
**Was:** A Memories section of rows, each a rule in a sentence, capped at ten, with a line at the cap saying to delete one to add another.
**Is:** A Notes section. The same rows, and four things they did not have.

**A note is what any dumped sentence becomes now**, so the row carries a date when the note has one, a `more` mark when a longer body sits behind the 200 characters, and a tertiary treatment for a note that is on the thread and past the prompt budget. A hundred is a budget rather than a cap, so **the cap line is gone** and what replaced it says the opposite thing: not that you may not add another, but that some of these are not reaching offload, beside the rows that resolve it.

**The section also gained a folded history.** A daily job merges and drops what a thread no longer says, and the count of what it folded is one control away. Read, not worked with: those rows do not open and there is no restore. offload rewriting sentences somebody typed and saying nothing about it is the version of this nobody would trust.

**The screens that carry the word and the screen that carries the feature were not the same screens.** `WMemories.jsx`, `MemoriesScreen.jsx` and `M3MemoriesScreen.jsx` are the account-wide browsing screens, which this did not touch beyond the label. The thread's section has never had a mock in any kit, which 008 recorded when it built the section from the component contracts instead, and it is the one that grew.

**The phones' tab glyph stayed `cloudy`.** Looked at rather than inherited: it was chosen for the word Memories, and the screen is still what offload has collected about you, so the glyph was never about the noun.

**Design system impact:** `MemoryRow` needs renaming and four new props: a date, a body indicator, a quiet state for a note past the budget, and the folded-history variant that does not open. `readme.md`'s vocabulary table, its moss note, its pane-head More list, its Notes row entry and its tab glyph line are updated in this change. The three Memories screens in the kits need their label changed. **The thread's Notes section still has no mock anywhere and now carries four states nobody has drawn**: at zero, over the budget, mid-fold, and reading history. That is the gap worth closing first.

### 2026-09-10 · A long press on any row threw, and the row it threw on was a red herring
**Surface:** iOS, Android
**Raised by:** reported as a crash when long pressing a checked todo, hoping for edit options.

**It was not about the row being checked, and it was not about the tick.** `ContentRow.tsx` had a `settle` helper returning a spring, called from inside two Reanimated gesture worklets and read synchronously. Without a `"worklet"` directive it is a plain JS thread closure, which Reanimated proxies as a remote function, and reading a remote function's result from the UI thread throws rather than settling the row.

So it fired on **every** row, done or not, from a long press or from letting a swipe go. The "checked todo" framing came from the reproduction rather than the cause: a half swiped row and a lingering error overlay were eating the taps that would have shown it elsewhere.

Worth keeping because the report pointed at the wrong thing twice over, at the state of the row and at the colour change that had touched this file the same day, and both were wrong. **The stack trace named the line and the line was correct.**

**Design system impact:** none. Nothing about the row's drawing changed, only which thread its animation is created on.

### 2026-09-10 · A reply can be marked up, and the list of what it may contain is short enough to write down
**Surface:** web, iOS, Android
**Raised by:** an answer about connected apps that ran three facts into one paragraph, with no way to link the settings screen it was describing.

**Replies were plain text on every surface**, so a longer one had no shape at all and nothing could point anywhere. offload stays short, but bold, a line break, a list and a quote earn their place often enough that their absence was showing.

**A parser, not a markdown library.** Every package is a superset of what anybody wants: raw HTML, images, tables, autolinking. The honest question is not which library but what a reply may contain at all, and that is six things. Anything else stays as the characters it was.

**No HTML on any surface.** `@offload/markup` returns a tree and each client draws it with its own components, so there is no string a browser parses, no sanitiser to keep correct and no `dangerouslySetInnerHTML` for a later change to reintroduce. On the phones `Linking` is not imported at all, so there is no call that could open an external URL even if the parser changed.

**A link may address a screen offload owns and nothing else.** An external URL in a reply is a phishing surface wearing the product's voice, and the words in it can come from a row a stranger wrote. `https://`, `//host`, `javascript:` and `data:` are all left as literal characters, which is the failure direction that cannot be used against anybody.

**Nothing in the renderer sets a font.** The two bubbles disagree about size and typeface already, so the call site passes what it uses and every block inherits it. A reply that changed typeface partway through would read as two voices.

**The plain case pays nothing.** One sentence parses to one paragraph of one text piece and is returned as a bare string, so the markup never appears for the reply almost every reply is.

**Caps, and they keep what overflows.** Twelve blocks and ten items in a list. Past that a reply is a document and belongs on a screen instead, but the overflow is still said as paragraphs rather than dropped, because dropping is offload deciding somebody did not need to know.

**The prompt and the parser are in two languages**, so a test asserts they agree: everything the renderer draws is taught, and the things every model reaches for by habit and nothing draws, headings, fences, tables, images, are absent.

**Design system impact:** new. A reply bubble can now hold a list, a quote and a link, and none of that is in the kits. Worth drawing: the marker takes tertiary ink because a column of bullets at full weight reads louder than the sentences beside it, the quote takes a rule rather than italics because the reply is already set in the serif, and the list indents one space step rather than the browser's default, which at this measure pushes it halfway across the bubble.

### 2026-09-10 · A repeating event is one row in a list and every cell on a calendar
**Surface:** web, iOS, Android
**Raised by:** a thread whose Timeline was thirty rows of the word Yoga.

**The list and the calendar disagree about repetition, and both are right.** A calendar can draw the same event on thirty days for free: every day already has a cell, and an empty one costs the same as a full one. A list has no grid. Each occurrence spends a whole row to say what the row above already said, and the one-off things, the lawyer, the studio call, get pushed off the bottom by a class somebody goes to every week.

So the timeline collapses a series to one entry and says how often instead. **The occurrences are counted, never hidden**, and nothing changes on a calendar.

**Only the timeline splits.** A repeating event is still one task in To do and one file in Files. Collapsing anywhere else would hide rows that are genuinely separate things.

**The entry stands on the next occurrence that has not happened**, because a repeating thing is a question about what is coming. Once they have all passed it stands on the most recent, which is the same rule read from the other end rather than a special case.

**How often is inferred from the dates, and it declines rather than guesses.** The row carries no RRULE, only the series id the calendar sync wrote, so the cadence comes from the gaps between the occurrences held. Every gap the same gives "every week". One moved week gives nothing at all, and the entry says "12 dates" instead. Saying "every week" about a series with a moved week would be worse than saying nothing.

**A series holding one occurrence stays in the list**, whatever the calendar called it. Collapsing it would say "every week" about a single date.

**The heading is a label, not a section.** No rule above it, no count badge, no add button. 007 already removed headed groups from widgets once for leading with structure somebody has to read, and a repeating set is not a group anybody chose, it is one fact about the rows.

**Design system impact:** the kits' `TimelineWidget` draws a week rail and a granularity toggle and has nothing to say about repetition, so this is new. Web has no timeline mock at all. Worth drawing, because the phone kit's daily view is a calendar shape and should keep repeating every occurrence while its overall view should not.

### 2026-09-09 · Three things the review found in answering, and what each one is now
**Surface:** web, iOS, Android
**Raised by:** the review panel run before 013 merged. All three are gaps between the apply doc and the code that the first log entry did not name.

**`shown` is a prop now, which is what point 3 asked for.** It was two module constants read directly inside the component, so the right numbers landed by the wrong mechanism. A part that reaches for a module constant cannot be drawn twice on one page at two sizes, and the web pane and the composer log are already two places with different room. `ROWS_SHOWN` stays as each surface's default and the call sites can override it.

**Point 4's `20 of 46` header is dropped, deliberately, and this is the record of it.** The header shows the count of what arrived. The count of what exists would need a `COUNT(*)` per result on the read path, and `page()` avoids one by design: it asks for one row more than it needs and reports the overflow as a boolean. The truncated tail already says the rest is in the thread, and the thread page shows the real total when somebody follows it. **Design system impact:** the brief's point 4 should drop "and the header says `20 of 46`"; `AnswerResult.d.ts` should narrow `count` from `number | string` to `number`.

**The phones fold both tails into one, and that is a real divergence rather than an oversight.** Point 4 describes two behaviours: Show more expanding in place, and the thread for a cut-short read. Web does both. The phones do the thread for both, because the conversation is a sheet capped at 78% of the screen and expanding twenty rows in place pushes the sentence that answers the question off the top edge, which is the same measurement that put `shown` at 5. The thread is where somebody works through a long list on a phone anyway. **Design system impact:** the kits should draw the phone tail as the thread in both cases, or say why not.

**Design system impact:** the two fields above, plus `AnswerResult` is still absent from `_ds_bundle.js`, `_ds_manifest.json` and `_adherence.oxlintrc.json`, so none of its prop contract is enforced by `pnpm lint`. Those are generated and are the design system's to write on its next sync.

### 2026-09-09 · The mobile tick was drawn in the wrong white
**Surface:** iOS, Android
**Raised by:** the same review pass, checking 8a's ramp-value defect for others of its shape.

**`useColors().onSolid` is `--text-inverse`, and it flips with the theme.** That is correct on a fill that flips with it, which is `--surface-inverse` and also `--text-accent`, since the accent lightens in dark. It is wrong on moss, blue and clay, which do not flip at all: the glyph went to #191919 in dark and sat on moss green.

`--text-on-solid` is #FFFFFF in both themes and exists for exactly these fills. It was never exposed to the phones, so there was no way to reach it. It is `onBrand` now.

Three call sites were wrong. The answer row's tick, which is new. And `Conversation.tsx`'s Done mark, which drew its glyph with `onSolid` and its label with `text-text-on-solid`, so **one control disagreed with itself in dark**, a white word beside a near-black tick. The web stylesheet had `var(--text-on-solid)` right all along, so this is a parity fix rather than a new decision.

And `settings/Rows.tsx`'s Save, which the answering pass named as the twin of 8a's defect and left for the next settings change. It is worse than the twin: on Android the fill is `bg-blue-600`, which does not flip, while both the label and the spinner used tokens that do, so **"Save" was near-black on blue in dark**. Two fills need two foregrounds, and it has them now. The iOS branch also moves off the ramp value to `--surface-inverse`, which is what 8a asked for.

**Design system impact:** none to the tokens, which were already right. Worth knowing that a phone component reaching for "white on a fill" needs `onBrand` and that `onSolid` means the inverse surface. The rule to carry: a fill that flips takes a foreground that flips, a brand fill takes one that does not, and a control drawing one of each per platform needs both.

### 2026-09-09 · Answering, applied, and one divergence on the failure line
**Surface:** web, iOS, Android
**Raised by:** applying `handoff/APPLY-2026-09-09-answering.md`.

**Points 1 to 8a are built as drawn.** The card with the thread as its header, results below the bubble and controls inside it, `shown` at 8 on web and 5 on the phones, the two tails kept exclusive, the done row on tertiary ink with a strike, ticking as the only write, and the checkbox border at `--border-strong`.

**8a found a real one in shipped code.** `Conversation.tsx`'s calendar control drew its filled primary as `bg-ink-950` with `text-text-inverse`. Those resolve to the same pair as `--surface-inverse` and `--text-inverse` do today, which is luck rather than design: a ramp value pairs correctly only for as long as the two happen to flip together. It is the alias now. **`components/settings/Rows.tsx:257` has the identical shape and is untouched**, because it is outside this feature; it should move with the next settings change.

**The truncated tail needed a column.** `message_content` gained `truncated` in 0029. Without it a reply reopened tomorrow forgets which tail it had and offers to expand into rows nobody fetched. It sits on the join row rather than in a table of its own: one read is one thread here, so every row of a result carries the same value.

**Divergence, point 7.3: the failed treatment still applies to an answering turn.** Partial genuinely cannot happen, since an answer posts answered or failed and never partial. Failed can, and offload never leaves a dead end: a question that failed needs the same sentence and the same Try again a dump gets. The copy stays as it is because the message is saved either way.

**Not built: `QuickReplies`.** Points 9 to 11 are the shape 014 should land in and the brief says they do not block 013.

**Design system impact:** none outstanding for this pass. The kits already carry the parts; what is left is the settings primary named above, which is code's to move.

### 2026-09-09 · Answering has no mock, and three things the kits cannot express
**Surface:** web, iOS, Android
**Raised by:** building 013. The server half is complete and the clients are deliberately not started.

**`find-kit.sh search` and `answer` find nothing**, so this is one of the few screens designed rather than matched. The full brief is `handoff/DESIGN-2026-09-09-answering.md`; this entry is the contract.

**A tickable row does not exist anywhere.** `WRow`'s `check` is a bordered span with no behaviour, because nothing in the kits was ever tickable. In an answer a row is ticked for real, through the same endpoint the thread page uses.

**A done row is not dimmed.** `WThing.jsx:38` draws a completed row at `opacity: 0.5`, and both shipping components reject exactly that in a written comment: never opacity, because dimming a row on a warm page reads as a rendering fault and takes the label under the contrast floor. They use the moss fill, tertiary ink and a strikethrough. **This one is a correction to the kits rather than a new state**, and it applies to `WThing` and the mobile equivalent as they stand, not only to answering.

**A row has to say which thread it came from.** The thread page never needed it, because it draws one thread. `WRow`'s `meta` cannot carry it: it is plain text so it cannot be a link, and it already holds who and when, which matters more here than anywhere because a result in a shared thread can be somebody else's. Results group under the moss thread chip a reply already uses.

**And results sit below the reply bubble, not inside it.** A pane row's hover fill bleeds by `calc(-1 * var(--space-5))`, which is exactly an offload turn's horizontal padding, so inside a bubble it cancels the padding and runs under the 18px corner. Everything put inside a turn until now has been one small fixed control.

**Design system impact:** three things for the kits to gain and one to correct. Gain: a tickable row state, a thread chip above a group of results, and a **Show more** control on a result longer than what a reply draws. Correct: the completed-row treatment in `WThing` and its mobile twin, from opacity to the moss fill with tertiary ink and a strikethrough that both shipping components already use. `ROWS_SHOWN = 8` is a guess in the absence of a mock and is the number most likely to move.

### 2026-09-05 · The phones, and four divergences the kits do not cover
**Surface:** mobile, android
**Raised by:** building 009.

**`Glyph`, not `Icon`, on React Native.** The governed `Icon` contract is DOM-shaped: it masks an
SVG with `currentColor` and takes a `basePath`, which is a URL. React Native has neither, so a
component named `Icon` there would be claiming a contract it cannot implement, and the adherence
lint said so before anything shipped. The paths themselves are generated from the system's own 80
vendored SVGs by `pnpm icons`, so nothing is retyped.

**`ToastHost` wraps `Toast` rather than replacing it.** The first version took a state object and
called itself `Toast`, which the lint also caught. `Toast` now matches its contract and the thing
deciding when to draw it has its own name. That one was the lint being right rather than
inconvenient.

**A thread screen keeps the composer and loses the tabs.** `M3App.jsx:301` sets `showComposer`
false inside a thread and this does not. Dumping from where you are is the product's core move and
a thread is the likeliest place to want it. The tabs still go, so the thread has the screen.

**The bell and the settings icon are not drawn.** Every tab screen in the kit puts both in the app
bar and both destinations are out of scope. Drawing them would be the same thing the attachment
controls were rejected for: a control that does nothing is worse on a phone than absent.

**And Today's own composer is gone.** It was drawn and never wired, which its own comment admitted.
The plate holds the only one now and the day-one examples fill it.

**Design system impact:** four things. The system owes a **React Native icon contract**, since the
current one cannot be implemented there. The **change mark** now exists on three clients and should
be described in `readme.md` beside the two accents, because it is the first pattern that is a
moment rather than a state. **`SwipeRow` is delete-only** and the readme should say so: the glyph
and the clay ground are inside the component and the name reads generic. And **`Chip` still has no
`disabled` prop**, which was agreed and cannot be added here: `_adherence.oxlintrc.json` is
generated on the design system's side, so adding the prop without regenerating the rule would fail
the gate for every client. It needs a sync.

### 2026-09-05 · Six answers the phones needed, and four of them are new surface
**Surface:** web, mobile, android
**Raised by:** 009, which could not start without them.

Six questions had accumulated across 007 and 008 with no answer in any kit. Four blocked tasks in
009 and two change a component contract. All six were put to the product owner together, because
answering them once for three clients is the whole reason to do the phones now rather than later.

**Content row actions on a phone: the swipe deletes, and a long press opens the rest.** No kit
draws a content row action anywhere. `SwipeRow` reveals a delete and nothing else, its `trash-2`
glyph and `--clay-600` ground written into the component with only the label exposed, so a swipe
labelled Archive would show a trash can. And web's set is authorship-conditional, edit and archive
for any member but delete and move for the author alone, so a fixed gesture map is wrong for half
the rows. A sheet lists what you can actually do and omits the rest. *The cost, stated: archiving
is the commonest action and now takes two gestures.*

**Archived content: a toggle in the section header, as web.** The phones' `SectionHeader` already
has an `action` slot, currently carrying "See all", so the mechanism exists and the count stays
visible without going anywhere. *That slot now carries two meanings on one screen, which is the
thing to watch.*

**The memory chip opens into a sheet on a phone, and expands in place on web.** A deliberate
divergence rather than an oversight: the web answer was shaped by having width to spare, and a
phone has a third of it plus a keyboard that has to go somewhere. This is the one interaction here
where the keyboard problem is already solved by the pattern.

**Authorship on a memory chip is the name after the text, in a lighter weight.** What web already
does. `MemoryChip`'s small dot was the nearest precedent and it marks which person a memory is
*about*, not who wrote it, so borrowing it would have overloaded a meaning that already exists.

**The change mark is the moss fade, everywhere.** A moss background settling to transparent over
1400ms on anything that arrived while somebody was looking at the screen. It becomes the system's
pattern for *offload did this while you were watching*, unchanged on the phones, since it is a
background animation and Reanimated does it identically. Moss already means "offload did this, you
didn't", so this is the existing vocabulary rather than a new one. Reduced motion drops it to
nothing rather than shortening it.

**`Chip` gains a `disabled` prop.** The contract had none and the component derived interactivity
from whether it had a click handler, so an unavailable chip was indistinguishable from an
available one. The readme already specifies the treatment, an `--ink-100` surface with `--ink-400`
text and explicitly no opacity fade, so this is wiring an existing decision into the one component
that skipped it.

**Design system impact:** substantial and none of it optional. `Chip.d.ts` and `Chip.jsx` gain
`disabled` and the generated lint rule regenerates with it. The change mark needs describing in
`readme.md` beside the two accents, since it is the first pattern that is a moment rather than a
state. `SwipeRow` stays delete-only and the readme should say so, because "swipe row" reads
generic and it is not. And four things now exist in the product with no kit drawing: the memories
section, the memory editor sheet, the archived toggle, and the long-press action sheet.

### 2026-09-04 · A screen catches up on its own, and the mark for it is moss
**Surface:** web, and mobile owes the same
**Raised by:** the product owner.

**offload can file into the thread you are looking at**, because the composer floats over every
tab. Until now the page went on showing what it held a moment ago while the reply said otherwise,
which is the same class of untruth 004 exists to retire, arriving from the other direction. The
thread the turn wrote to now refetches itself, and whatever was not there before is marked for
1400ms.

**The mark is moss, and the product owner asked for blue.** Worth recording because the request was
reasonable and the answer is in this system's own colour rules: `--blue-600` means *this needs you*,
for something waiting, unresolved or about to expire, and `--moss-600` means *offload did this, you
didn't*, with the "what moved" surfaces already among its listed uses. A row offload filed correctly
needs nothing from anybody. Blue would also break the rule that the two accents never appear on the
same row, on any flashed row that is also a task waiting on you. The product owner agreed. *There is
no signature blue: the mark itself is one colour, ink or paper, no accent.*

**The memory editor opens inside the chip it belongs to.** It used to sit at the foot of the
section, so editing the third memory looked like editing the last one. The chip now grows to hold
its own editor, animated on `grid-template-rows` from `0fr` to `1fr`, which gets a real height
transition with no magic number in it; a `max-height` guess has to clear the longest memory and then
spends most of the close above the content, which reads as slow.

**A section with nothing in it draws nothing at all**, Memories and the content list alike. A
heading over an empty row is a section announcing its own absence, which is what the standing
summary already refuses to do. The consequence is that the way into an empty Memories section has to
come from outside it, so the pane head gained a `plus` tool beside the rename pencil.

**Done means something was done.** The tick on a dump meant the turn ended, so a question that got
an answer and a request that was refused both wore one: "delete the EU with fam thread" came back
"threads can't be deleted" under a green Done. It is gated on the same record the Undo toast uses,
which is what offload actually wrote rather than what it said about itself. A turn that answers
without doing gets no marker, which is right: nothing happened that could be undone or checked.

**The focus ring was being clipped in two places, and one of them was old.** `.paneTitle` carries
`overflow: hidden` so a long thread name gets an ellipsis, and renaming puts an input inside that
element, so the global 2px ring at 2px offset was cut down to four corner marks. The clip lifts
while there is a field in there, since the ellipsis is only wanted for the static title. The memory
editor had the same shape of bug from its own animation clip, and the fix there is 5px of room,
which is the first value that clears a ring reaching 4px past the box. *The version of this file
that shipped an hour earlier answered it by removing the ring on that one field, which `globals.css`
forbids in the same line that defines it: "it is never removed." Reverted.*

**There is no add control for the first memory on a thread, and that is deliberate.** A `plus` on
the pane head was tried and pulled: it said nothing about what it added, and nothing else on the
screen has an add. Combined with hiding empty sections, the consequence is that a thread with no
memories offers no way to type one, and the first one has to come from telling offload, which is
the product's usual way in and what `add_memory` is for. Every one after that is typed in the
section. *Flagged rather than buried: if that trade turns out wrong, the answer is the `ellipsis`
More menu `WThing.jsx` already draws and this app has never built.*

**A control that has to exist whatever a section holds belongs on the pane, not in the section.**
The archived pile was reached from a button inside the "Everything in here" heading, so that heading
had to survive an empty list in order to carry it, and a thread with nothing loose and one archived
row drew "Everything else 0" for no other reason. It is a tool in the pane head now, beside rename
and add memory, and inverts to ink while the archived view is on because the heading no longer says
which view you are in. Same reasoning that moved the add-memory control there.

**Design system impact:** three things, none of them none. The kits have **no change mark at all**,
and one is now needed on any surface offload can write to while somebody is looking at it: the
thread page, Today, and the phones. The **memory chip has an open state** that no kit draws, where a
pill becomes a container holding a field and four controls. And the **thread pane head now carries
two tools plus Open full**, where `WThing.jsx` draws `maximize-2` and `ellipsis`; the honest reading
is that these belong behind the `ellipsis` the kit already has, and the kit should say what is in it.

### 2026-09-04 · A memories section, and the kits are behind the contracts
**Surface:** web
**Raised by:** 008, and by the client review of its spec.

**A thread now has a Memories section**, between the widgets and "Everything in here". Up to ten
chips, each a standing rule the thread holds about itself. Clicking one edits its full text, the
author gets Delete, every other member gets Mute, and a trailing outline chip adds one.

**No kit draws it**, and the interesting part is what happened when I looked for the nearest thing
that did. `WThing` has no memories section. `WMemories` and `WPerson` both have chip rows, and both
pass `Chip variant="soft"`, which the governed contract does not declare, which the generated lint
rule rejects, and which `readme.md` retired on the grounds that the soft tints sat too close to
paper to read as colour at chip size. `WSection` is kit-local scaffolding rather than the governed
`SectionHeader`, and it invents a toned count pill `SectionHeader` has no prop for.

**So this was built from the component contracts with the kits as shape reference.** That is the
opposite of the usual failure here, which is reading the readme instead of the kit. The kits were
read whole, and the kits are what is stale.

**Two things the `Chip` contract does not have**, both worked around rather than added to it:
`disabled`, so at ten the add control is replaced by the sentence "This thread already holds ten.
Delete one to add another" rather than greyed out, which also puts the way forward where the
affordance was. And any width handling: `Chip` is `nowrap` with no `max-width` and no ellipsis,
every label in every kit is under twenty characters, and a memory runs to sixty on the chip, so the
ceiling and the ellipsis live in the screen.

**Design system impact:** not none, four things. The kits' own chip rows still pass the retired
`variant="soft"` and need it removed. A memories section is needed on the thread screen across web,
mobile and android, and nothing in any kit draws one. **Authorship on a chip has no precedent
anywhere**: `MemoryChip`'s dot marks which person a memory is *about*, not who wrote it, so a shared
thread showing who wrote each rule needs a real pass. And `Chip` has no disabled state, which this
screen avoided needing; the next screen may not be able to.

### 2026-09-04 · Larger text scales text, not the layout
**Surface:** web
**Raised by:** the product owner, the same day the control shipped.

**`zoom` was the wrong mechanism and it failed in the obvious way.** Larger text was one line,
`shell.style.zoom = 1.15`, and `zoom` scales layout with it: the 248px sidebar became 285px, the
520px pane became 598px, and the right-hand pane went off the edge of a laptop screen. What
somebody asking for bigger text wants is text taking more of the space it already has, not the
same layout rendered on a smaller screen.

**So the scale is real now, and it is only type.** `--type-scale` on `:root`, `1.15` under
`:root[data-type="large"]`, and every text size in the shell reads `calc(Npx * var(--type-scale))`
while every width, gutter, radius and icon stays a literal pixel. The four token sizes in use
(`--size-body`, `--size-body-sm`, `--size-caption`, `--size-label`) are overridden in the same
block, because the rules that set `font: var(--text-body-role)` would otherwise be the only text
on the screen that did not move.

Two details worth keeping. The `font:` shorthand had to be split into longhand in 21 rules: a
calc in the size slot sits directly before the `/` that introduces the leading, and that is
ambiguous enough that it is not worth relying on. And the map pin keeps its literal 11px, because
it is centred in a fixed 22px circle by its own line-height, so growing the text there would break
the circle rather than fill it.

**Design system impact:** this is the type scale the previous entry said the token set should
own, built in the app because the app needed it that day. When the design system takes it, it
takes `--type-scale` and the size overrides and the app reads them instead of defining them. The
rest of that entry stands: the kit still has no theme switch and no type-size control and needs a
view on both.

### 2026-09-04 · Open full goes on the pane, and a link opens one pane
**Surface:** web
**Raised by:** the product owner, on a run of divergences from the kits.

**Open full was in the crumb bar and belongs on the pane.** `WThing` passes
`tools={[["maximize-2","Open full"],["ellipsis","More"]]}` to `WPaneHead`, so it sits at the end
of the pane's own head, after the faces and Share. It is a thing you do to this pane, so it lives
on the pane; in the trail it read as navigation.

**How it got there is the part worth recording.** I found the right file and grepped it for the
line I expected. `WThing` puts the title and the tools on consecutive lines, so searching for the
title returns everything except where the button goes, and a grep that returns something makes
you stop looking. The same habit produced the badge tones the wrong way round, the missing first
group heading, the seam on the wrong pane and a composer with no header. `.claude/scripts/
kit-component.sh` prints a component whole for this reason, and `CLAUDE.md` now says to run it
after `find-kit.sh`.

**A link opens one pane.** Two panes are what you get by walking from one screen into another,
which is a fact about the journey rather than about the destination, so the journey carries it
in a `from` query. Opening `/threads/:id` cold shows that thread alone: a link somebody sends
should open the thing it names, not the thing plus a list. *This reverses the reasoning recorded
on 2026-09-03, which made the stack purely route-derived so a shared link would reproduce both
panes. That was the wrong instinct about what a shared link is for.*

**Two controls that are not in the kit at all**, at the foot of the nav beside Settings: light
and dark, and larger text. The type scale was checked first and the app already matches the kit
exactly (13, 13.5, 14, 14.5, 15.5, 18, 20, 25); the kit only looks larger because it renders in a
fixed 1440px canvas.

**Design system impact:** the kit has no theme switch and no type-size control, and it needs a
view on both. **Larger text was `zoom` here and is not any more**: it scaled the
layout with the text and pushed a pane off the screen, so it is a real type scale as of the entry
above, still defined in the app rather than in the token set. There is also no `minimize-2` in the vendored icon set,
so Open full uses the same glyph both ways and lets the label carry the direction.

### 2026-09-03 · The mark, in the four places it was missing
**Surface:** web, marketing
**Raised by:** the product owner.

**The sidebar's logo was the threads icon.** `lasso` is the glyph a thread carries, so the
product's own name was wearing one of its nouns. It is `Logo tone="inverse"` now, which is the
component that already existed and matches the contract in `components/brand/Logo.d.ts`.

**The composer's conversation header used sparkles**, which the kit does. Sparkles is the glyph
for anything **offload derived**, and that is a different claim: it belongs on a tag it inferred,
not on the product saying something. The mark, at 15px. *Worth raising with the kit rather than
just changing: the fixture there shows a thread name beside it, and the sparkle reads correctly
for a summary offload wrote. It reads as a claim when the thing beside it is your own sentence.*

**There was no favicon at all**, so every tab said nothing. `app/icon.svg` is the design system's
`assets/app-icon.svg` verbatim: the ink tile with the mark in white, which is the one version
that reads on both a light and a dark browser chrome. A bare mark would have vanished on dark.

**The marketing mark went nowhere.** It is the first thing anybody tries on a marketing site, and
on `/privacy` it is the only navigation there is, so a reader who followed a link had no way back
to what the product is.

**Design system impact:** one question for the kit. `WComposer` puts sparkles on the open
conversation's header, and the mark is the better glyph there for the reason above. Everything
else was the code catching up.

### 2026-09-03 · The pane slide, and printing a thread's contents once
**Surface:** web
**Raised by:** the product owner, watching the running app beside the kit.

**The pane animation read as a glitch rather than a reveal, and the animation was not the
problem.** Every route fetched its own copy of My threads, so opening a thread unmounted the
list, showed nothing, and filled it back in a moment later, while the pane it lives in was also
sliding. Two things were moving and one of them was empty. No amount of tuning the curve would
have fixed it: the pane had no content to show while it moved. The list is fetched once by the
shell now and read by everything under it, and **only the arriving pane animates**, on the kit's
own curve, in from the right over 260ms. The pane behind stays still, which is what makes the
new one look revealed rather than everything look redrawn.

**A thread's contents are printed once.** A widget lifts its rows out of the list below rather
than duplicating them, and that list is headed **"Everything else"** once anything has been
lifted, or "Everything in here" when nothing has, because otherwise it is else to nothing. The
kit only ever draws the second heading, having no widgets in its web pane to lift anything.
Printing a task in the to-do list and again underneath is the same information twice and makes a
thread look longer than it is.

**The count follows the list.** It is shown only when the whole list is loaded, because a number
that counts one page disagrees with the list under it the moment somebody scrolls.

**The composer gained its header.** An open conversation had no way to be closed: the kit's
sparkles, title, expand and close were missing entirely, so the composer grew and stayed grown.
Expand is inert, since a conversation of its own is not built. The title is your own opening
line rather than a thread name, because offload does not name conversations yet and the kit's
fixture has one where a real conversation does not.

**Design system impact:** the "Everything else" heading is new and the kit should carry both,
with the rule for which appears. The composer's title needs a decision the kit has already made
for a case that does not exist yet: it shows a thread name, and a conversation is not about one
thread.

### 2026-09-03 · A pass over the web UI against the kit, and what it exposed
**Surface:** web
**Raised by:** the product owner, with screenshots of the kit beside the running app.

**The build had drifted a long way from `ui_kits/web_app` and most of it was one omission.**
There were no icons at all: the shell used text glyphs where every kit uses Lucide. The design
system vendors eighty of them in `assets/icons/`, so they are copied into `public/icons` and
rendered as a `currentColor` mask, which is the kit's own `Icon` primitive rather than a new
one. `.claude/scripts/dead-icons.mjs` now checks every slug resolves, because a name that does
not exist renders an empty box and nothing complains: no error, no warning, no build failure.
Same invisible failure as a Tailwind class nobody defined, which is why it sits beside the two
scanners that already exist for that.

**Fixed to match the kit:** crumbs are chips with glyphs and the current one inverts to ink;
the top pane is raised and the ones behind it are the page, which is what makes a stack read as
a stack; head and body share the 700px reading measure; a section rule is solid ink rather than
a hairline, which is what makes it a break rather than a divider; rows carry a 32px tile, a
15.5px title and an inset separator so a row that loses one does not change height; the composer
is the rounded card with a blue ring rather than a bar with a border; delete asks in the row's
own place before the eight seconds.

**Two things I had backwards and would not have found without the screenshots.** The badge
tones: `WThings` gives "Always on" the accent and leaves "Older threads" on the default, so the
solid blue lands on the group that is finished rather than the one that never closes. And the
first group has no heading at all, which reads as obvious on screen and as an omission in code.

**One thing the kit draws that the code should not have.** The sidebar's Pinned group took the
first three threads by recency and called them pinned, so a thread created a minute ago appeared
pinned to itself. Nothing pins, so nothing is shown as pinned. **Real pinning is `pinned_at` on
`thread_members`**, per person because threads are shared, and it arrives with the control that
sets it. A group that looks like a feature misbehaving is worse than one that is absent.

**One behaviour changed on the product owner's call, and it is a good rule.** A ticked task
sinks to the bottom of its list rather than leaving it: its importance drops below everything
still outstanding the moment it is finished. It stays visible, struck through, because something
you did this morning disappearing is how you end up wondering whether you did it, and the tick
is the reward for doing the work.

**Design system impact:** none of the above is a change to the design, it is the code catching
up. Two things do belong to the kit. **Pinned needs a source**: it is drawn with a `+`, which
implies somebody chose what is in it, and nothing in the data model says what. And the kit has
no completed-task state in a list, which it now needs, because a ticked row stays.

### 2026-09-03 · Widgets, and a group heading that had to be invented
**Surface:** web, and the phones next
**Raised by:** the codebase, building feature 007.

**Built to the kit.** `M3ThreadWidgets.jsx` states the rule and the code follows it: widgets a
thread earns from its own contents, a map when it has places, a timeline when it has dated
steps, a file grid when it has assets. None is ever drawn empty and none is configured into
existence. The map is pins on a plain surface with "drawn from real coordinates" behind them,
which is exactly what the kit draws and is now a decision rather than a placeholder: real tiles
would mean a map company receiving where somebody has been, and nobody needs that yet.

**One: the kit filters, the code groups.** `ChipRow` is a single-select filter above a flat
list. The product owner asked for grouping, which is headed sections, and both may eventually be
wanted. **Shipping both without deciding which is primary is how a screen ends up with two ways
to do one thing**, so only grouping is drawn. The kit should decide, and if the answer is both,
it should say which one a thread uses by default.

**Two: a group heading is new surface, and there was nothing to reuse.** The 21 components offer
`SectionHeader`, 21px semibold over an ink rule, which is far too heavy for a sub-group inside a
widget that already has one, and `Chip`, which the kit uses with `tone="accent"` and a sparkles
glyph for anything offload derived. The heading is built from that vocabulary: 12.5px, accent,
lowercase, with a small mark. **It is the weakest thing in this feature** because it is the only
part with no drawn precedent, and it is the first thing to look at on the next sync.

**Three: the unnamed group has no heading at all.** Rows carrying no tag in the dimension a
thread groups by go last, under nothing, or under "Everything else" when there is more than one
group. Not "Other", and not "Untagged": both are labels offload would be inventing for content
nobody categorised, and the whole pitch is that nobody has to categorise anything.

**Four: a ticked row stays in the list, struck through.** No kit draws a completed task in
place. It does not vanish, because Undo needs something to point at and so does the person
wondering whether they already did it.

**Design system impact:** the group heading first, then the filter-versus-group question, then
the completed and archived states. The widget contract is defined once in code
(`lib/widgets.ts`, mirrored in the Core API) so the phones render the same four widgets from the
same data when their turn comes, which is what parity means here.

### 2026-09-03 · The thread page, and four places the kit and the code disagree
**Surface:** web
**Raised by:** the codebase, building feature 005.
**What shipped:** the shell, My threads, a thread page and a content pane, built from
`WApp.jsx`, `WMisc.jsx` and `WThing.jsx`. What follows is only where the code came out
different, and each one is deliberate.

**One: no summary, nothing drawn, and the web kit was right.** `WThing.jsx` has
`{st ? ... : null}`; the phones render "offload has not summarised this one yet" from a
`Standing` component. This shipped with the phones' line and the product owner reversed it the
same day: **a line saying offload has not done something is not information, it is an apology
occupying the most prominent space on the screen.** Nothing writes summaries yet, so the block
is simply absent, and the day one lands it appears with something in it. **The phones should
drop the placeholder**, which is the opposite of what this entry first said.

**Two: delete is drawn on every row and belongs to the author.** Both kits put `trash-2` on
every row unconditionally. OFF-3 says a member can never delete what is not theirs, so the
control is conditional now, and the server computes the flag rather than the client inferring
it. **The kits should draw the row tools as conditional.**

**Three: archive has a control everywhere and a destination nowhere.** Every kit draws an
`archive` tool and no kit draws what an archived thing looks like or where it goes. 005 gives it
one: a section header that toggles between "Everything in here" and "Archived N", with archived
rows dimmed. Invented here, and the weakest of the four, because it is the only one with no
drawn precedent. **Worth designing properly.**

**Four: the composer was still on Today, and is not any more.** `WMisc.jsx` states it plainly:
"one composer, under both panes, spanning the window. It never belongs to a pane." 005 shipped
it on Today anyway and logged the difference as a debt. **The product owner reversed that within
hours**, and the readme already held the argument: the composer is a tool rather than a chat, so
a place you can say things cannot be one tab. It is in the shell now, on every tab, and the kit
and the code agree again. *Left in this entry rather than deleted, because "the kit says X and
we are doing Y for now" appearing twice in one feature is the thing worth noticing.*

**Five, new: offload's reply links to the threads it wrote to.** No kit draws this. A reply
saying "Added to Flat admin" now carries Flat admin as a pill you can open, built from the
content rows the turn actually produced rather than from the words in the sentence. **The kits
should draw it**, and the honest place is beneath offload's turn in the composer. It matters
more than it looks: it is the first time the composer does something other than talk, and the
readme's claim that any UI task can be said rather than tapped starts here.

**Design system impact:** two, three and five are kit changes on the next sync, listed in the
order they matter. One is now a change to the *phones* rather than to web, and it is a deletion.
Four is closed. Separately,
the design system has **no breakpoint tokens**, and the shell needs one: 1180 comes from
`WApp.jsx`'s own preview toggle and now lives as a literal in one stylesheet, deliberately in
one place rather than two. A `--breakpoint-*` family would be worth adding.

### 2026-09-03 · Undo is the Toast as drawn; the partial reply is new surface
**Surface:** web
**Raised by:** the codebase, building feature 004.
**Undo, and why there is nothing to decide here:** offload now files what you dump, so it needs the
one way back the readme promises. That is `Toast`, whose contract already says it: ink bar, one
optional action, "float it above the composer with 16px of side gutter", eight seconds. Built to the
contract, with the message naming the threads from offload's own reply so the toast and the
conversation cannot disagree about where something went. `role="status"` rather than `alert`,
because a confirmation is announced without interrupting.
**The partial reply, which is new:** a turn can now file some of what you dumped and not the rest.
No kit draws that. It reuses the treatment 003 invented for a failed message, inline and persistent
rather than a toast, for the same reason: a toast clears itself after eight seconds and would take
the only way forward with it. The copy differs because the situations differ. A failed dump says
"offload could not answer that one. Your dump is saved." with **Try again**, which puts the text
back in the composer. A partial one says "offload did not finish that one." with **Finish it**,
which asks offload to do the rest. Saying "try again" on a partial turn would invite somebody to
re-send a dump that is already half filed.
**Why two words and not one control:** the two states want opposite actions. One has nothing in a
thread and everything in the composer; the other has the reverse. A single "retry" that did the
wrong one of those in either case would file half a dump twice.
**Not on screen together:** a finished turn offers Undo, a partial one offers Finish it, never both.
Asking somebody to choose between finishing and undoing inside eight seconds is not a choice.
**Design system impact:** two things for the next sync. **One:** the web kit has no failed and no
partial state for a composer turn, and now both exist in code. `WToday.jsx` should draw them, and
the phones need the same pair when their composer stops being inert. **Two:** the readme's Undo
section describes the toast for a delete. It now also covers an automatic action offload took on
its own, which is the commoner case by far and reads slightly differently: "Sorted into Lisbon trip"
rather than "Lisbon trip deleted". Worth a line.

### 2026-09-03 · The retired word gets a name in code, and still has none in copy
**Surface:** iOS, Android, web, admin
**Raised by:** the codebase, building feature 004.
**Was:** "thing" was the product's noun for one piece inside a thread, in the kits, in the specs
and in the schema. It was retired on 2026-09-02 as user-facing copy, with the instruction to
reword around it rather than swap in a synonym, which is why a count in the kits now reads "4"
and not "4 things".
**Is:** the split is now explicit and runs along the audience line. **In schema and code the noun
is `content`**: feature 004 creates the table and the identifier families that go with it
(`content_count`, `content_blobs`, `content_id`, `readable_content`). **In anything a person
reads there is still no noun at all.** A thread holds what you dumped in, a count stands on its
own, and no screen ever says "content" any more than it said "thing".
**Why a synonym in code and none in copy:** a table needs a name and `content` is the plainest
one available, but the same word on a screen would be worse than the one it replaced. "Thing" at
least sounded like a person talking. "Content" sounds like a CMS, and the whole argument for
retiring the word was that naming the unit makes people think about filing, which is the thing
offload exists to take off them.
**One collision, accepted:** `content` is also the general word for what people dump, in OFF-1
and in the model API's own content blocks. Disambiguated locally in code, not by finding a third
word.
**Design system impact:** the kits and `data.js` still say `thing` and `things` throughout, and
the explorations do too. **The kits should catch up; the explorations should not.** An
exploration log is a record of what was tried on a date, and rewriting one to match a decision
taken afterwards falsifies it. The concrete list for the next sync: `WThing.jsx` and its route,
the `things` arrays in `ui_kits/mobile_app/data.js`, and the vocabulary section of `readme.md`,
which is the contract rather than a record and is the one that matters most.

### 2026-08-31 · Today's composer is inert while feature 002 is the only thing built
**Surface:** iOS, Android, web
**Raised by:** the codebase, during the spec review for 002.
**Was, and will be again:** every empty screen keeps a working composer, "because on every one
of them the answer is to dump something", and day one on Today shows three dashed examples that
fill it. First run's third screen teaches exactly that, one screen before landing there.
**Is, temporarily:** feature 002 builds the way in, the waitlist, the invite, sign in and first
run, and nothing that can accept a dump. So Today renders its designed empty state with a
composer that cannot submit.
**Why this is not a design change:** nobody real is invited during this window. The feature is
done when the team can get in, not when a stranger can, and the promotion path runs against our
own accounts until the dump loop ships in 003. A person invited into an app that just taught
them to dump, and then cannot take a dump, would be the worst possible first impression, and
not sending the invite avoids it entirely.
**Design system impact:** none, and deliberately so. Nothing in the kits changes and no copy is
rewritten. This entry exists because OFF-7 requires a divergence to be logged even when it is
temporary and self-resolving, and because the resolution is a scheduling promise rather than a
code change: **this entry is closed by 003 shipping, not by anything in 002.**

**Amended 2026-09-02:** 003 is web only, so it closes this for web and leaves it open on the
phones. Their composer stays inert until their own feature lands, and the promotion discipline
above, no real invites while a composer cannot take a dump, still binds because a person invited
today reaches a phone before they reach a browser. *Amended rather than rewritten: the entry
promised a resolution on three surfaces and one of them is arriving, which is exactly the kind of
half-kept promise that reads as kept if nobody writes the other half down.*

### 2026-08-28 · One dump can become several things, and it lives in the composer
**Surface:** iOS, Android, web
**Raised by:** the codebase, then corrected by the product owner.
**Withdrawn, the part about Today.** An earlier version of this entry asked what a dump looks like
on Today. That question was based on a misreading: Today is a summary assembled from threads and
calendars, not a feed of dumps, so a dump never appears there at all. The voice-note row the kits
show, `Oak brackets, 30cm, matte black · Bookshelf build · voice note, 0:14`, is a thing in a
thread that came from a voice note. Apologies for the noise.
**What is actually true:** a dump is a message in a composer session, of a kind that is not
necessarily text, and offload replies to it in the same composer. One dump can now produce several
things, each filed into its own thread. A dump is visible in conversation history and nowhere else.
**What may need design:** the composer's reply when one dump became several things in several
threads. "Saved to Lisbon trip" assumes one destination. Also the share-sheet case, where someone
shares from Safari with the app closed and later opens it to find the dump and offload's reply
waiting in a conversation they did not start.
**Design system impact:** composer reply copy in all three kits, and possibly the conversation
entry point for a dump that arrived while the app was closed. Lower priority than it looked
yesterday, since no list screen is affected. Not yet done.

### 2026-08-27 · Removing a shared thread is leaving it, and the kits draw one control
**Surface:** iOS, Android, web
**Raised by:** the codebase, while settling how threads are owned.
**What the codebase decided:** a thread has members and no owner, because an owner would be a
role and the single permission rules roles out. So removing a thread other people are in cannot
destroy it, since that would delete things you did not author. It removes your membership and
your key, and every other member's view is untouched. The thread and its contents are deleted
only when the last member leaves, at which point nobody remains who could read them.
**What is missing:** the kits give a thread one destructive control, the same swipe-to-delete and
the same undo toast as anything else. That control now does two different things depending on
whether anyone else is in the thread, and the difference matters: one is reversible and private,
the other removes you from something shared with other people.
**Questions for design:** does a shared thread show a different word, Leave rather than Delete,
and does it need a different confirmation given the swipe is the same gesture? Does the toast say
something different? And is there anything to show for the case where you are the last member and
leaving really does destroy everything, which is the one place the action is not recoverable
after the undo window.
**Design system impact:** the thread row's swipe action and its toast copy in all three kits, and
the thread menu on web. The Ending things settings page may also want a line, since it covers
deleting things without mentioning shared threads. Not yet done.

### 2026-08-27 · A thing has no designed appearance between being dumped and being sorted (name resolved, row state open)
**Surface:** iOS, Android, web
**Raised by:** the codebase, while settling the processing model.
**What is missing:** sorting is asynchronous by design, because putting something down must be
instant and the filing happens afterwards. So there is a window, usually short but not always,
where a thing exists and its thread is not yet decided. Today rows show the thread as metadata,
`Lisbon trip · from Safari`, and there is no drawn state for a row that does not have one yet.
**What the codebase decided:** every thing has a thread from the moment it is written, and a new
dump lands in a default thread that every account has, which the sorter then moves it out of if
it belongs somewhere better. That keeps the data model free of an unsorted state, but it means
the row's metadata changes shortly after it appears, which is a visible thing that needs
designing rather than happening by accident.
**The name is answered.** The brand owner named it **Miscellaneous** on 27 August 2026. Set in
sentence case to match every other thread name in the kits, "Read later", "Gift ideas", "Flat
admin". It is an ordinary thread: it opens, holds things, and can be renamed.
**What is still open:** what a row looks like in the moment before its thread is known. Options
might be showing Miscellaneous and letting it change, showing nothing where the thread would go,
or a quiet marker. The row must not reflow when it settles.
**Design system impact:** the Today row spec in all three kits, the My threads list which will
show the default thread among the others, and the empty-state copy for it. Not yet done.

### 2026-08-26 · The share sheet does not say what happens when a member deletes their account
**Surface:** iOS, Android, web
**Raised by:** the codebase, while settling how shared content is keyed.
**What is missing:** the share sheet states one permission, "they can add to it, they can never
delete what is yours", and that is the whole of what a person is told before they share. It says
nothing about what happens to their things in that thread if they later delete their account.
**What the codebase decided:** a shared thread is co-owned and outlives any one member. Deleting
an account removes that person's private things and their access, and leaves their things inside
the shared thread in place, because the thread belongs to the others too. Account deletion never
cascades into a shared thread.
**Why it needs design:** that is a consequence a person should agree to in advance rather than
discover afterwards, and it is the kind of thing that reads as a betrayal if it surfaces later.
It is also the natural counterpart to the permission line that is already there: one sentence
about what they can do, one about what happens if they go.
**Design system impact:** needs a second line in the share sheet in all three kits, and probably
a line in the Ending things settings page, which currently covers deleting an account without
mentioning shared threads. Copy is design's call, not the codebase's. Not yet done.

---

## 2026-09-05

### 2026-09-05 · The design queue, answered
**Surface:** all
**Raised by:** the design system, then decided by the product owner off `explorations/design-queue.html`.

Fifteen things the codebase built without a kit to build from, put back as options with what the app
does today beside each one. Every answer below is the product owner's. Where an answer differs from
what shipped, the code changes: this is design leading on new surface, not overruling a divergence.

**1. Memories are rows, not chips.** A list is clearer, and a chip truncated a 200-character rule to a
window you had to click to read. `MemoryRow` is in the system, and the chip rows in `WMemories`,
`WMisc`, `MemoriesScreen` and `M3MemoriesScreen` are the shape reference rather than the answer.

**2. The editor opens inside the thing you clicked.** With rows that means the row expands, which is the
same principle the chip version had and one fewer object on the screen.

**3. The archive is a row at the foot of the list, not a tool on the pane.** It becomes a place you go
rather than a mode you toggle into, and the count reads without finding a highlighted icon. The pane
head loses the archive tool, and `Archived` is not in the More menu either: it is in the list.

**4. A finished task keeps its place, and past five the list collapses.** Tertiary ink and a 1px strike,
no opacity. Beyond five finished, the five most recent are shown with a "Show all" beneath them, so a
long-running thread's to-do list stays about what is left without hiding that the work happened.

**5. Row actions are conditional, and the fourth one goes behind More.** Edit and archive for any
member, delete for the author alone and absent otherwise. Anything beyond those three is in a
`RowActionSheet` on a phone or the row's `ellipsis` on web.

**6. The pane head gets a More menu.** Two tools, Open full and `ellipsis`, and the menu holds rename,
add memory and Leave. The kit already drew the ellipsis; now it says what is in it.

**7. The phones keep both gestures.** A swipe deletes, a long press opens the rest. It is the only
option where a swipe means the same thing in every list in the product, and `RowActionSheet` is now a
governed component rather than a screen's invention.

**8. `Glyph` is a second contract, not a rename.** Same 80 slugs, same sizes, a `color` prop in place of
inheritance, path data in place of a URL. The adherence lint was right to treat them as different
components.

**9. A widget filters, it does not group.** This one reverses what shipped: `Widgets.tsx` groups into
headed sections and the kit's `ChipRow` filter is the answer. A screen whose promise is that nothing
needs filing should not lead with structure somebody has to read; a filter answers "show me the
receipts" in one tap. **The group heading goes**, and with it the sub-heading rank the design system was
going to need. Code change, listed for the next sync.

**10. The turn carries its own failure.** A clay border on the message you wrote, one line beneath it.
Tighter than a tinted card in the middle of a conversation, and the failure is attached to the thing
that failed. Same treatment for failed and partial, different words and different action.

**11. The reply's thread pills stay**, with the single-thread refinement: when a turn touched exactly
one thread, the pill is the only mention and the sentence drops the name.

**12. Theme and text size are named rows in the nav foot, and a Settings page as well.** Both read the
same stored value. The two unlabelled glyphs go: an accessibility control nobody can name is not one.

**13. Leave and Delete are different words**, with the confirmation naming the other members. **No
last-member warning banner**: the confirmation already says nobody else is in it, and a second
paragraph in a tinted box over one sentence is more alarm than the situation earns. The clay stays on
the last-member action, because that is the one case where leaving destroys something.

**14. A row waiting on its thread says "filing", in moss.** The system's first per-row progress word,
taken deliberately: it reads as work happening rather than as a correction (Miscellaneous, then the
real thread) or as a bug (an empty slot). Nothing reflows when it settles.

**15. The share sheet says what a shared thread is, and stops stating the permission.** The longer
paragraph goes in, and the permission line comes out: "A shared thread belongs to everyone in it. If
somebody leaves offload, the thread and everything they added stay with the rest of you." Confirmed by
the product owner after the conflict was raised, so this is a deliberate reversal of the 25 August
decision that the permission appears identically everywhere. The permission itself is unchanged and
still enforced; what changed is that the sheet is one sentence long and now spends it on the thing
nothing else said. The Ending things settings page gains the account-deletion half, which is where
somebody goes looking for it, and that page also loses a retention line that the 27 August decision
had already retired.

**Design system impact:** `MemoryRow` and `RowActionSheet` are built, `readme.md` carries the finished,
archived, filing and conditional-action rules, the vocabulary table carries Leave, Delete and filing,
and the `Glyph` contract is described. **The kit screens are not done yet**: the thread page on three
clients, the composer on web, the nav foot and a Settings Appearance page, and the share sheet once 15
is settled. Two things for the codebase: **grouping comes out of the widgets** in favour of the filter,
and **the two preference glyphs get labels**.

### 2026-09-07 · Settings ships, and three things differ from the kits
**Surface:** all
**Raised by:** the code, building 010. The kits have drawn Settings for a long time; this is the first of it to exist.

**Is:** an index and three pages on all three clients, out of the kits' ten. Six of the seven not built have no feature behind them, and the seventh is named below. Three things differ from what the kits draw, each for its own reason.

**Sign out is on the web index, which no kit draws.** Both phone kits put a secondary button beside the identity block; `WSettings.jsx` has one only on the account page. It is on web's index anyway, because this is one product with one behaviour and somebody on a laptop should not have to open a page to leave. New surface, small, and worth the parity.

**My account drops four rows the kits draw, for three different reasons.** Phone and Password go because this product is OAuth-only: there is no password to change and no phone stored, so both would be controls that do nothing. The Plan group and the identity subtitle's "· free plan" go because there are no plans, and inventing a tier on a settings screen is a product claim nobody has made. The clay "Delete your account" panel goes because deletion is specified in 001 and not built; a panel that does nothing is worse than its absence.

**Appearance is a `SegmentedControl` on the phones too, not the kits' radio list.** The 5 September entry already said this with surface *all*; the phone kits predate that answer exactly as the web one did. Named here because that entry read as a web note and was nearly followed as one.

**Two pieces of the row vocabulary were built and three were not.** The kits draw a group, a row, a toggle, a danger tone and a radio choice group. Only the group and the row have a caller: every page that would use the others is out of scope, and building them anyway is a speculative abstraction. They arrive with the page that needs them.

**The shapes differ per client on purpose.** The phones draw fill-backed cards with inset dividers, which is what a phone list looks like; web draws open blocks with a section label and no container, which is what `WSettings.jsx` draws and what the rest of that shell looks like. Forcing one onto the other would have been a divergence from the kit dressed as consistency.

**Two things the kits are simply wrong about, and are not built.** "Conversations kept" is retired: the 27 August decision retired the retention clock and the 5 September pass removed it from `readme.md`'s Settings list. **The row on that page which is *not* retired is also not built**, and that is worth being explicit about, because retiring a page silently took it with it: the same 27 August entry says "Delete all conversations is unaffected and should stay". It needs an endpoint, a confirmation model and a home now the page around it is gone, so it belongs with account deletion. And the Privacy page's three toggles are refused rather than deferred: none has anywhere to be stored, and a switch is a stronger claim than a sentence because it implies somebody could have set it the other way.

**A bug this found, in the design system's favour.** "A new account opens in light regardless of the device setting", 25 August, surface all. Web's appearance shipped on 5 September resolving an unset preference to `system`, so a new account on a dark laptop opened dark. Offering `system` as a choice and defaulting to it are different things. Both clients default to light now.

**Design system impact:** three things. `WSettings.jsx` gains a sign out on its index. The kits' `SettingsDetail` account page loses Phone, Password and Plan, and the identity subtitle loses "· free plan". And the phones' Appearance page becomes a segmented control. The seven undrawn pages need no change: they are right, they are just ahead of the product. Text size is offered on web only, and the reason is in the code rather than the design: mobile type is 73 numeric `fontSize:` literals with no size variables in the generated stylesheet, so a size choice there is a generator change, not a screen.

### 2026-09-05 · A row offers one way out, not two
**Surface:** all
**Raised by:** the product owner, asking why a row needs both archive and delete.

**Is:** every row carries edit and exactly one way out. Your own content offers **Delete**; content somebody else wrote, in a shared thread, offers **Archive**. An archived row offers **Put back**, whoever is looking. Never two of the three at once.

**This reverses the row-actions rule from earlier the same day**, which said edit and archive sit on the row for any member and delete is the author's alone. That was three controls, and on a solo thread, where every row is yours, two of them answered the same question: archive and delete both mean *get this off my list*, and only one of them is honest about what it does afterwards.

**The rule is still the permission split, drawn more tightly.** Archive exists because OFF-3 says you may not destroy what another person wrote, and a shared thread still has to be tidyable by the people in it. So archive is not a gentler delete, it is **what you get instead of delete**, and drawing it beside delete made it look like a preference rather than a consequence of whose row it is.

**What is given up, named rather than discovered.** There is no longer a non-destructive way out for your own content: a stale link of yours is kept or deleted, with the eight second Undo as the only way back. The tick is not a substitute, because it only exists in the To do widget and a note cannot be ticked. Raised before the change and accepted.

**The phones need no separate answer.** `SwipeRow` stays delete-only and already refuses to park open on a row this account may not delete, so a non-owned row reaches Archive through the long press and never opens onto a control the server would refuse. The sheet follows the same one-way-out rule.

**Design system impact:** `readme.md`'s row-actions bullet is now wrong and should read: a row carries edit and one way out, delete for the author, archive for everybody else, put back for anything archived. The `RowActionSheet` contract is unaffected, it already says to omit what this account may not do. No kit draws a shared thread yet, so nothing to redraw until one does.

### 2026-09-05 · The design queue, applied
**Surface:** all
**Raised by:** the code, applying `handoff/APPLY-2026-09-05.md`.

Eleven instructions, nine of them with a surface to land on. What follows is what the codebase did and where it did something else.

**The two reversals both went in as written.** Widgets filter on all three clients, `All` first then each tag value in the thread's dimension, and the group heading and the bare "Everything else" heading are gone. The two preference glyphs are named rows saying what they are and what they are set to, with a Settings Appearance page beside them on `SegmentedControl`. Theme gained a third value, `system`, which is what an unset preference already did without a name for it.

**`filtersFor`, `matching` and `splitDone` are in `@offload/widgets`, not in each client.** Three clients deriving the same filter from the same tags is how two of them end up disagreeing about what `city:alfama` means, which is why `parseTag` is already there.

**Four divergences, each with a reason.**

- **The memory editor is a sheet on the phones, not an expanding row.** `MemoryRow` says the row grows to hold its own editor, which is right on web and is what web does. A phone has a third of the width and a keyboard that takes the bottom half of the screen, so a row opening halfway down a scrolling list opens underneath it. This is the repo's oldest lesson about the platform and no kit can show it.
- **`Chip`'s new `disabled` is not used for the at-cap Add.** The contract's own note says to say why in copy nearby rather than leave a dead pill, and with rows the sentence says it and names what to do about it.
- **The Settings Appearance page uses `SegmentedControl`, not `WSettings.jsx`'s `SPick`.** The kit's Appearance page is a radio list and predates this answer, which names the component. The same entry lists this page among the kit screens still to be drawn, so the contract led.
- **A pane head More menu is web only.** The phones have no pane head; the equivalent, a row's own actions, is `RowActionSheet`, which is now the governed component rather than a screen's invention.

**Two things were carried by the prompt rather than by a screen.** "One thread, one mention" is the model's sentence, so `plan_v2.md` now says to name a thread only when the dump went to more than one: the pills under the reply are built from what was actually filed and are the whole answer to "where". And the phones' partial-turn copy had drifted from the readme's and from web's, "Saved what landed. The rest didn't come through." against "offload did not finish that one."; there is one voice, so both now read the readme's.

**Two instructions have no surface yet and nothing was invented for them.** The share sheet's copy and the Leave/Delete wording both wait on sharing and leaving being built, which the handoff says. **Instruction 9, the row that says "filing", also has nowhere to land**: nothing in either client draws a row before its thread is known. There is no optimistic row and no pending list, so the word would have to be attached to a surface that does not exist. It is the one answer in this pass that is waiting on code rather than on design.

**Two gaps found while applying it, both in the system rather than in the code.**

- **There is no `--border-danger`.** The system has `--border-accent` and `--border-attention` and no clay counterpart, so the failed turn's clay border reads `--text-danger`, which is the one alias that is clay. A border alias would be the honest token.
- **`tokens/atmosphere.css` is not in the download and has to be kept from the repository.** It is the marketing site's, which has a different designer, and it is a real generator input: the fourteen `--wash-*` and `--prism-*` variables the landing page and the gate paint with come from it. A sync that replaces the folder wholesale removes them and nothing raises, because a stylesheet missing fourteen variables is still a valid stylesheet.

**A comment in `typography.css` broke the token generator, which is worth writing down.** The file explains that its large block is "scoped without `:root` on purpose, since the generator reads every `:root` block as the light theme". The scope regex found that `:root` inside the prose, ran its selector group through the rest of the comment to the next brace, and read the large sizes in as the base ones. Every size token shipped 15% bigger on every platform and nothing raised. The generator strips comments before parsing now, emits `[data-type="large"]` as its own scope, and throws if base and large ever come out equal.

**Design system impact:** three things for the next sync. `--border-danger` as an alias beside `--border-accent` and `--border-attention`. `atmosphere.css` either carried in the download or explicitly recorded as the marketing site's, so neither side deletes it by accident. And the kit screens this pass named as still to be drawn are now built in code, so the sync has something to read: the thread page's archive row and More menu on web and both phones, the widget filter row on all three, the memory rows, the nav foot, and the Settings Appearance page.

### 2026-09-05 · Sync: the design system catches up on eleven days of code
**Surface:** all
**Raised by:** the design system, reading this log after the first real commit.

The repository went from empty to 797 files and this log came back with eight entries carrying a
**Design system impact**. What follows is what the design system changed in response. Code led on
every one of them.

**`Chip` gains `disabled`.** Asked for twice, on 2026-09-04 and again on 2026-09-05, and
correctly not done in the app: the adherence rule is generated here, so a prop added on the client
would have failed the gate for every other client. `--state-disabled-surface` with `--state-disabled-text`, no
opacity fade, which is the treatment `readme.md` already specified. Not interactive while
disabled, so it takes no hover, no press and no 44px hit area.

**The retired `variant="soft"` is gone from the component, not just from the kits.** Five chip
rows in `WMemories`, `WMisc`, `MemoriesScreen` and `M3MemoriesScreen` still passed it. The
prop was never in the contract and the soft tints were retired for reading too close to paper at
chip size, so the branch is removed from `Chip.jsx` as well. A kit cannot pass it again.

**The change mark is in `readme.md`, beside the two accents.** A moss background settling to
transparent over 1400ms, on anything that arrived while somebody was looking at the screen. It is
the first pattern in this system that is a moment rather than a state, which is why it sits with
the accents rather than in the motion rules. Reduced motion drops it to nothing, per the standing
rule that a shortened animation is still an animation.

**`SwipeRow` is delete-only and now says so.** The glyph and the clay ground are inside the
component with only the label exposed, so a swipe labelled Archive would have shown a trash can.
Stated in the contract and in the readme rather than generalised, because generalising it is a
design job and the phones did not need it.

**The type scale is a token now.** `[data-type="large"]` overrides the eight size tokens with
whole-pixel values at 1.15, and `--type-scale` is there for a one-off literal that has to move
with them. Deliberately not `calc()` on the base sizes: the token generator resolves values for
clients that cannot follow a `var()`, and React Native cannot parse a calc. Deliberately not
scoped `:root[data-type="large"]` either, since the generator reads every `:root` block as the
light theme and would have taken the large sizes as the base.

**Breakpoints exist.** `--breakpoint-lg` is 1180, the value the web shell already uses, with sm,
md and xl around it.

**The retention line in `readme.md` was still wrong.** It quoted the 60-day conversation clock
that 2026-08-27 retired. Removed.

**A React Native icon contract is owed and not yet written.** `Icon` masks an SVG with
`currentColor` and takes a URL `basePath`, neither of which exists on React Native, so `Glyph`
is the right name and the right call. Noted in the readme so no client invents a second one, but
the contract itself is a design job for the next pass, not a rename.

**Design system impact:** done, except the drawing. What is still owed is new surface rather than
correction, and it is listed in `handoff/README.md` under Design queue: the memories section on
three clients, the open state of a memory chip, the archived toggle, the long-press action sheet,
the completed-task row, conditional row tools, the composer's failed and partial states, the reply
that links to threads, the pane head's tools, the theme switch and type-size control, and the
filter-versus-group question from 007. None of those can be answered by an edit to a token file.

---

## 2026-09-01

### 2026-09-01 · Radius ladder ends at xl, no 2xl
**Surface:** web
**Was:** `WFirstRunGate.jsx` used `var(--radius-2xl)` on the gate card, a token the set never defined.
**Is:** `var(--radius-xl)` (28px). The ladder stays xs 6, sm 10, md 14, lg 20, xl 28, pill 999.
**Why:** One accidental use in one file, not a missing step in the scale. A 440px modal card sits at the top of the existing ladder; adding a sixth step for a single surface would invite drift.
**Design system impact:** Done. Kit corrected, tokens unchanged. Code should use `--radius-xl` as the largest rectangular radius.

---

## 2026-08-27

### 2026-08-27 · Nothing a person puts in is deleted on a clock
**Surface:** all
**Was:** "offload only keeps conversations from the past 60 days", stated in `readme.md` and drawn
in Settings as a Keep conversations for page with a Conversations kept row, options including
Forever, and a Delete all conversations action.
**Is:** things, media, conversations and memories are kept until the person deletes them. There is
no purge clock on anything they put in. Retention now applies only to data that exists for us
rather than for them: analytics events, application logs, traces and LLM metadata, all minimised
on a short clock and none of it visible in the product.
**Why:** deleting someone's photos on a timer is not privacy, it is losing their things. The
product's promise is that offload is the one place you put things and they are still there, and
the kits already rely on that, showing a wedding thread from last year holding 44 things "mostly
photos and the seating plan" and a finished trip whose blurb says everything is still here if you
want the addresses again. A 60-day clock would empty both. Minimising our own operational data
achieves the privacy intent without costing anyone their stuff.
**One thing this fixes rather than breaks:** the kits draw a memory with the things it came from.
Because raw content no longer ages out, that provenance stays true forever, instead of degrading
into a memory that cannot say where it came from.
**Design system impact:** the Keep conversations for settings page and the Conversations kept row
become vestigial unless they are re-drawn as a Forever-only statement or removed. The retention
sentence in `readme.md` under Content fundamentals is now wrong. Delete all conversations is
unaffected and should stay, since manual deletion is still real, immediate and cascading. Not yet
done, and the copy is design's call.

---

## 2026-08-26

### 2026-08-26 · Thread screens renamed from space
**Surface:** iOS, Android
**Was:** `SpaceScreen.jsx`, `SpacesScreen.jsx`, `M3SpaceScreen.jsx`, `M3SpacesScreen.jsx`, exporting `SpaceScreen` and `SpacesScreen`.
**Is:** `ThreadScreen.jsx`, `ThreadsScreen.jsx`, `M3ThreadScreen.jsx`, `M3ThreadsScreen.jsx`, exporting `ThreadScreen` and `ThreadsScreen`.
**Why:** Catching the filenames up with the vocabulary decision of 25 August.
**Design system impact:** Done. The prototype fixture still uses `D.spaces`, a `space` prop and the `"spaces"` tab key, left alone because all three kits share that one file. The real data model should say thread from the first commit.

### 2026-08-26 · Two stale four-second undo references corrected
**Surface:** iOS, web
**Was:** `ui_kits/mobile_app/README.md` and a comment in `ui_kits/web_app/WApp.jsx` both said four seconds.
**Is:** Eight, matching the decision of 25 August.
**Design system impact:** Done. Docs only, no behaviour changed.

---

## Closed before handoff

These were settled in the design system between 11 and 26 August 2026, before any code
existed. They are recorded here as the starting state, not as decisions the codebase made.
Full reasoning for each is in `readme.md`.

### 2026-08-25 · A collection is a thread
**Surface:** all
**Is:** thread for the container, thing for one item inside it. The second tab is My threads, glyph `lasso`.
**Why:** Chosen over loop, stack, bundle, pile and case. It was already the word the kits used in code and data.
**Design system impact:** Done in copy. Not done in filenames, see the drift note in CONTRIBUTING.

### 2026-08-25 · Contrast floors raised
**Surface:** all
**Was:** `--text-tertiary` #9E9E9E at 2.55:1, `--border-strong` #DEDEDE at 1.28:1.
**Is:** `--text-tertiary` #6E6E6E light and #959595 dark, 4.5:1 or better everywhere. `--border-strong` #8C8C8C light and #777777 dark, 3:1 everywhere.
**Why:** Tertiary carries metadata, counts, timestamps and captions, so it failed on real copy. Border-strong is the only thing that says a field or checkbox is there.
**Design system impact:** `tokens/colors.css`. Secondary and tertiary are now closer than they were, so separate the two ranks by size and weight, not colour alone.

### 2026-08-25 · Reduced motion is a cut, not a shortening
**Surface:** all
**Is:** `prefers-reduced-motion: reduce` removes movement entirely. No pane slide, no iOS push, no shared axis, no drawn tick, no toast rise, no hover transition. The new state is simply there.
**Why:** A shortened animation is still an animation.
**Design system impact:** `tokens/motion.css`, inherited by every kit and card.

### 2026-08-25 · Undo lasts eight seconds
**Surface:** all
**Was:** Four seconds.
**Is:** Eight, and nothing is destroyed while the toast is up.
**Why:** Four is not enough time to read a toast, reach for a pointer, or hear a screen reader announce it.
**Design system impact:** Toast spec.

### 2026-08-25 · Light is the default theme
**Surface:** all
**Is:** A new account opens in light regardless of the device setting. Dark is a choice in Settings.
**Design system impact:** All three kits default to light.

### 2026-08-25 · Sharing is connections only
**Surface:** all
**Is:** No public links. The share sheet's last row makes a new connection, matched against accounts that exist. One permission, stated identically everywhere: they can add to it, they can never delete what is yours.
**Why:** Sharing never lets anyone new into offload. Someone without an account comes through the waitlist.
**Design system impact:** Share sheet in all three kits.

**Amended 2026-09-05:** the permission is unchanged and still the only one, but it is no longer stated in the share sheet. That sentence was the whole of what a person read before sharing, and it said nothing about what happens to a shared thread when somebody leaves, which is the consequence they cannot undo. The sheet now carries co-ownership instead, and the permission lives in the product's behaviour and on the Ending things settings page. *Amended rather than rewritten: "stated identically everywhere" was the decision, and it no longer holds.*

### 2026-08-25 · Two accents, no third
**Surface:** all
**Is:** moss #3F6B4F for "offload did this", ink blue #3355D6 for "this needs you". They never appear on the same row. If something was sorted and is waiting, waiting wins.
**Design system impact:** `tokens/colors.css`, semantic aliases only.

### 2026-08-25 · Instrument Sans and Literata are the real faces
**Surface:** all
**Is:** Not placeholders. Served from the Google CDN for now.
**Design system impact:** `tokens/fonts.css` becomes self-hosted `@font-face` whenever hosting matters. No licence chase pending.

### 2026-08 · Two roles in the admin panel
**Surface:** admin
**Is:** Support gets waitlist and people. Owner also gets costs, limits and staff. Support does not see those pages at all rather than seeing them refused. Always at least one owner, and nobody can edit themselves out of the panel.
**Design system impact:** `ui_kits/admin_web/`.

### 2026-09-01 · Two gaps the token scale has, found by building the phones
**Surface:** mobile, web
**Is:** The mobile screens are built entirely from `packages/tokens`, and two values in the kits have no token behind them.

1. **Control height.** The gate's buttons, the primary button and the composer are all 52px. There is a `--composer-height` and an `--appbar-height` at that value, but no `--control-height`, so a button either borrows a token that means something else or hard-codes the number. The mobile app currently uses `min-h-composer-height` on buttons, which is honest about where the value came from and wrong about what it means.
2. **The first-run dot is 7px.** The spacing scale steps 6, 8; there is no 7. The dots use `space-3` at 6px.

**Why it matters here:** the design-adherence lint rejects a raw px in application code, which is the rule working. Both of these reached the point of being written as literals before being caught, which is the signal that the scale is missing a step rather than that the screen is wrong.

**Design system impact:** `tokens/space.css` or equivalent gains a `--control-height`, and either the dot becomes 6px in the kits or the scale gains a 7px step. Until then both deviations are commented at their use site.

### 2026-09-01 · The web gate was built without reading its kit
**Surface:** web
**Is:** The sign-in, no-invite and first-run screens were implemented from `readme.md` and the feature spec's acceptance criteria, and `ui_kits/web_app/WFirstRunGate.jsx` was never opened. They have been rebuilt against it. What differed:

- The card. The kit is a 440px raised card with a sheet shadow on a sunken page, wordmark top left, `Terms · Privacy` bottom left. The build had a bare centred column on the page background.
- The title. The kit says "Sign in to offload". The build had reused the marketing headline, "Offload what you would otherwise forget.", which is the site's argument and not a gate's instruction.
- The provider buttons. The kit fills Apple and outlines Google, both with their glyphs, at 48px. The build had two identical outlined buttons with no icons at 52px, which makes the pair read as an arbitrary choice.
- The refusal. The kit is a soft attention block above the buttons. The build had a line of danger-red text, which says the person made a mistake.
- The no-invite screen. The kit names the address inside the sentence, offers two full-width buttons, and closes with "Invited on another address? Sign in with that one instead.". The build had the address on its own line, a quiet text link for the secondary, and no footer.
- First run. The kit carries an illustration per screen, a 34px title, a 240px button, and progress dots below it whose active step is an 18px pill. The build had no art, a 26px title, a full-width button, and three equal dots at the top.

**Why it matters:** every one of these was individually defensible and collectively a different product. The rule that would have caught it is "read the kit for the screen you are building", not "read the design system".

**Two gaps found in the system while doing it:**
1. The kit used `--radius-2xl`, which does not exist. **Answered by design: `--radius-xl` (28px) is the largest rectangular radius, there is no 2xl and there will not be. The ladder is xs 6, sm 10, md 14, lg 20, xl 28, pill 999, plus the semantic aliases `--radius-card`, `--radius-sheet`, `--radius-field`.** The kit's `WGateCard` has been corrected to `--radius-xl`, which is also what the rebuild uses. It was not a gap in the tokens: the reference resolved to nothing, so the kit's own card was rendering square.
2. Google's four brand hexes cannot be tokens, because Google's branding requirements mandate them for the sign-in button. They are the one lint exception in the web app, scoped to that component with the reason at the use site.

**Design system impact:** `ui_kits/web_app/WFirstRunGate.jsx` corrected. **`_ds_bundle.js` still carries the old value at `WGateCard` and is generated, so it needs regenerating rather than hand-editing.** The mobile and Android gates have the same divergence from their kits and are not yet rebuilt.

### 2026-09-01 · Android is a real fork, and its palette is generated
**Surface:** android, ios
**Is:** The phones' gate, no-invite, first run and day-one Today are rebuilt from their kits. Android is a genuine fork rather than a skin, using Expo Router's platform route files (`sign-in.android.tsx` beside `sign-in.ios.tsx`), because the two kits differ in more than colour: Google leads on Android, the primary is a filled Material button at 56 rather than 52, the shape scale is Material's rather than offload's, the bar is `row-height-lg` rather than `tabbar-height`, and the type sits on Material's tracking.

**The palette is generated, not retyped.** `[data-platform="android"]` in the Android kit's `index.html` defines the Material surface roles, the replaced radii and the taller bars. The token generator now reads that scope and emits them as `a-*` colours, `a-*` radii and `a-*` heights, so the fork consumes tokens like everything else. A hex typed into the app is what OFF-7 exists to prevent, and "it was only for Android" is how that starts.

**Copy does not fork.** Both platforms read `lib/gate.ts`, so a copy change that reaches one and not the other is impossible by construction rather than by discipline.

**What the adherence lint caught during this, both correctly:** a `markOnly` prop invented for `Logo`, which declares `variant` and a `tone` of `ink` or `inverse`; and hard-coded hexes in SVG props, where NativeWind cannot reach and a literal is tempting. Those colours now come from the generated tokens through `lib/colors.ts`.

**Design system impact:** none. The Android platform scope stays where it is and is now consumed rather than copied.

### 2026-09-01 · Android's primary button wears the attention accent, unresolved
**Surface:** android
**Is:** Every primary action on Android is `--blue-600`: the filled Google button, Join the waitlist, Get started, and Skip's label at `--blue-700`.

**The problem is that the design system says two things.** `ui_kits/android_app/README.md` specifies "first-run buttons: ink primary on iOS, filled blue primary on Android", and `M3FirstRun.jsx` uses `var(--blue-600)` directly. `readme.md` says of the two accents that "neither accent fills a primary button (that is always ink)", and that ink blue means *this needs you*.

Both cannot hold. Following the Android kit, as the fork does, spends the "something is waiting for you" colour on every ordinary button on that platform, which is the signal Tonight and overdue things will need later.

**Parked, following the kits.** The brand owner's call, 1 September: ship what the kits say for now and revisit after testing it on a device. So Android keeps its blue primaries and no code changes. The fix stays one token either way whenever that revisit happens.

**Design system impact:** either `readme.md`'s rule gains an explicit Android exception, or the Android kit gains a semantic `--a-primary` that is not the attention accent and `M3FirstRun.jsx` stops reaching for `--blue-600` directly. Until then this is a divergence with a log entry rather than a silent one.

### 2026-09-01 · The admin waitlist notes describe this product, not the kit's
**Surface:** admin
**Is:** The "what an invite does" notes under the waitlist table are rewritten from `ui_kits/admin_web/AdminApp.jsx`. The kit says an invite "creates nothing: the account exists when they sign in", and that it is "single use, expires in 14 days, and resend voids the old link". Neither is true here: promotion creates the account, its keys, its Miscellaneous thread and its membership in one transaction (AC-2), and there is no link at all, because sign-in is by provider on the invited address. Resend re-sends the email.

**Why the code wins:** the spec, not the mock, defines what promotion does, and copy that describes a mechanism the product does not have is worse than no copy. Support reads this panel.

**Design system impact:** `ui_kits/admin_web/AdminApp.jsx`'s `NOTES` array should be corrected to match, and the "single use, expires in 14 days" line dropped until such a mechanism exists.

### 2026-09-01 · Removing a waitlist address, which the kit leaves out
**Surface:** admin
**Is:** The waitlist table has a Remove action beside Invite, for rows still waiting only. It confirms first and names the address.

**The kit says not to have it.** `AdminApp.jsx`'s notes read "Removing an address from the waitlist is not here on purpose. Support does it from People once the account exists." Two things make that unworkable today: People does not exist, and an address that arrived by typo or by bot has no account to remove it from, because until an invite goes out there is nothing but a row.

**Kept narrow so the kit's reasoning still holds where it applies.** The route refuses anything past `waitlist`, so an invited or active account can never be removed this way; that account has keys, a thread and a membership, and removing it here would orphan all three. It is also a soft delete, because the unique index on the address only covers rows where `deleted_at` is null: a hard delete would let the same address rejoin and be counted as new, and the rate limiter would lose sight of it.

**Design system impact:** the kit's notes array should describe Remove and keep the "belongs on People" rule for accounts that exist, rather than forbidding removal outright.

### 2026-09-01 · The admin nav, and a link back the other way
**Surface:** admin, web
**Is:** The nav was rebuilt against `A.jsx`'s `ASideNav`, which it had only partly followed: the wordmark beside the mark, a count on Waitlist, the signed-in address rather than the role, and "Back to the app" were all specified and all missing.

**One addition the kit does not have:** a moss `admin` link in the web app, top right, rendered only for staff. The kit gives the panel a way back to the app and the app no way in, which leaves typing a URL as the only route. It reuses the nav's own moss so the destination is legible before the click, and it is the only moss chrome in the app. The staff check is the same request the panel makes, which 404s for everyone else, so a non-staff account cannot learn the panel exists from it.

**Design system impact:** `ui_kits/web_app/` gains the staff link on the app side; `A.jsx` is already correct and was simply not followed.

### 2026-09-01 · Clay at rest on Remove, and a selection bar that floats
**Surface:** admin
**Is:** Two changes to the waitlist table the kit does not describe, both from watching it used.

**The selection bar floats instead of sitting above the table.** `AdminApp.jsx` puts it in the flow, which pushes the whole table down the moment a row is ticked, moving every other row out from under the pointer that just ticked one. Selecting a second row means finding it again. It is now a fixed pill at the bottom of the pane, so the table never moves.

**Remove is clay at rest, not on hover.** `ADanger` in `A.jsx` keeps a destructive row action grey until the pointer is on it: "clay is only ever on a destructive control, and it only turns red once the pointer is on it." The product owner asked for it to read as destructive before you touch it, which is the trade this makes: a clay outline and clay text at rest, filling to `--clay-100` on hover. The solid confirmation stays exactly as `ADanger` specifies, and clay still appears nowhere that is not destructive.

**Design system impact:** `A.jsx`'s `ADanger` gains a resting variant, or the rule in its comment gains an exception for a row action that sits beside a non-destructive one, where grey-until-hover makes the two look alike. The bulk bar's position should change in `AdminApp.jsx` regardless of the clay question.

### 2026-09-01 · The pre-account screens get a moving background, and the gate joins the landing page
**Surface:** web

**Is:** The landing page is rebuilt from a new design by the brand owner, and the gate is moved onto the same frame. Behind both there is now a drifting watercolour field: four blurred colour clouds across the page, a halo, and the mark filled with six masked layers, five gradient washes and a WebGL thin-film prism, each pushed through its own SVG turbulence displacement and each lagging the pointer at a different depth. The headline is `offload <verb> for you`, the verb cycling every five seconds through remembers, organizes, sorts, files, keeps, tracks, dissolving out through a turbulence bleed with three coloured ghosts spreading behind it.

**This contradicts `readme.md`, knowingly.** "Backgrounds. Flat, never imagery. No photography, no illustration, no pattern, no texture, no full-bleed imagery, no gradient fields." That rule is right and stays right for the product: it exists so a screen full of someone's dumped things is never competing with its own wallpaper. It has nothing to say about the two screens where there is nothing of theirs on the page yet and the job is to make a claim, which is what the landing page and the gate are. The rule now has a boundary, and the boundary is the account.

**The gate moved rather than the landing page compromising.** `WFirstRunGate.jsx` puts the card on `--surface-sunken` with the wordmark at a 44px gutter and `Terms · Privacy` bottom left. The landing page sits on `--surface-page` at a 64px gutter with `Privacy` bottom right. Two screens one click apart cannot each be right, and the whole point of the new landing page is that the background is continuous, so the gate takes the landing page's frame: same mark position, same header row height, same Privacy line, same drifting page. Clicking `Sign in` now moves a card in over a background that does not change. `components/Screen.tsx` renders that frame for both, so they cannot drift apart again.

**Three smaller divergences it drags in.** The header row is pinned to 40px, the height of the design system's `Button` at `md`, whether or not the screen has a button in it, so the mark does not sit 9px higher on the gate. `Terms` is dropped from the footer, which cost nothing: it was static text with no route behind it. And the hero type is outside the ramp, a viewport-driven `clamp(38px, min(7.2vw, 11.5vh), 104px)` at `-0.042em`, because the landing page is one screen sized to the window rather than a document.

**New tokens:** `tokens/atmosphere.css`. Two steps per hue for the washes, `--wash-{blue,violet,sand,moss}-{100,200}` plus `--wash-straw-200` and `--wash-glow`, and `--prism-{violet,amber,blue}` for the ghosts. Light only. The atmosphere has never been drawn on a dark page and inventing five values for one here would put a design decision in a token file instead of in a review; the pre-account screens are forced light until it is made.

**Design system impact:** `readme.md`'s Backgrounds paragraph needs the boundary written into it: flat is the rule behind the account, and the landing page and gate are the exception. `ui_kits/web_app/WFirstRunGate.jsx` should be reframed onto the landing page's chrome, gutter, header row and footer, or its own comment should say it describes first run only. `ui_kits/marketing_site/index.html` is superseded by this page entirely. And the type scale should say in one line that the marketing headline is deliberately not on it.

### 2026-09-01 · The privacy policy, a screen with no kit, and the gate's legal line
**Surface:** web, iOS, Android

**Is:** `/privacy` exists, a first draft written from `docs/constitution/principles.md` and `docs/tech/stack.md` rather than from a template, so every claim on it is one the code supports. It opens with a summary in eight bullets, boxed and explicitly labelled as not the legal document, and the sixteen sections under it are the policy. Legal review is still to come and every undecided value is drawn in amber so it cannot be published by accident.

**No kit, so it was built from the ramp.** `find-kit.sh privacy` returns the mobile and web *settings* pages and nothing else: there is no mock of a long-form document anywhere in the system, and this is the first one. It takes the landing page's frame with the atmosphere switched off, because the effect is centred on the mark and drifts, and a page of running text over it is neither readable nor worth the frames. Everything else is the type ramp, `--surface-raised` for the summary card, `--surface-attention-soft` for the disclaimer and `--surface-accent-soft` for the two dated asides.

**The gate's legal line is now one word and a link.** Both phone kits draw `Terms · Privacy` under the provider buttons, `FirstRun.jsx` and `M3FirstRun.jsx`, and the web gate drew the same bottom left. In all three it was static text pointing at nothing, and there is no terms page. It is `Privacy` alone until there is a second document to name, and it opens the policy. On the phones it gains a 44px touch box around the 12.5px line the kits draw, since the drawn size is right and the hit area was missing.

**One thing the policy claims that the product does not have yet.** Section 11 describes the privacy switches from `SettingsDetail.jsx` and `WSettings.jsx`, including "Improve offload with my data", off by default. Settings is not built. Rather than describe a control that does not exist, the section carries a dated note saying so and offering to do any of it by hand, which is true and stops being needed the day the screen ships.

**Design system impact:** the kits need a long-form document page, since this is the first of at least two and terms will want the same one. `FirstRun.jsx`, `M3FirstRun.jsx` and `WFirstRunGate.jsx` should drop `Terms` from the legal line until a terms page exists, and should draw it as a link with a real hit area rather than as a caption. The settings kits are already right and the code is what has to catch up to them.

### 2026-09-01 · First run gains a fourth screen, and it asks for something
**Surface:** web, iOS, Android

**Is:** First run ends on a consent screen. Two ticks, "I have read the privacy policy" with the policy linked, and a specific one naming what offload will hold. Under them, one line of advice: never dump a password, a card number or a government id, into offload or into any other AI tool. Get started is inert until both are ticked, and the server refuses `POST /api/onboarding/complete` without both, so the button being disabled is a courtesy rather than the control.

**Why the kits say not to.** `FirstRun.jsx`, `M3FirstRun.jsx` and `WFirstRunGate.jsx` all build first run as three screens with nothing to fill in, and the reasoning in the code was ours: "asking a new person to configure the filing would contradict the product on its first screen." That reasoning is still right and this does not break it. Writing the privacy policy turned up something else: the product is designed to receive whatever a person has on their mind, which means health, money, beliefs and relationships, and holding those lawfully in Europe needs consent that is explicit and specific. There was none, anywhere.

**So the tutorial is untouched and the consent is a fourth screen.** Three screens, still nothing to fill in, still carrying the three dots. The consent has no dot, because it is not one of the three, and it has no illustration, because a consent that has to be specific cannot sit under a picture about notifications where it reads as small print on something else. **Skip now lands on it rather than completing first run**, which is the one behaviour that changes: nobody has to read the tutorial and everybody has to answer this.

**One deliberate divergence from `Checkbox`.** The component greys and strikes through a ticked label, which is right for a task being crossed off and wrong here: a struck-through consent line reads as one that has been withdrawn. The box, the 6px radius, the ink fill and the tick drawing itself along its length are all as specified; only the label treatment is dropped. React Native has no checkbox primitive, so the phones draw the same box by hand in `components/ConsentTicks.tsx`, forked only on colour: ink on iOS, Material's primary on Android, which is the pair their gates already use.

**Design system impact:** all three first-run kits need the fourth screen, and their "nothing to fill in" comments need the sentence that says the tutorial is what has nothing to fill in. `Checkbox` should say that the strike-through is for task ticks and name the exception, or gain a variant without it. `WSettings.jsx` and `SettingsDetail.jsx` already draw "Improve offload with my data", off by default, and are already right; what they still lack is anywhere to see or withdraw the consent given here, which the Privacy settings page should show.

### 2026-09-02 · The phones were never wearing the design system
**Surface:** iOS, Android

**Is:** They are now. Nothing about the screens changed; what changed is that the tokens and the faces they name actually reach the device.

**Two faults in `packages/tokens`, both silent by construction.** The generator filtered colours from the raw light scope, and its hex-to-channels helper returns null for anything holding a `var()`. Semantic tokens are almost all aliases, so 27 of 81 colours were dropped and 24 of them were semantic: `text-primary`, `text-inverse`, `text-accent`, `text-link`, `surface-raised`, `border-hairline` and their neighbours. Separately the Android platform scope was inserted into the stylesheet by a pattern that hard-coded two spaces of indentation, correct while those variables sat inside `@layer base` and matching nothing once that wrapper came off, so every `a-` class was dead too. Neither failure raised: Tailwind emitted `rgb(var(--c-text-inverse) / 1)`, the variable did not exist, and the platform substituted its own default. The gate rendered in system greys with a black label on the black Apple button and every file involved read correctly.

**And no font was ever loaded.** `--font-core` names Instrument Sans, no such family exists on either OS, and both quietly substituted Roboto or SF. Every screen built so far has been rendered in the wrong typeface. The faces are registered natively now, all three weights under one family name, because that is what makes a weight class resolve to the cut it names rather than to nothing.

**Design system impact:** none to the tokens or the kits, which were right throughout. The generator now asserts instead of failing quietly, and `.claude/scripts/dead-classes.mjs` checks every class in the app against the generated theme, which is the check that would have caught this on the day. Worth knowing when reading any screenshot of the phones taken before this date: it is not showing this design system.

### 2026-09-02 · The gate lockup is 40% larger than the kits draw
**Surface:** iOS, Android

**Is:** The mark is 129 and the wordmark 42, against the 92 and 30 that `FirstRun.jsx` and `M3FirstRun.jsx` both draw. Tracking is computed from the size rather than frozen at the `-0.9` that was only `-0.03em` at 30px.

**Why:** it read as too small on a real device. The kits are drawn in a 390-wide frame in a browser and the lockup is the first thing anyone sees, so this is exactly the kind of judgement that only survives contact with a phone in a hand. Deliberate, at the user's request, and it is the current answer rather than a settled one.

**It also stopped moving between screens.** The lockup sat in a `flex-1` container, taking whatever the content below did not want, so it hung lower on the waitlist than on sign in purely because the waitlist has a field: moving between them, the mark visibly dropped. It is a share of the screen height now, and it lands at the same y on every gate screen. Two limits keep that honest on a small screen or under a keyboard: it shrinks before the copy does, since the lockup is decoration and the words are not, and it stops shrinking at the height of its own contents, because `justify-center` on a box smaller than what it holds overflows in both directions and put the wordmark on top of the waitlist's title.

**Design system impact:** if this size is kept, `FirstRun.jsx` and `M3FirstRun.jsx` want 129 and 42 and the web gate should be looked at beside them, since a lockup that differs by 40% across surfaces is worse than either size. The kits should also say that the lockup's band is a share of the screen rather than the leftover space, because the drift they encode is invisible in a prototype where every screen is viewed alone.

### 2026-09-02 · A waitlist screen the kits do not draw
**Surface:** iOS, Android

**Is:** `Waitlist.{ios,android}.tsx`, reached by tapping "Join the waitlist" on the gate. It is the no-invite screen with a field added, built from the same primitives at the same measurements, and its copy follows the marketing page's form because that is the same waitlist.

**Why there is no kit for it.** Both phone kits draw "Join the waitlist" on the gate as a bold span with no click, and their no-invite screen is where joining happens. That works in the kits because the only way onto no-invite is a sign-in attempt that was refused, so the screen always knows the address. From the gate there is no address, and the line did nothing at all: tapping it was the bug that started this. The web gate points at the landing page's form, which the phones have no equivalent of.

**One thing a prototype cannot show.** The keyboard covered the whole form on the device, field and both buttons. The fix is `behavior="padding"` on both platforms, against the usual advice, because that advice assumes Android resizes the window and this app runs edge to edge, where Android ignores `adjustResize` outright.

**Design system impact:** the phone kits need this screen, or they need the gate's "Join the waitlist" to be honestly inert. They also have no text field on any pre-account screen, so there is no drawn answer for what one looks like on the gate's surface; this borrows the composer's pill and the gate's outline. More generally the kits have no way to show a keyboard, and every screen with a field will hit the same thing, so the first-run kits should carry a note about what is on screen when one is up.

### 2026-09-02 · "thing" is retired as the product's noun
**Surface:** web, iOS, Android, marketing

**Is:** offload no longer has a word for the unit a person dumps in. Counts stand on their own with no unit, so a thread card reads `Lisbon trip  4` rather than `Lisbon trip  4 things`, and everywhere else the sentence is rewritten to avoid needing the noun at all: "what you dumped in", "your content", "a dump", or nothing.

**Why, and why not a synonym.** The word was doing two jobs badly. As a count label it is vague in the one place a number needs to be exact, and in long-form prose, which is where it was noticed, "your things" repeated two dozen times on the privacy policy reads as evasive on a page whose whole job is to be precise. Bit, detail and piece were all on the table and all rejected for the same reason: naming the unit at all is the mistake. The product's premise is that nobody has to classify anything before putting it down, so the interface should not classify it on their behalf either. A number beside a thread is unambiguous in context and says less.

**Where it actually was.** Only two places in the shipped product: the second first-run tutorial screen, whose illustration drew "4 things" on three thread cards, on both phones and the web; and the web's meta description, which is what search results and link previews show. Everything else was the privacy policy. That is why this was cheap now and would not have been in a month.

**Two things went with it.** The consent line said "other private things" and now says "other private matters", on all three clients, because the copy is shared by construction and had to move together. And the landing page's "Dump things that clutter your mind and let us organize them for you" was fixed for a second fault at the same time: the voice rule says offload never says "we" or "us", and that line did.

**Design system impact:** the kits are now wrong on this and are the larger half of the work. `thing` appears across roughly fifteen kit files as the count noun, heaviest in `WApp.jsx`, `WSettings.jsx`, `FirstRun.jsx`, `SettingsDetail.jsx`, `M3SettingsDetail.jsx`, `M3FirstRun.jsx` and both `Sharing.jsx` files, and every one of those is a screen not yet built. They should drop the unit from counts and reword the prose. `readme.md`'s vocabulary section needs the word removed from the allowed list and named as retired, next to the existing bans, so the next screen does not reintroduce it.

### 2026-09-02 · The composer answers, and two states no kit draws
**Surface:** web

**Is:** the web composer takes a dump, marks it seen, shows a thinking state and grows into a conversation in place. The turns sit above the field inside the same box, so the field stays where it was and nothing moves under the cursor when an answer arrives, which is the kit's live state in `WComposer`.

**The seen marker did not exist on web.** 👀 is drawn only in `ui_kits/mobile_app/LiveConversation.jsx`'s `StatusChip`; `WTurns` in `WMisc.jsx` renders a chip for `done` and has no branch for `seen` at all. Ported across at the mobile treatment: the pill on `--paper` with a hairline border, sitting under the person's message. **Its text alternative is the readme's fuller string, "seen, not answered yet", not the kit's shorter "Seen"**, because the marker exists to say offload has it and has not answered, and "Seen" alone drops the half that matters.

**No kit anywhere draws a failed message**, and `001-data-model` has named `failed` as one of four message states since it was written. Invented here: an inline line under the person's message in `--text-on-attention` with a Try again control. **Persistent, and deliberately not a Toast.** A Toast clears itself after eight seconds, and the failure it would carry is the one case where the person is most likely to have looked away, since it only happens after offload has been thinking for a while. A dump that went unanswered has to still be saying so when they come back to the tab.

**The camera and microphone are not rendered**, though `WComposer` draws them unconditionally. Text only in this feature, and a control that does nothing is worse than one that is absent.

**Design system impact:** `WTurns` needs a `seen` branch, and the seen treatment should be lifted out of the mobile kit so one definition serves both. The failed state needs drawing properly in all three kits, since it is a real message state and every surface will hit it. `WComposer` should say that the camera and microphone are conditional on attachments existing, rather than drawing them as though they always work. And the readme's Toast guidance is worth a sentence on when not to use one: an eight second dismissal is wrong for anything the person may not be present for.

### 2026-09-03 · The privacy policy's voice, and "upload" on that page only
**Surface:** marketing

**Is:** the whole of `/privacy` rewritten for tone. Short, professional, direct. The short version at the top took the heaviest pass, because it was the most casual part of the page and the part most people will actually read, but every section below it was tightened in the same direction.

**What the voice was doing wrong.** The page was casual in a way that read as pally rather than plain, and it kept reaching for a line when a fact would do: "written to be read rather than to be airtight", "there is no advertising business here that would want us to", "we would rather you heard it here than found it later", "we would rather tell you exactly where that line is than say 'your data is encrypted' and be wrong about it". Each of those is defensible alone and together they are a voice that is performing its own honesty. The rule applied throughout: say the thing, then stop. We are not the reader's friend and we are not their solicitor.

**Nothing in the substance moved**, with one exception below. Every legal basis, every right, the CCPA statements, the 30 day window, the shared-thread reasoning in section 10 and the precision of section 12 are intact. Two existing faults were fixed on the way past: the consent paragraph in section 4 pointed at "that fourth row" and the row it describes is the fifth, so it now names the row instead of counting it, and a sentence in section 10 was garbled mid-clause ("the reason the next four what you added to that thread says what it says").

**The one substantive change: the page now says we plan to encrypt text as well.** At the product owner's instruction. It sits as a note under section 12's three consequences and as a clause in the summary bullet, and it is a forward-looking commitment on a claim surface, so it is logged in `docs/tech/decisions.md` too, against the deferred-hardening item that used to say the opposite.

**"upload" replaces "dump", on this page only, deliberately.** The product's word is still dump everywhere else: the apps, the landing page, `readme.md`'s vocabulary list and this file. The product owner's call was to change the privacy page now and leave the question of whether the word changes everywhere for later. So this page is knowingly out of step with the rest of the product, and a header comment in `page.tsx` says so, because the next person to read it will otherwise fix it back.

**Design system impact:** none to the tokens or the components. Two things for whoever holds the vocabulary. `readme.md`'s vocabulary section should note that `/privacy` says upload, so the divergence is recorded where the rule lives rather than only here. And if upload is ever adopted product-wide, the note in `page.tsx` and this entry both come out in the same change. Kits are unaffected; none of them draw this page.

### 2026-09-03 · The privacy page gets the atmosphere, and a wider measure
**Surface:** marketing

**Is:** `/privacy` now sits on the same background as the landing page and the gate, mark and prism and all, and its column is 88ch rather than 68ch.

**Why the atmosphere was off, and why that reasoning was wrong.** `Screen` has had an `atmosphere={false}` since it was written, with a comment saying that behind a page of running text the effect is unreadable and a rAF nobody is looking at. The first half is not true at these opacities: the washes are pale enough that body text over them reads as well as it does on paper, which the built page settles. The second half was true and is now the trade being made on purpose: the shader and the pointer loop run for as long as somebody has the page open. Requested by the product owner, who wanted the page to look like the rest of the site rather than like a separate document.

**Pinned, not absolute, and that is the whole of the work.** The atmosphere is centred on its own box. On a page fifteen screens tall an absolute one puts the mark seven screens down the article, where nobody will ever see it, and leaves only the two top-anchored clouds visible at the top. `position: fixed` makes it the window's background and the text scrolls over it. Everything else about it is unchanged: the mark, the halo and the clouds were already sized in viewport units, so nothing needed re-tuning. `Atmosphere` takes a `pinned` prop and `Screen`'s `atmosphere` prop takes `"pinned"` beside its boolean, so the landing page and the gate are untouched.

**Most of the mark is behind the summary card, by accident of layout.** The card is opaque `--surface-raised` and lands almost exactly over the centre of the first screen, so what you see on load is the halo and the clouds around it. The mark comes out from under the card as you scroll. Worth knowing before anyone concludes the effect is not working.

**88ch is a wide measure and is deliberate.** 68ch is inside the usual 45 to 75 characters for long prose and 88ch is outside it, at roughly 105 characters a line. The product owner read the page at 68ch and found it too narrow, and asked for 30% more. The same judgement as the gate lockup on 2026-09-02: the current answer rather than a settled one, and the kind of call that only survives contact with the real page.

**Design system impact:** none to the tokens or the components. `readme.md` says nothing about document pages, and there is now one: worth a line saying that a document uses the shared frame with a pinned atmosphere, and that its measure is 88ch, so the next long page does not re-derive both. If the measure moves back, this entry and the one above it move together.

### 2026-09-03 · A pinned atmosphere is a still one
**Surface:** marketing

**Is:** `/privacy` keeps the background it gained earlier today, and nothing in it moves. No drift on the washes or the clouds, no pointer parallax, one draw of the prism shader. The landing page and the gate are untouched and still move.

**The symptom was text arriving a second or two after the scroll**, in bands, as though the page were loading. It was reported as "something weird about the new page" and the guess was the background, which was right.

**What the compositor actually said.** The document column is promoted to its own layer, 938 by 9,655 pixels, for the reason "Overlaps other composited content": it sits over a fixed element that has to be composited. That layer paints in **2.7ms**, so it is not the problem. The nine atmosphere layers paint in **96ms** between them, five 602px flares at ~9ms each, three blurred clouds at 6 to 9ms, the halo at 4.4ms. Every drift moves a wash *inside* a parent carrying an SVG turbulence filter, which re-runs the filter and repaints the layer, so that 96ms was being spent every frame, forever. The text tiles were queued behind it on the same raster thread and lost.

**Why the landing page never showed this.** Same cost, nothing competing for it. A one-screen page rasters once and then has nothing else to draw, so 96ms a frame is invisible. A document is many screens of text waiting on the same thread. The lesson is the one about kits not showing a keyboard, in a different costume: an effect built for a screen that does not scroll has a failure mode that only appears on one that does.

**Frozen rather than removed, and it is the same picture.** `animation: none` lands each loop on its first keyframe and the shader draws at a fixed clock, which is exactly what `prefers-reduced-motion` already does, so this is the view a good share of visitors to the landing page were already getting. Verified after the change: 0 running CSS animations and 0 rAF callbacks a second on `/privacy`, against 10 and 181 on `/`.

**Design system impact:** worth a line in `readme.md` where the atmosphere is described. It is a one-screen effect. Behind anything that scrolls it has to be still, and the reason is measurable rather than aesthetic. If the effect is ever put behind another long page, `pinned` is the prop that does both halves.

### 2026-09-03 · The atmosphere costs what it should now, everywhere
**Surface:** marketing

**Is:** the same effect on every page, drawn far less often. Four changes, all in the shared component, so the landing page and the gate get them too rather than only the document that exposed the problem.

**The loops step instead of easing.** Every drift and every cloud now runs on `steps(duration × 2)`, so a wash moves twice a second rather than sixty times. Each one drifts *inside* a parent carrying a turbulence filter, so any change re-runs the filter and repaints the layer, measured at 96ms across the nine of them. The loops run 47 to 86 seconds and travel about 2%, which makes one step about a third of a pixel. The easing is the only thing given up: a 54 second drift that eases and one that does not are the same drift.

**The prism draws ten times a second, and wakes ten times a second to do it.** Its own clock advances at 0.03, so a second of it is a thirtieth of a cycle and fifty frames in sixty were redrawing something indistinguishable. It was already throttled once in this pass and still scheduling at 60fps to draw at 10; the timer now sets the rate.

**Two easing loops ran forever with nowhere to go.** The pointer parallax eased towards a target it had already reached, on a page usually sitting still with nobody's pointer on it. The landing page's word dissolve was worse: a permanent 60fps loop that called `getComputedStyle` for the font size and wrote the displacement scale every frame, including the seconds between swaps when the value never changed. Both stop when they arrive and are woken by the thing that gives them somewhere to go. **The dissolve is untouched as an animation** and was checked rather than assumed: 34 distinct scale values across a cycle, peaking where it did before.

**Numbers, from a trace of a production build.** Main thread busy per second: the landing page 301ms to 212ms, the gate 100ms to 73ms, privacy 2ms. Idle rAF callbacks a second: the landing page 181 to 68, the gate 60 to 8.5, privacy 0. *Measured in headless Chrome on software rendering, so the absolute numbers are worse than any real machine and only the ratios should be believed. What is left on the landing page above the gate is the word dissolve actually running, which is the animation working rather than waste.*

**Design system impact:** none to the tokens, the components or the look. The rule worth carrying into `readme.md` beside the atmosphere: an effect that sits behind a turbulence filter must not be animated at frame rate, and an easing loop must stop when it arrives. Both were written the expensive way here and neither was visible as a defect until a page with text on it had to share the thread.

### 2026-09-05 · The plate rounds its top only when it is the top
**Surface:** mobile

**Is:** the bottom plate on Android and iOS keeps its rounded top corners while it is the topmost surface of the bottom stack, and drops them the moment a raised conversation sits on it. Under a keyboard the plate also loses its tabs and its safe-area inset, so the composer sits directly on the keyboard.

**The corners were cutting two notches out of a join.** A raised conversation is its own sheet with its own composer, stacked directly above the plate in one column. Both surfaces carry the same fill, so the join should be invisible; instead the plate's radius left a wedge at each end where the scrim behind showed through. Rounding is a property of being the top of a stack, not of being the plate, and the component now reads it that way. Folded, the plate is the top again and rounds again.

**A keyboard means somebody is writing, and nothing else on the plate is any use to them.** Three places to go while you are mid sentence, and a safe-area inset padding a nav bar the keyboard is already covering. Both go on `isVisible`, which reads slightly ahead of the animation, so the tabs are gone before the keyboard has finished arriving.

**A percentage height against a bottom-anchored parent is a trap, and this is the second layout bug from the same stack.** The sheet capped itself at `78%`. Its parent is the shell's column, anchored `bottom: 0` with no height of its own, so Yoga sized the column from the *unclamped* sheet, the sheet then shrank to 78% of that, and the surplus column height showed as a band of nothing below the tabs. It is a pixel height off the window now. The diagnosis came from painting the column magenta rather than from reading it: the column had been reaching the screen bottom the whole time.

**Design system impact:** worth a line in `readme.md` beside the plate. Two rules, both about the plate not being a fixed shape: it rounds its top only when nothing is stacked on it, and it clears itself to the composer alone whenever the keyboard is up. No kit draws either state, so the kits are what has to catch up.

### 2026-09-05 · The conversation leaves the way it arrived
**Surface:** mobile

**Is:** folding or closing a raised conversation rolls the sheet down off the bottom over 280ms while the scrim fades under it, and raising one rolls it back up. It used to disappear between two frames.

**Both surfaces unmounted on the flag rather than on the animation.** `if (!raised) return null` runs the moment the state changes, so the exit had nothing left to animate and only the entrance was ever seen. Each now stays mounted until the timing callback says it is off screen. It is the kind of defect that reads as "no animation was written" when in fact one was, which is worth knowing before anyone writes a second.

**It slides by its own height, measured, not by 60px.** The old offset was a nudge that read as a flicker at speed. The plate paints after the sheet, so the sheet goes down *behind* the bottom bar, and there is no fade on it: a slide and a dissolve at once looks like the sheet is coming apart on the way out. A drag that crosses the fold threshold hands straight over to the exit from wherever the finger let go, rather than snapping to the top first.

**Design system impact:** worth a line in `readme.md` beside the sheet. 280ms, ease, no fade, travel equal to the sheet's own height, and the same curve in both directions. No kit expresses motion, so this is the only place the number lives.

### 2026-09-05 · A swipe action carries its own opacity
**Surface:** mobile

**Is:** the clay Delete panel behind a swipeable row is drawn only while a swipe has actually moved that row. Closed, it is not painted at all. `ThreadRow` and `ContentRow` both.

**Every row wore a ghost Delete for the length of a tab change.** The panel sits behind the row and the row's own opaque background covers it, which holds until something fades the whole screen as one layer. Android's tab transition does exactly that: at 50% through the cross-fade the row's background is 50% transparent, so the clay behind it reads straight through, on every row at once. It looked like a rendering fault and it was ordinary group opacity.

**The rule generalises past this component.** Anything hidden only by an opaque sibling in front of it is visible during any group fade: a screen transition, a modal, a list that animates in. Hiding by stacking order is not hiding. Anything that must not appear needs its own opacity or must not be mounted.

**Design system impact:** worth a line on `SwipeRow` in the component contracts. The reveal is a property of the gesture, not of the row's existence, and the panel's opacity should be driven from the same value as its offset.

### 2026-09-07 · A name, and the two screens that ask for it
**Surface:** mobile, web

**Is:** first run gains a fourth screen, "What should we call you?", between the tutorial and the consent. Settings' My account gains a Name row that edits in place. Both use one field: `NameField` on the phones, toned per platform the way `ConsentTicks` already is, and `.nameField` on web, modelled on the marketing waitlist input.

**"Three screens and nothing to fill in" is now broken twice, and both breaks are the same break.** The kit's rule is about not making somebody configure the filing before they have put anything in. Consent broke it first. A name is not filing either: it is who you are, asked once, at the only moment somebody is already answering questions about their account. Asking later means asking in the middle of something else.

**Skip moved.** It has always meant "skip the tutorial", and it landed on the consent because that was the only screen behind it. It lands on the name now, because both screens that ask something sit behind it. A Skip that jumped a required field would be a dead end with a disabled button on the next screen.

**The row edits in place rather than pushing anywhere.** `SettingsDetail.jsx` draws a tappable Name row and does not say what tapping it opens. A pushed screen or a modal is more screen than one field needs, and the row already has somewhere to put it. It is `EditableRow` beside `Row` rather than an editing state inside `Row`: every static row would otherwise carry a draft, an async save and an error it never uses.

**The kit could not have shown the keyboard, and this is the second screen to learn it.** The field sits above the button that leaves first run, and this app is edge to edge, where Android ignores `adjustResize` outright. Without `KeyboardAvoidingView behavior="padding"` the button ends up underneath the keyboard, exactly as the waitlist form did.

**The same screen serves two arrivals.** A new account meets the name as step four of first run. An account that already existed meets it on its own, on the next launch, with the tutorial and the consent left off: they have read one and given the other, and showing them again would be asking twice. One screen, one field, two ways in, and the second is the one every account in the alpha will take.

**Design system impact:** four things for the kits to catch up on. `FirstRun.jsx`, `M3FirstRun.jsx` and `WFirstRunGate.jsx` are all a screen short and their Skip goes to the wrong place. None of them draws the name screen standing alone, which is the more common of its two uses and looks different: no dots, no Skip, one field and one button. `SettingsDetail.jsx` and `WSettings.jsx` need the Name row drawn in its editing state, which no kit currently expresses. And a text field on a phone screen wants a note that the mock cannot show its own failure mode: anything with a field above a button needs the keyboard drawn before it is called done.

### 2026-09-07 · Focus borders are ink, and `--border-focus` is blue
**Surface:** web

**Is:** every focused text field on the web draws `--ink-950`. `--border-focus` exists in the tokens, resolves to `--blue-500`, and nothing uses it.

**Found while adding the third caller rather than decided.** The marketing waitlist input set it, the gate copied it, and 011's name field and settings field copied it again. Each was individually consistent with the field beside it and none of them used the alias that exists for exactly this. Left as ink here, because switching one field to blue would have made the welcome screen's field focus differently from the waitlist field on the same flow, which is a worse outcome than the inconsistency being invisible.

**Design system impact:** one decision needed, not four call sites. Either `--border-focus` becomes ink and the ramp references collapse onto it, or the app moves to blue focus everywhere. Until then every new field re-bakes the same value, which is how a ramp reference spreads.

### 2026-09-07 · A preference is not the same thing as what it resolves to
**Surface:** mobile

**Is:** the stored theme has its own subscription, `useTheme`, and both settings screens read it through that rather than calling `storedTheme()` at render.

**The Settings index could sit there saying "Light" after somebody chose System.** Classes repaint through NativeWind and React Native props repaint through `useColors`, and both follow the *resolved* scheme. The preference is a third thing, and the two come apart exactly when the choice does not change the outcome: Light to System on a device already in light resolves to the same scheme, so nothing repaints, nothing re-renders, and the row goes on reporting the old answer until something unrelated forces a frame.

**The web already had this and said so.** `apps/web/src/lib/appearance.ts` carries a comment about two components each holding a copy of one stored key being how a screen disagrees with itself. The phone had the identical hole and no such note, which is the two-documents-days-apart shape in a single feature.

**Design system impact:** none visual. Worth one line wherever the design system talks about the appearance control: anything that *displays* a preference subscribes to the preference, and anything that just needs a colour uses the resolved scheme. Those are different reads and only one of them is `useColors`.

### 2026-09-09 · A result is a card, and the thread is its header
**Surface:** mobile, android, web
**Raised by:** the design system, answering `handoff/DESIGN-2026-09-09-answering.md` off branch `013-answering`.

**Was:** nothing. No kit had ever drawn a search or an answer, which is why the brief came from code to design rather than the other way round.

**Is:** one read is one card. The rows sit on a surface of their own, and the thread names them from a header row inside that card: moss, the lasso glyph, the count on the right, 44px, and it is the one link out of the result. Three framings were drawn. A chip above loose rows is the lightest and keeps the existing `Chip`, and it was rejected because the count has nowhere to live and a chip loose above a card reads as two objects where there is one result.

**Why:** the card is what says these rows arrived together as one read, which is the whole difference between two results and one blended list. It also bounds the row fill, so web needs no exception to the pane row's negative margin.

**The cost, stated so it is not rediscovered:** the header is a new part, not the chip. Everything else in the product names a thread with `Chip`, so this is a second way of doing it, allowed only inside a result. On a truncated read the header and the tail both point at the thread; that stands because they say different things, and it should not spread.

**Design system impact:** new component `components/answering/AnswerResult`, wired into all three kits. `readme.md` gains an Answering section.

---

### 2026-09-09 · ROWS_SHOWN is 5 on the phones and 8 on web
**Surface:** mobile, android, web
**Raised by:** the brief, which called eight a guess and asked for a mock to answer it.

**Was:** `ROWS_SHOWN = 8`, one number for every surface.

**Is:** five on the phones, eight on web.

**Why:** `Conversation.tsx` caps the sheet at 78% of the screen, which leaves about 446pt of log on a 844pt phone. Eight rows with the header and the control overrun that by roughly 165pt, so a new answer lands on rows with the sentence that answers the question already above the top edge. Five leaves the sentence, the header, all five rows and the control on screen together. Web has roughly twice the height and keeps eight.

**Design system impact:** `AnswerResult` takes `shown`, defaulting to 5. The web kit passes 8. One number for both surfaces is what makes one of them wrong.

---

### 2026-09-09 · A finished row is never dimmed, and this is not answering's alone
**Surface:** web, and any kit that draws a done row
**Raised by:** the brief, quoting `WThing.jsx:38`.

**Was:** `opacity: 0.5` on a ticked task in the web kit.

**Is:** tertiary ink, a 1px strike and the moss tick. The row keeps its place and its contrast.

**Why:** both shipping components already reject opacity in a written comment: dimming a row on a warm page reads as a rendering fault and takes the label under the contrast floor with it. The meta line fails first. Three signals already say done, so opacity adds nothing but the defect.

**Design system impact:** `WThing.jsx` loses the wrapper, `WRow` gains `done` and `onToggle` and draws a real checkbox. Its box border moves from `--ink-300` (2.5:1) to `--border-strong`, which is the 3:1 floor for anything outlining a control.

---

### 2026-09-09 · Three things a turn already carries, and what answering does with each
**Surface:** mobile, android, web
**Raised by:** the design system, reading `Conversation.tsx` while drawing the answer.

**Is:** three rules, all of which the code as it stands would get wrong.

1. **No Done mark on an answering turn.** The mark is driven by `turn.state === "answered" && turn.did`, and an answering turn writes nothing, so `did` stays false. The reply underneath is the receipt. 👀 is unchanged and does more work here than on a dump, because retrieval takes longer than filing.
2. **Inside the bubble is for a control, below it is for a result.** 012's calendar proposal stays inside; a result is an unbounded list of live rows with its own surface and goes below.
3. **`turn.threads` is empty on an answering turn.** The filed chips answer "where did this go", which is a question about a write. Drawing them beside a result names one thread twice in two different components.

**Design system impact:** the three kits' `Turns` now draw results below the bubble, options inside it, and suppress `refs` on any turn carrying results. Recorded in `readme.md`.

---

### 2026-09-09 · A filled primary is the inverse pair, never a ramp value
**Surface:** all
**Raised by:** the design system, drawing answering in dark.

**Was:** `QuickReplies`' primary painted `--ink-950` with `--text-on-solid`, copied from the way 012's calendar control is written in `Conversation.tsx` (`bg-ink-950` with `text-text-inverse`).

**Is:** `--surface-inverse` with `--text-inverse`. A light pill with dark ink in dark, the reverse on light.

**Why:** the ink ramp flips between themes, so `--ink-950` is #EDEDED in dark and white on it is unreadable. The white in `--text-on-solid` is the pair for moss, blue and clay, which hold their value in both themes; ink does not, so it needs the inverse pair instead. Worth checking wherever else a fill is written as a ramp value.

**The rest of dark needed nothing.** The plate is #0F0F11 and the card is `--surface-raised` at #212121, so the card is the lighter object and the plate between the bubble and the card keeps two same-value surfaces legible as two. Moss holds, so the tick, the header and the truncated tail have no dark variant.

**Design system impact:** `components/answering/QuickReplies.jsx`, one line. Section 8 of `explorations/answering-options.html` draws it. `readme.md` carries the rule.

---

### 2026-09-09 · Follow-ups are 012's control generalised, and the best one is not asked
**Surface:** mobile, android, web
**Raised by:** the product owner, ahead of the multi-turn spec.

**Is:** a question offload asks can be answered with a tap. Three options at most, all of them typeable, labels in the words somebody would say. A proposal has one primary and one plain way out; a choice among equals has no primary, because dark ink means offload is recommending and on a disambiguation it does not know. No option destroys anything. Picking writes your turn into the log exactly as typing would, and the chips go. One open question at a time, closed by the next turn whatever it says, because a yes arriving four turns late is a yes to something else.

**The trust boundary, which is the part that does not depend on the model:** the turn that asks carries no write tools; the turn your tap creates does. A sentence in a shared thread therefore has nothing to talk offload into calling.

**Three accelerators that are not a chip row.** Do it and say so, when the write is reversible, because the eight second toast is already insuring it: ask only when it is not reversible, reaches somebody else, or is a genuine coin flip. Offer to remember a disambiguation that keeps recurring, which deletes next week's question rather than this one. And answer a "which of these" on the result rows themselves, which needs no new control at all.

**Design system impact:** new component `components/answering/QuickReplies`, wired into all three kits and drawn in section 7 of `explorations/answering-options.html`.

---

## 2026-09-08

### 2026-09-08 · Connecting a calendar, and the promise that is no longer true
**Surface:** mobile, android, web
**Raised by:** the design system, building the connect-apps onboarding.

**Is:** first run ends with an optional screen offering one connection, Google Calendar. The chosen
shape is a single app on a single screen: the provider's mark at 88px, two sentences, one primary
button and `Not now`. Not a list, because a list of one reads as a list that is missing something, and
not a preview of the day, because the mark stops being the largest thing on screen. A second provider
becomes a sixth screen or turns this into the list; nothing on the screen claims a list exists.

**The mark is the provider's own asset, never redrawn.** offload's mark comes from `Logo.jsx` because
that geometry is ours and written down. A third-party mark's radius, colours and letterforms are
somebody else's specification, and an approximation that is 90% right is the kind of wrong a person
spots instantly on a logo they see every day. The kits carry a drop slot; the build carries the
official SVG.

**`Not now`, never `Skip`.** Skip belongs to the name screen and means skip the tutorial. Declining a
connection is a different answer to a different question, and it gets its own word.

**Writes are allowed, and the read-only promise is retired.** Every surface that offered a connection
said offload reads your days and never writes to them. That is no longer the product: offload may add
to a connected calendar. The sentence is gone from the onboarding screen and from web Settings'
Connected block. What replaced it is a placeholder and reads as one.

**All copy on this screen is placeholder, and the two sentences under the mark especially.** They are
the only strings in the product that make a commitment about what offload does with somebody else's
data, which is the app's call rather than the design system's. The design fixes the *shape*: two
sentences, what it reads and what it does back, as prose rather than toggles, per the 5 September
Privacy refusal. The wording is open, and the write side needs more than wording: what appears, under
whose name, and whether it can be undone are all unanswered, and may need their own Settings row
rather than a line here.

**Open, and not for the design system to close:** whether the screen appears for accounts that already
exist, since every alpha account does; and whether `Not now` is remembered or asked again, because
"every launch until you say yes" is how a prompt becomes something people dismiss without reading.

**Design system impact:** `ConnectScreen` in `FirstRun.jsx` and `M3ConnectScreen` in
`M3FirstRun.jsx`, both wired as a `connect` phase between the tutorial and day one. Not on web: web
has no first run, and its Connected block in `WSettings` is where the same connection is managed, so
only that block's note and Calendar card changed there.

No new design system components and no token changes. The screen is `AppBar`/`ABar`, `Logo`, a
provider mark passed in as a prop, `--text-title-1` and the gate's 52px pill buttons, which are now
factored out of `ProviderButton` as `GateButton` so the last screen of first run and the first one
share their geometry rather than each carrying a copy. Android gained an `AButton tone="text"`, which
that kit needed anyway for a Material text button.

**Connecting is a step, not an epilogue,** which settles the indicator: the dots span the tutorial
plus this screen, so `STEPS` is `TUTORIAL.length + 1` and both screens draw four. The tutorial's last
card therefore says **Next** rather than Get started, because nothing has started while another card
is still ahead. The dots and the top-right way out are one shared `StepBar` / `AStepBar`, so the two
screens cannot drift apart, and the connect screen has no app bar: it is the tutorial's frame with a
provider mark where the art goes, one button where Next sits, and `Not now` where `Skip` sits.

---

### 2026-09-08 · The prism field: colour on the phones, and it is frozen
**Surface:** mobile, android
**Raised by:** the product owner. "The app currently lacks colour."

**Is:** a baked prism texture on exactly two phone surfaces, inside the bottom plate and behind
the sign-in lockup, held **frozen** until offload files something, at which point a real
displacement shader runs for `--prism-run` and eases its clock to a stop over `--prism-settle`.
Explored in `explorations/prism-phones.html`, `prism-motion.html` and `prism-motion-v2.html`;
settled in `explorations/prism-design.html`; built as `components/layout/PrismField.jsx`.

**It comes from the marketing atmosphere and it is not that.** The web version is a WebGL shader
pushed through an SVG turbulence filter, and it costs ~96ms of raster a frame, which is why it has
to freeze behind the privacy page. React Native has neither the filter nor a cheap route to the
shader, so the same thin-film math ran once offline and the phones ship the result as a PNG. What
survived is the picture; what went is the loop.

**Density is not a taste value.** 140%, chosen by the product owner from a live control, and
measured with the veil against `--text-tertiary`, which sits at exactly 4.5:1 on paper with no
headroom and is used by every row's trailing time, the agenda's time column and a digest's line
times. At the shipped pair the worst tab label is 4.86:1 with none of the strip failing.

**Two mistakes worth recording, because both were the same mistake.** The field was first sized to
a literal 210px behind the plate, which left 77px of it under the scrolling list with nothing
muting it, and `--text-tertiary` failed 35% of that strip. Clipping it inside the plate fixed the
contrast and made the field invisible, because a flat 86% fill eats whatever density adds. The
answer was two things at once: a **graded** veil, light where nothing sits and full by the label
band, and **flipping the texture**, whose alpha had been baked rising toward the bottom for a field
that needed to fade up into the page. Unflipped, the field's density sat exactly where the veil was
heaviest and the two gradients cancelled. Together they took it from a sixth of the gate's strength
to three quarters.

**Arrival, not weather.** Perpetual drift was built and rejected: on the plate most of the field is
under a fill and three tab labels, so a 4px drift spends battery on pixels nobody sees. Frozen with
a two-second warp on arrival costs nothing at rest, and it makes the field the change mark in a
second place. A row takes a moss ground settling over `--duration-mark`; the field takes two
seconds of flow. They fire together. The gate has no arrival, so the screen's own appearance is the
trigger.

**Skia is the dependency.** `react-native-skia` for the runtime shader, several MB of bundle. The
shader itself is trivial per frame; the usual cost is the render loop staying awake, and here it is
awake for two seconds after somebody puts something down.

**Design system impact:** `tokens/atmosphere.css` is new, `styles.css` imports it, and
`components/layout/PrismField.{jsx,d.ts,prompt.md}` plus `components/layout/prism.card.html` are
new. The textures live in `assets/prism/`. Both plates and both gates are wired in the kits:
`App.jsx`, `M3App.jsx`, `FirstRun.jsx`, `M3FirstRun.jsx`. `handoff/APPLY-2026-09-08-prism.md` is
the instruction set, fifteen points.

`readme.md` carries the rules, and five of them were learned by getting them wrong first:

- The field is confined to two surfaces and may never sit under a scrolling list.
- **What has to be symmetric is the composite, not either layer.** The eye sees the field's alpha
  times what the veil passes. Shaping the field alone still opened in 25px at the top and smeared
  over 61px at the bottom, because at the top the two ramps coincide and at the bottom they
  stagger. Both layers on the same window measures 27px at each end.
- **`--prism-veil-reach` is the only stop that is not free to move**, since full fill has to be
  reached above the tab labels at 64% of the band. That fixes the visible window; everything else
  is derived from it.
- **`--surface-plate` is new**: the ground the field sits on and the colour its veil is made of,
  one token so the two cannot disagree. `--paper` on light, `#0F0F11` on dark, deliberately darker
  than `--surface-card`. The plate, a raised conversation and the folded title row all take it.
- **The composer never leaves the plate**, which is now a field constraint as well as a layout one:
  each field maps the whole texture into its own box, so splitting it in two squashes the pattern.
- **The field is the composer-and-tabs band only**, never a folded conversation's title row.
- **The gate's bloom covers all of first run**, mounted once in `GateShell`.

Dark works by re-pointing the fill rather than re-baking. **What is owed:** a dark set of textures
would be better than light tints veiled against a dark ground, and nobody has baked one.

**One thing that is not the design and cost three rounds of review.** The kit pages carry a `?v=`
on `_ds_bundle.js` and `styles.css` and it has to be bumped whenever either changes. With a stale
value the page pins an old build; with no query at all it takes whatever HTTP cached. Both look
exactly like "I refreshed and I cannot see your change".

---

## 2026-09-05

### 2026-09-08 · offload writes to one thing, and the kits said it wrote to nothing
**Surface:** mobile, web

**Is:** the Connected apps page's standing promise changes from "Read only. offload never sends mail, moves events, or deletes photos." to "What offload may do: it writes to your calendar when you ask. It never sends mail or deletes photos."

**Half a promise stopped being true and the other half got sharper.** 012 lets offload add, change and delete calendar events, which the old line ruled out in as many words. The replacement is narrower than the original rather than vaguer: it names the one thing offload writes to and keeps the two it does not. A page that says "read only" while the product writes to a calendar is the kind of defect this repository treats as a defect even when the code is correct.

**The line lives in a claim surface, so it moved in both places at once.** `ui_kits/mobile_app/SettingsDetail.jsx` and `ui_kits/android_app/M3SettingsDetail.jsx` both carried it, and the privacy policy carried the same commitment in prose. All three changed in one commit.

**What a person sees before a write that reaches somebody.** An event with guests, or on a calendar somebody else can see, confirms first and names who finds out: "Ana will be told", "Everyone on this calendar will see it." An event nobody else can see gets the ordinary Undo instead. That is a control this design system has no component for yet, and no kit draws it.

**Design system impact:** two things. The Connected apps page in both phone kits and in `WSettings.jsx` needs Calendar drawn as a live row with its calendars under it, each with a thread, a shared toggle, and an on switch; the current mock is four static rows. And the confirmation described above wants a real component contract: it is not a destructive-action dialog, because nothing is being destroyed, and it is not a toast, because it has to be answered before anything happens. Naming who finds out is the whole content of it.

### 2026-09-08 · A shaped logo does not get a rounded container
**Surface:** mobile, web

**Is:** the connect screen's provider mark is drawn at 88px with no corner radius. The dashed stand-in behind it keeps one.

**Both kits round the mark**, `radius={18}` on iOS and `20` on Material, and that is right for the general case and wrong for the asset that actually arrived. Google Calendar's product icon is not a square bitmap: it carries its own silhouette, including the folded corner at the bottom right, and a container radius on top of it clips geometry its owner already specified. The rule the kits are reaching for is "a provider's bare square should not sit on the screen as a hard-edged rectangle", and an asset that is already shaped has answered that question itself.

**The stand-in keeps its radius, and the difference is the point.** It genuinely is a bare square, and the radius is what makes a dashed box read as the slot an icon goes into rather than as an image that failed to load. So the two states differ on purpose rather than by oversight.

**The mark is Google's own file**, from their asset CDN, committed unmodified: an SVG on web and a 512px PNG on the phones, because this app draws icons from generated path data and carries no SVG transformer, so Metro cannot turn an `.svg` into something `Image` can render.

**Design system impact:** `ProviderMark` and `AProviderMark` want the radius to be a property of the asset rather than of the component. Either default it to none and let a caller pass one for a bare square, or take the shape as a prop. Also unresolved and worth a look with the real file in place: Google's terms set a minimum clear space, and whether the 88px box satisfies it is a question for their current spec rather than for either kit.

### 2026-09-08 · The prism field on the phones
**Surface:** mobile

**Is:** the baked prism texture on two surfaces, frozen at rest, warped for two seconds when offload files something. `PrismField` is a `react-native-skia` runtime shader; the design system's canvas implementation is the reference and the flow field, the alpha rescale and the veil stops are ports of it rather than re-derivations, so the two stay comparable.

**Applied from `handoff/APPLY-2026-09-08-prism.md`.** The five points it said were learned by getting them wrong all hold here: the composite is what has to be symmetric rather than either layer, `--prism-veil-reach` is the only fixed stop, `--surface-plate` is one token for the surface and the veil both, the composer never leaves the plate, and the field is the composer-and-tabs band only.

**Three divergences.**

**The gate mounts its bloom per screen rather than once.** The handoff asks for one field in a `GateShell` around sign-in, the refusal, the tutorial and connect. Those are four Expo Router routes here, and mounting one component across them means a shared navigator whose screens would all have to be transparent. What the rule protects against does not happen regardless: the tutorial, name, consent and connect steps are internal state inside one screen, so moving between them mounts nothing. What is left is a warp when the gate appears and a warp when first run appears, which is what "the screen appearing" means.

**The parallax is handed in rather than listened for.** The web component attaches a capture-phase scroll listener so no screen has to know the field exists. React Native has no equivalent, and the plate lives above the router in `Shell` while the lists live in the tab screens, so the two are in different trees and cannot pass a prop at all. A single Reanimated shared value spans it, written by whatever is scrolling and read by the field, both on the UI thread.

**The field's container is painted rather than transparent.** The handoff has the plate wrapper drop its background for `transparent`; here the plate is painted `--surface-plate` and the field is its first child. The result is the same ground under the same field, and it avoids a transparent plate showing the page through the veil's 86% at the edges.

**And one thing that was not the design at all.** `turbo.json` declared `outputs` for `build` and no `inputs`, while `packages/tokens/src/generate.mjs` reads the design system's token CSS from outside any package. Turbo's default inputs are a package's own files, so it could not see a token change: it called the build cached and restored a stale `dist/` over freshly generated tokens. `pnpm tokens` wrote the right files and the next turbo task overwrote them, so the app compiled against tokens that no longer matched the CSS they came from. The design system is a `globalDependencies` entry now. **That was latent for every token change, not just this one**, and it is the same shape as the generator faults already in this log: a generated artifact failing by doing nothing.

**Design system impact:** two things worth carrying back. `assets/brands/README.md`-style guidance would help for `assets/prism/`: the textures ship as PNG and both clients want WebP, which more than halved them here, partly because the PNGs carry C2PA metadata. And the handoff's step 1 says to replace `.claude/skills/offload-design/` wholesale, which would have deleted thirteen `--wash-*` tokens that seven files in `apps/web` read: the project's `tokens/atmosphere.css` is now the prism tokens alone, while the checked-in one is the marketing atmosphere. The two want different filenames, or the handoff wants a warning.

### 2026-09-08 · The field follows the composer, because the composer is what it is for
**Surface:** mobile

**Is:** the prism band renders behind whichever composer is on screen. With nothing raised that is the plate's, with a conversation raised it is the sheet's, and it is never both at once. The tab row carries no field of its own.

**The design's model does not survive this app's layout, and the difference is old.** The handoff is explicit: one field over one continuous plate whose height never changes, and a raised sheet *rests on* the plate rather than taking the composer up with it. That works because in the kit the plate keeps its composer while raised. This app hides it, because the raised sheet brings its own and two composers would compete for the keyboard, which is a decision that predates the field by weeks.

**What that cost, seen on a Pixel rather than reasoned about.** With the field pinned to the plate, a raised conversation collapsed its box to the tab row: the whole texture and its veil squashed into about seventy points, `--prism-veil-reach` landed mid-label instead of above it, and colour sat behind Tonight, My threads and Memories. That is the one outcome the veil's stops exist to prevent, since `--text-tertiary` is exactly 4.5:1 with nothing spare.

**Moving the field rather than splitting it.** The warning against two fields is about two *simultaneous* boxes, each mapping the whole texture, squashed and broken at a seam. There is only ever one here. And the band the eye sees is unchanged: the sheet's composer sits directly on top of the tabs, so it is the same composer-above-tabs strip, just owned by a different component.

**Design system impact:** worth a line on `PrismField`. The contract assumes the field's box is stable, and the thing that actually has to be stable is the composer band, whoever draws it. A host whose composer moves between surfaces needs the field to move with it, and the rule to state is one field on screen at a time rather than one field per surface. Also worth knowing that at a tab-row height the veil's stops stop protecting the labels, which is a failure mode nothing in the contract currently warns about.

### 2026-09-08 · A proposed calendar write is answered in the reply that mentions it
**Surface:** mobile, web

**Is:** when offload proposes a calendar write it cannot make on its own, the reply carries the control that answers it: one line naming who finds out, then **Add it** and **Not now**.

**It shipped without one, which made the safety mechanism a dead end.** A write that reaches somebody else, guests or a calendar marked shared, becomes a proposal rather than a write. The server side was complete: a row, an endpoint, the outward test re-run against live state on confirm. Nothing rendered it. offload announced that it was waiting, and the proposal expired an hour later having done nothing. For a calendar shared with somebody, which is the common case, that was every write.

**In the reply, not a screen of its own**, and the reason is the house rule this product already follows for failures: a sentence cannot be clicked, so the thing that acts on it sits next to the thing that said it. It is also the only place it could be: the sole origin of an outward write is a model tool call inside a turn, since no screen writes to a calendar.

**One line, two controls, no explanation.** "Ana will be told." or "Everyone on this calendar will see it." Nothing about why offload is asking, because the controls beside it are the answer and a paragraph would be offload diagnosing itself.

**It survives a reload**, returned with the conversation as well as with the turn, so backgrounding the app mid-decision comes back to the same question rather than to a reply about something that never happened.

**Design system impact:** this is the control the 8 September entry said nothing draws yet, and now something does. It is not a destructive-action dialog, because nothing is being destroyed, and not a toast, because it has to be answered before anything happens. Worth a contract: a reply-attached decision with a named consequence, a primary action and a quiet decline, on both phone kits and `WMisc.jsx`'s conversation. The wording of the consequence line is the app's, not the design system's, since it is a claim about somebody else's data.

### 2026-10-05 · A row is one line on a day, even when it both happens and is due then
**Surface:** web, mobile

**Is:** a thread's day list and its month grid draw a row once on any day. A to-do that happens at noon and is due at noon is one line and one dot, drawn as the occurrence, with no "due" under it. On a day it is only due, it is still drawn with "due".

**It was two lines and two dots.** "Pay mortgage", filed with its calendar event, sat under today twice, the second saying "due", next to a To do section that held it once. 015 drew a task with both dates on both days because they are two facts, and that holds when they are two days. On one day they are one thing to do, and two lines read as two.

**Design system impact:** none for the kits, which draw one line per row already. Worth a sentence on the timeline's day list if it ever gets a contract: entries are per row per day, not per date field.

### 2026-10-05 · Memories come back, for what offload knows about a person across their threads
**Surface:** all

**Is:** *memory* is a word again, for one thing: a sentence offload knows about a person that holds across every thread ("Their wife is Meera."). A **note** stays what a thread knows about itself. 014 retired *memory* on 2026-09-10 because a person dumping something could not say which of the two they meant; the split now is scope, decided by offload, never chosen at capture.

**What a person reads changes in three places, and no screen is added.**
- **The calendar question asked in their terms:** `Filed "Pay mortgage". Which calendar is shared with Meera?`. The row's title stays so Today's card still says which row, and the name is clipped to 16 characters.
- **The reply when they ask to remember or forget something,** verb first and second person: *Remembered that Meera is your wife.* / *Forgot that …*.
- **Three fixed refusals:** *Send that on its own and it will be remembered.* / *Not keeping that one.* / *Nothing like that was kept.*

**Shared threads keep the person's words.** A memory decides where and how something is filed in a shared thread and never the words of a title or a note there (owner, 2026-10-05).

**Design system impact:**
- The readme's vocabulary table now has note (a thread) and memory (the person) on separate rows.
- `WMemories.jsx`, `MemoriesScreen.jsx` and `M3MemoriesScreen.jsx` are the fast-follow tab, as rows not chips, per the design queue's answer 1. Their groups map to the six classes: people, things, words, about, rules and patterns. Their sub line must not say "things" and must not draw a zero.
- `MemoryRow`'s origin values become asked, answered and learned.
- The calendar question's person variant is new copy for `QuickReplies`, with no change to the component.

### 2026-10-06 · Staff and Audit can be downloaded as CSV
**Surface:** admin

**Is:** the Staff page and the Audit page each carry an "Export CSV" button in the page head, drawn with the existing small secondary button. Staff downloads straight away. Audit opens a dialog with From and To date fields, defaulting to the last 90 days, and an "Export CSV" confirm. Both are owner only, like the pages, and each download is itself an audit row ("Exported the staff list", "Exported the audit log" with its period).

**Why:** going-public 17c. An auditor wants who has access, and the log beside it, as files they can keep.

**Design system impact:** the admin kit has no export control. Add an "Export CSV" small secondary button to the page head of the Staff and Audit screens in `ui_kits/admin`, and a two-date range dialog on Audit, using the existing `Field` and dialog patterns. No new component.
