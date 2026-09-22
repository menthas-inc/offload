# 024, at merge

The entries below go on `main` in the same change as the merge, per task A3: three in `docs/tech/decisions.md`, one in `.claude/skills/offload-design/decisions.md`. Written here because both logs are shared state edited on `main` only.

## docs/tech/decisions.md

### 2026-09-22 · Two digests gated on the reminder flag, no per-item push, and Expo carries the words

A date is not announced; a reminder is. Two sends a day, Due today in the morning and Tomorrow in the evening, at the account's hours in the account's zone, placed by an hourly job keyed on the account, the local day and the send, run through the membership predicate at send time, composed by one copy module with three arms and a clamp on every person-written string, and sent through Expo's push service behind the project's access token with enhanced push security on. Locally the memory transport stands in unless `PUSH_LIVE=1`, as the mailer's does. A job more than two hours late is dropped. A push failure carries a status and a code and never the body. The words leave to Expo, then Apple or Google, and the privacy page says so in six places.

**A push token is a delivery capability bound to a session.** One row per token, unique, re-bound to whichever account registered it last, deleted by the server on sign-out before the session ends, dropped when the service reports the device gone. No read returns one and no log line carries one.

**Design system impact:** none here.

### 2026-09-22 · Activity reverses 022's refusal of a notifications page, and why it survives

022 refused a page that existed to hold a dot. What changed is that there is now a record with content in it, some of which exists nowhere else: what was sent, in the words it was sent in, and what offload decided quietly not to send and why. Every silent outcome is written at the moment it happens by the code that decides it: the digest job for a switch or a missing phone, the sweep for an expired request or share in the sender's record, the edit tool for a date the model moved. Readable by the account alone, thirty days then purged, and sooner where a membership ends or the words' author deletes their account. Ordered by when it happened, paged with the cursor compared in Postgres as a row value.

**Design system impact:** none here.

### 2026-09-22 · The gear owns a request, the bell owns the record

022's dot rule is amended in its own spec: a connection request keeps the gear's dot and dots nothing else; everything else offload sends or declines to send dots the bell, and the web sidebar's Activity item carries the same dot. A dot, never a count.

**Design system impact:** none here.

## .claude/skills/offload-design/decisions.md

### 2026-09-22 · Notifications: Activity as a pushed screen, the Notifications page, and Today's agenda, as built
**Surface:** iOS, Android, web

**Is:** the bell on Today is a control with a 44px hit area and a dot, opening Activity, a pushed screen without the plate: newest first under Today, Yesterday and Earlier, the lead a 28px disc, filled for something that reached the phone and hollow on `--border-lift` for something that did not, the kind's glyph in it, the words as sent, the time, and Not sent as a sentence-case tag, `--text-noticed` and a door to the setting where a setting or the permission caused it, `--text-tertiary` and inert where the product chose. The Notifications page in Reaching you: Due today with "One message each morning.", In the morning at, Tomorrow with "One message each evening.", In the evening at, Connection requests, Added to a shared thread, and System settings with "Sounds, the lock screen, and turning offload off entirely." Today's three groups reuse the thread page's row with the thread's name as its meta, and the two empty states.

**Where the code diverged, and why.** Activity is a pushed screen rather than the kit's roll-down `NotificationSheet`, and the kit's `NotifRow` gives way to the exploration's lead-and-tag row. The Communication settings page is replaced by Notifications, its quiet hours, email, push and weekly summary dropped, and the evening switch reads Tomorrow. The request body carries no pronoun and the share body does not repeat the thread's name; no line carries the retired noun, and group labels and the tag are sentence case. Today's rows reuse the thread page's row rather than the kit's `PriorityRow`, and on the phones the pencil, the trash and the long press open the row's thread rather than acting in place. An event in a one-thing digest carries no verbs where the apply note gives every one-thing digest two. The readme's Activity list names a declined request, which nothing writes yet. The Notifications page offers the one permission ask when the system was never asked, which the mock does not draw. The Android small icon is the app's own until a monochrome mark is added.

**Design system impact:** the kits' `NotificationSheet` and `NotifRow` want replacing with the pushed Activity screen and the lead-and-tag row; the Communication page wants replacing with Notifications as above; the Today kit wants the three groups over `ContentRow`; the digest copy in the exploration wants "Answer in My people." and "Ana added two to Lisbon trip" without the noun; and a line on the one permission ask in the undetermined state.
