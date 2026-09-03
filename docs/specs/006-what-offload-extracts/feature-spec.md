# 006 What offload extracts, feature spec

> The what and the why. No tech choices; those are in `impl-spec.md`.
>
> Revised after the review panel. What changed is at the bottom.

## Why

005 builds a thread page. It renders a list of notes, because a note with a title is the only thing offload has ever produced.

007 builds the widgets and the grouping the kits actually draw: a map when a thread has locations, a timeline when it has dated content, a to-do list grouped by city. Nothing produces a location, a date, a task or a city, which is why 007 sits behind this feature rather than in front of it.

004 shipped a planner with two tools that writes exactly one shape: a `note` with a title. Every widget 005 draws is currently drawn for nobody, and that is the correct order to have built them in, because a screen tells you which fields it actually needs and a field invented first tells you nothing.

This feature makes the planner produce what the screen reads.

## What

Three groups of work, and they are not equally interesting.

### 1. offload files more than notes

The planner learns to say what something is and when it matters.

| | What it adds |
| --- | --- |
| `task` | Something to do. Ticks off, carries a priority, may have a due date. |
| `event` | Something happening at a time. |
| `location` | A place. Carries a name and, once resolved, coordinates. |
| Everything else | `note`, `link`, `image`, `screenshot`, `voice`, `file`, unchanged from 001. |

**Reminder is an attribute, not a type.** A reminder is a task or an event that wants to interrupt you. Making it a type would mean a task that becomes a reminder changes type, which is a migration in the middle of somebody's list. The flag is stated here and does nothing until notifications ship.

Alongside the type, the planner sets what it can honestly infer: a due date, a start and end, a priority, and tags.

**Priority is one number and it is not `needs_attention`.** 001 already has `needs_attention`, a boolean the sorter sets, and it is the Today screen's entire query. The two are different scopes and neither replaces the other: **priority orders content inside a thread**, and `needs_attention` decides whether something surfaces on Today at all. This feature writes priority and does not touch `needs_attention`, which has no writer and no reader yet. Said out loud because two ordering signals with no stated relationship is the failure this repo keeps finding.

offload sets a priority when it files. Anybody can change it, a changed priority is marked as set by a person, and the planner does not overwrite one it did not set.

### 2. Tags, and the dimension question

005 groups by a tag dimension. This is what produces the tags.

The planner tags with a **namespace when the dimension is obvious and a bare tag when it is not**: `city:Lisbon`, `room:kitchen`, `shop:Lidl`, and plain `receipt` or `urgent` where no dimension applies. Overreaching here is worse than underreaching, because a wrong dimension produces a grouping nobody asked for and a missing one just means no grouping.

**Tags are normalised on the way in.** Lowercased and trimmed, dimension and value both. `City:Alfama` and `city: alfama` are the same tag or they are two groups that should have been one, and a model producing both spellings across two dumps is not a hypothetical.

**One value per dimension per piece of content.** A note cannot be `city:Alfama` and `city:Porto`. Two cities means two pieces of content or no city at all, because a row that appears under two headings is a row you have to reconcile by eye every time you read the list. Enforced when the tags are written, not when they are read.

**Setting a thread's grouping preference is 007's tool, not this one's.** When somebody says "group this list by city", offload should set the thread's preference, and that is offload doing UI work said rather than tapped, which the readme names as the composer's whole point. It is not here, because there is nowhere to write it: `threads` has no preference column and nothing reads one. A tool shipped a version ahead of its storage is a tool that cannot work, so it arrives with the column and the screen that reads it.

### 3. Referring to something that already exists

004 cut `move_content` and `edit_content` because nothing in the planner's context could name a piece of content. 005 changes that: content has ids, a thread page reads them, and the planner can be given the thread it is looking at.

So the reference tools arrive:

| Tool | What it does |
| --- | --- |
| `list_thread_content` | Reads a thread, so the planner knows what is already there |
| `edit_content` | Changes a title, body, type, tags, priority or dates |
| `move_content` | Puts a piece in another thread |
| `complete_content` | Ticks something off, or un-ticks it |
| `archive_content` | Takes it out of the active list |
| `rename_thread` | Renames it |

*`set_thread_preference` was in an earlier draft and moved to 007 with the column it writes and the screen that reads it.*

`delete_content` is deliberately **not** a tool. Deletion is author-only per OFF-3, offload is not an author, and a model that can delete is a model that can lose somebody's dump on a misread. Archive is the reversible thing offload is allowed to do and it covers every case a person would phrase as "get rid of that".

### Locations resolve through a provider, and that is a privacy decision

People do not dump coordinates. They dump a place name, a Google Maps link, an Apple Maps link, or a sentence with a restaurant in it. Turning that into a pin means sending the name to a geocoding provider and getting back a place id, a formatted address and a latitude and longitude.

**That is content leaving to a new company, and it is the first sub-processor added since the privacy policy was written.** The product owner has chosen Google. What follows from that, stated before any code:

- The privacy policy's sub-processor table gains a row: **Google Maps Platform, place names derived from what you dump, to turn a place into a point on a map.** It is a **separate row from the existing Google one**, which is sign-in only and receives nothing about what anyone dumps. Two rows both saying Google, without saying plainly that they are different relationships, is worse than one honest row.
- **The no-training term is checked against Maps Platform's own published terms, not inherited from the table.** The policy's promise that these companies do not train on what they receive is checked per company, and Maps Platform is a different product from Google's model APIs. `decisions.md` already set this bar for the transcription provider: a no-training term and short provider-side retention are requirements, not preferences. The same bar applies, and it is a condition of shipping rather than a note.
- **Only the place name goes, and that is enforced rather than requested.** "dentist after the 20th and the Time Out Market for lunch" resolves `Time Out Market`, not the sentence, and the way that holds is a validated field: short, single line, refused before it is eligible to be sent. Asking the model nicely is not a boundary. A location whose name fails the check is filed with the name and never geocoded.
- Resolution is a background job, not part of filing. A dump is never held up, and a provider being down produces a location with a name and no pin rather than a failed turn.
- **Two caches, because one does not do what it sounds like.** A cache keyed on the provider's place id only saves the details lookup once the id is known; the search that turns a name into an id still runs per distinct string. So there are two: search text to place id, and place id to details. Stated precisely because "looked up once" was written first and was not true.
- **The cache is not account-scoped and holds nothing but what the provider returned.** No account id, no "first resolved by", no count. It is a geocoder cache with the sensitivity of a phone book, and it stays that way only if nothing is ever added to a row that links it to a person. An account deletion has nothing to remove from it, which is only correct while that holds.
- A location that cannot be resolved stays a location with a name. It appears in the thread, it just does not appear on the map.

## Acceptance criteria

**Types and fields**

- **AC-1** The planner sets a content type from the closed set, and a type it cannot justify defaults to `note` rather than to a guess.
- **AC-2** A `task` carries a priority and may carry a due date. A `event` carries a start and may carry an end. A `location` carries a name.
- **AC-3** A date is only ever set when the dump states or clearly implies one. "after the 20th" is a date; "soon" is not, and inventing one is worse than leaving it null.
- **AC-4** Dates are resolved against the account's own clock, and a dump with no year takes the nearest sensible one rather than the current one.
- **AC-5** `reminder` is a flag on a task or an event, never a type.

**Tags**

- **AC-6** Tags are namespaced when the dimension is obvious and bare when it is not. A bare tag is groupable under the implicit dimension `tag`, so nothing offload already produces needs a migration to be groupable.
- **AC-7** The planner does not invent a dimension to fit a thread's grouping preference. Content that has no city is not given one.
- **AC-8** The number of tags on one piece of content is bounded, and so is the length of each.
- **AC-8a** Tags are normalised at write time, lowercased and trimmed in both halves, so two spellings of one tag cannot become two groups.
- **AC-8b** One value per dimension per row, enforced at write time. A second `city:` on the same row is refused, not silently appended.

**Referring to what exists**

- **AC-9** `list_thread_content` returns at most one page, and the page size is a stated constant rather than "bounded". It returns the same rows the thread page shows, through the same membership predicate, and its token cost does not grow with the age of the thread.
- **AC-9a** Content returned by `list_thread_content` re-enters the loop as untrusted data, labelled as such, exactly as a dump is. **This is the first time one person's stored text is read back into another person's model turn**, because a shared thread holds content other members wrote, so the boundary 004 built for the dump is stated for this explicitly rather than inherited.
- **AC-10** Every content tool validates the content's thread against the account's membership, per call, exactly as `add_content` does. A content id is not authority.
- **AC-10a** `rename_thread` acts on a thread rather than on a row, and is membership-checked per call on the same terms. Stated separately because AC-10's wording covers content and would have left it to be inferred.
- **AC-10b** `edit_content` and `move_content` are refused on a row authored by somebody other than the account whose dump triggered the turn. **`complete_content` and `archive_content` are deliberately exempt**, because those are the co-owned actions 005 settled and neither rewrites anybody's words or moves anything out of reach. offload acting on your own content because you asked is the feature; offload rewriting your co-member's content because their note said to is a confused deputy, and a shared thread is exactly where that text would live.
- **AC-11** `edit_content`, `move_content`, `complete_content`, `archive_content` and `rename_thread` are each reversible, and the whole turn undoes as one unit as 004 established.
- **AC-11a** The reversible allowlist in `decisions.md` names every one of them before any of them ships. OFF-6 says an action is reversible only once listed.
- **AC-12** There is no delete tool. Asserted structurally, not just by absence: the closed set is enumerated in one place and a test reads it.
- **AC-13** A priority a person set is not overwritten by the planner.
- **AC-14** `move_content` obeys 005's rule: only the author may move. The planner acts for one account and is not exempt, so it can move only that account's own content, into a thread that account is in.

**Locations**

- **AC-15** Only an extracted place name is sent to the provider. Never the dump, never a thread name, never a conversation turn. **Enforced by a validated field**, short and single line, checked server-side before a name is eligible to be geocoded, rather than by instructing the model.
- **AC-16** Resolution happens in a background job. A provider that is slow, down or rate limiting never fails a turn and never delays a reply.
- **AC-17** A location that cannot be resolved keeps its name and is visible in the thread.
- **AC-18** Two caches, search text to place id and place id to details, so a repeated place costs no outbound call at either step. Neither cache carries an account id, a timestamp attributable to a person, or a count.
- **AC-19** No place name, address or coordinate reaches a log, a trace or an analytics event. Ids, outcome and latency only, which is OFF-1's own wording rather than a narrower version of it.
- **AC-20** The privacy policy names Google Maps Platform as its own row, distinct from the sign-in one, and its no-training terms are checked against Maps Platform's own published terms, before any code that calls it is deployed.

**The loop, still**

- **AC-21** Every criterion 004 established still holds with more tools: the bound on tool calls per turn, one usage row per model call, the closed-set dispatch, refusals carrying shape and not values, and offload never claiming an action it did not take.
- **AC-22** The tool definitions stay inside their stated budget, and the budget is what decides when they move behind `defer_loading` rather than being shortened.

## Out of scope

- **Recurrence.** Its own spec.
- **Notifications.** The `reminder` flag is set and nothing acts on it.
- **Search.** The planner still cannot find content outside the thread it was given.
- **Embeddings.** `content.embedding` stays unwritten until search.
- **Attachments and transcription.** Still text in, text out.
- **A thread-scoped calendar connection.** Deferred to the connector spec, as recorded.
- **Deleting anything, ever, by model.**

## What the review changed

- **005 got smaller and this feature did not move.** The widgets and the grouping that motivated it are 007 now, behind this one, because they need what this produces. The dependency was always this way round; the numbering was not.
- **Priority landed here, with its relationship to `needs_attention` stated.** 005 had described priority as something offload already sets, which it does not, and left it off the list of things nothing produces yet. Two ordering signals with no stated precedence is the defect class this repo keeps finding.
- **Tag normalisation and one-value-per-dimension** were both unspecified. A model producing `City:Alfama` on Monday and `city: alfama` on Tuesday makes two groups out of one place, and a row tagged with two cities has to be reconciled by eye every time somebody reads the list.
- **"Only the place name goes" was a wish.** It is a validated field now. The reviewer's phrasing was that asking the model nicely is not a boundary, which is right and is the same lesson as validating tool arguments in 004.
- **The cache claim was not true as written.** Caching by provider id saves the details fetch, not the search. Two caches, described precisely.
- **The vendor-terms bar was already set** by the transcription decision and this feature had not matched it. A no-training term is a condition of shipping, not a note.
- **`set_thread_preference` was shipped a version ahead of its storage.** It had a membership criterion, an undo criterion and a task, and nowhere to write: `threads` has no preference column and this feature adds none. It moved to 007 with the column and the screen that reads it. `rename_thread` stayed and kept the membership criterion it was missing.
- **The cross-author refusal was written as a blanket rule** and contradicted the deliberate carve-out three paragraphs later, in the same document. It applies to `edit_content` and `move_content`; ticking and archiving stay co-owned.
- **Reading a shared thread back into a prompt is new**, and the confused-deputy case it opens got its own criterion. In 004 an injected dump could only make offload append something for the person who dumped it. Here it could make offload act on somebody else's content.
