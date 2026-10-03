# 037 Thread icons, feature spec

**Status:** drafted 2026-10-04, revised the same day after the project lead, client and security reviews, from the design system's *Every thread has a mark* (decisions.md, 2026-10-03; readme **Thread marks**; `handoff/APPLY-2026-10-03-thread-marks.md`; `explorations/thread-marks-v2.html`) and the owner's answers of 4 October
**Surfaces:** iOS, Android, web, the Core API, the agent
**Depends on:** 001 (threads), 005 (the thread page and rename), 025 (the label hues), 028 (My threads, not in a thread), 022 (co-owned threads)
**Amends:** 005's rename sheet and the web's inline rename, which become Edit thread; the agent's `create_thread`, which may name an icon

## Why

Every thread is drawn with the same `lasso`: in My threads, in the pill on a Today row, in an answer, in the Move picker. Past five threads the only way to find one is to read every title. The thread's bar has a name and nothing to recognise it by.

## What

Each thread has **an icon and a colour**: one of seventy Lucide glyphs, or `lasso`, on a wash of one of the ten label hues. offload picks both when the thread is made. Anybody in the thread can change them. The design calls the drawn result the thread's mark; in code it is `ThreadIcon`, because on the phones a mark is already a person's picture.

### 1. Who picks

- **The model, when it creates the thread.** `create_thread` takes an optional icon, one of the seventy. It rides the call that already creates the thread: there is no extra model call (owner, 2026-10-04, amending the handoff's *no model call*).
- **The word list otherwise.** When the model names none, when a person creates the thread from a proposal, and for every thread that exists today: the name is lower-cased and split on anything that is not a letter or a digit; the first of the seventy, in the handoff's order, with any of its words among the name's words wins; a plural *s* is tolerated both ways. Whole words only: *carpet* is not a car. No match is `lasso`.
- **The colour** is the hue least used among the creator's live threads, ties to the lowest number, and is set on create only. The default thread is never drawn and is not counted.
- **A rename re-picks the icon** while the pick is still offload's and the word list finds a match in the new name. With no match the icon stays as it is: a model's pick is not thrown away because *Lisbon* became *Lisbon 2027*. This is narrower than the handoff, which falls back to `lasso`. The colour never changes on a rename.
- **A person's pick is never overwritten.** Changing the icon or the colour in Edit thread marks the pick as the person's, for everybody in the thread, and neither a rename nor the model touches it again.
- The model does not change an icon or a colour after the thread is made, and does not pick a colour (owner, 2026-10-04). Its `rename_thread` is a rename like any other: the server's word list may pick again, the model names nothing.
- The model is shown the seventy names on every turn, which took the tool definitions past their budget. The owner raised it to 2,100 on 2026-10-04.

### 2. The icon, drawn

As the handoff's item 3: a rounded square at 30% radius on iOS and the web, a circle on Android; the hue mixed into the page as the ground; the `oil-ground` texture over it in luminosity, placed and turned by the thread's id so a thread always washes the same; a 1px inset ring of the hue; the glyph at half the size in the hue taken darker. Light and dark each have their own mix.

### 3. Where it shows

| Place | Size |
| --- | --- |
| My threads row, phones | 40, Android 44 |
| Web My threads | 32 |
| Web sidebar's thread rows | 20, which is what a 34px nav row holds |
| The thread's bar, phones | 28 |
| Web thread head | 36 |
| Thread pill: Today rows, events, a question card | 18, a circle on every platform, in the moss pill, which grows from 24px to 26px with 4px on the left |
| Thread pill in the turn's footer | 18 circle; the pill stays 30px, where every mark in that row is 30 |
| The composer's *In thread* chip on the phones | 18 circle |
| An answer's head and tail | 18 circle |
| Move picker rows | 24 |
| A Move to suggestion's chip | 16 circle: the chip is one line of 13px text |
| A person's shared threads, and the list in the remove confirmation | 32 |
| The web's crumbs for a thread | 18 circle |
| Edit thread | 56 |

The My threads tab glyph, the empty states and first run keep `lasso`: none of them is a particular thread. The web sidebar's `message-circle` fallback for a thread goes: every thread has an icon now. The name field in Create thread keeps `lasso`: the thread does not exist yet. An invitation card names a thread the person is not in yet and stays text. What is not in a thread draws no icon, as now. Everywhere else a thread is named in words (a note's source, the timeline, a place sheet, the share sheet, calendars, a notification) it stays words.

An icon name a build does not know draws `lasso`, on every client. Inside a row or a pill the icon is hidden from a screen reader: the name beside it says it. While a thread is loading its bar draws no icon, as it draws no name.

### 4. Edit thread

One sheet in place of rename. Phones: a bottom sheet as tall as its contents (owner, 2026-10-04; the handoff pinned it 150px below the top); web: a 360px popover under the icon.

- Opened by tapping the icon or the name in the thread's bar, and by More's **Edit thread**, which replaces *Rename thread*. The icon and the name are one button to a screen reader, *Edit thread*. The keyboard opens only when it was opened from the name.
- On the phones the sheet rides up with the keyboard, so the name is never under it. Swiping down closes it from the header; the grid scrolls on its own.
- **Android:** the sheet is radius 28 on `--a-c0`, the grid's cells are circles, the picked cell and the picked hue are `--blue-600` on `--surface-attention-soft`, Save is `--blue-700`, the field is outlined with a 2px blue ring.
- **Header:** *Cancel*, **Edit thread**, **Save**.
- **Name:** the icon at 56 previewing every change, beside the name field. While the pick is offload's and the person has not touched the grid, typing a name previews the icon the rename would pick.
- **Icon:** the seventy in one scrolling grid, six columns (web seven). The picked one is ringed.
- **Colour:** the ten hues as washed circles, the picked one ringed.
- **Save** writes name, icon and colour in one request and the bar changes at the press. Toast *Thread updated* with **Undo**, which puts back all three and whose pick it was. Nothing changed: Save closes the sheet and writes nothing.
- A failed save puts the bar back and toasts *Couldn't save that*. An empty name disables Save.
- **Cancel**, the scrim and a swipe down drop everything.
- The web's inline name input goes.

### 5. Existing threads

Every thread gets an icon by the word list and a colour by its place among its creator's threads, in creation order, so ten threads get ten colours. All are offload's picks.

## Acceptance criteria

- **AC-1** A new thread has an icon and a hue from 1 to 10 the moment it exists, by every path that creates one.
- **AC-2** `create_thread` with an icon from the seventy stores it; with none, or with a name that is not in the list, the word list picks. The call is never refused over the icon.
- **AC-3** The word list picks as section 1 says: first glyph in order, plural tolerant, `lasso` on no match. One module, read by the server and both clients.
- **AC-4** The hue on create is the least used among the creator's live threads without the default, ties to the lowest.
- **AC-5** A rename while the pick is offload's re-picks the icon on a match and keeps it otherwise; it never changes the hue; it changes nothing once the pick is a person's.
- **AC-6** Saving a changed icon or hue marks the pick as the person's, as the handoff has it: either one is somebody deciding how the thread looks. Saving a name alone does not.
- **AC-7** One request writes name, icon and hue, and returns what was there, including whose pick it was. Undo restores all of it.
- **AC-8** Only a member of a live thread can change them; anybody else, and a deleted thread, gets the same 404 as a rename. An icon outside the list or a hue outside 1 to 10 is refused by the route, and the column refuses anything that is not the shape of an icon name.
- **AC-9** Every read in section 3's table carries the thread's icon and hue from the thread as it is now, never from a stored copy. A source test holds every response schema that names a thread for a person to carrying both.
- **AC-10** After the migration every thread has an icon and a hue; a creator's first ten threads have ten different hues; the migration's word list is the module's.
- **AC-11** `ThreadIcon` draws in every place in section 3 at its size, and no `lasso` stands for a particular thread on any client.
- **AC-12** The wash is placed by the thread's id and is the same on every surface and every visit. A list of marks on the phones draws no live canvas per row.
- **AC-13** Edit thread behaves as section 4 on all three surfaces, with a screen reader: the grid and the hues are radio groups, each glyph named by a word and each hue by its number's colour name.
- **AC-14** The 59 new glyphs are in both clients' sets, and no icon name a client uses is missing from its set.
- **AC-15** The agent's eval gains cases: a new thread carries the icon that fits its meaning; a thread with no obvious icon gets one of the seventy or none, never a made-up name.

## Out of scope

The model changing an icon or colour on request. A suggestions row or groups in the picker. Emoji. A per-person icon for a shared thread. Icons on proposals before they become threads. Redrawing the kits: the handoff's standalone page is the reference.

## Privacy

Nothing changes on the privacy page. The icon and the hue are derived from a thread's name on our own server; no content goes anywhere new, and no event or log carries the name (OFF-1).
