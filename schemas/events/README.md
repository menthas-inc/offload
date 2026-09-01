# Event schemas

One file per event, versioned, validated in CI. The envelope is `envelope.schema.json`; each event's file describes only its own `properties`.

**The rule these files exist to enforce (OFF-1):** `properties` carries structured references only. An id, an enum, a count, a size, a duration, a boolean, a status, a timestamp. Never free text a person wrote, a transcript, a title, a filename, a dumped URL, model output, or an email address.

**And never a real account id.** Events carry `subject_id`, the per-account pseudonym. Erasure destroys the mapping on `accounts.analytics_subject_id`, which makes every event already written permanently unattributable without touching an archived file. One event type carrying a real id would defeat that for everyone.

Naming is object_verb: `waitlist_joined`, not `join_waitlist`.
