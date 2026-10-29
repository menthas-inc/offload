# 048, at merge

The entries below go on `main` after the merge, per tasks D1 and D2: `docs/tech/decisions.md` and `.claude/skills/offload-design/decisions.md`. Written here because both logs are shared state edited on `main` only.

## docs/tech/decisions.md

### 2026-10-29 · Live updates: one stream per open client, triggers on the tables a screen shows

Every signed-in client holds one server-sent event stream, `GET /v1/changes`, for as long as it is on screen. It says that something changed, as kinds and ids, never what; the screen reads again through the read it already uses. This widens the 2026-08 entry that scoped server-sent events to one interactive answer: that channel was open only while a turn was out, and this one is always on.

**How a change is heard.** Row triggers (migration `0096_live_changes.sql`) call `pg_notify('offload_change', 'kind:id')` inside the writing transaction, on twenty tables, so every writer is covered, the agent plane and the nightly pass included. The Core API's one listening connection, the one `dumps/answers.ts` already held for answers, listens on the second channel too, and `live/hub.ts` turns what arrives into one event per account on a fixed 500 ms clock. A `thread` change is resolved at delivery to the accepted members who have a stream open, in one indexed query; a connection never caches its threads, so somebody taken out stops hearing at once. A removal is addressed to the removed account alone.

**What it costs, and the triggers to revisit.** Cap of four streams per account, ten-minute lifetime jittered by a fifth, a session re-check every 15 seconds. Two costs grow with use: the reads the reloads cause, bounded at the client by one reload per screen every two seconds, and the session checks, about 7 a second at alpha and 270 at 4,000 open streams. `shortcut:` comments mark both upgrades: batch the session checks when a process holds 1,000 streams, and make the cap a shared count when the Core API runs more than one replica.

**The notify queue.** Every write now waits on the slowest listener in the cluster, so `checkAlerts` gains `notify_queue`, open while `pg_notification_queue_usage()` is over a quarter.

**No broker.** Every replica can `LISTEN`, so the open Redis entry's trigger (pub/sub once streaming runs across more than one instance) is still not met by this.

**Design system impact:** see the design log's entry of the same day.

### Corrections to existing entries

- **Redis, under "Open, needing a call":** add *"048 (2026-10-29) does not need it: each replica listens to Postgres itself."*
- **TanStack Query for server state:** used nowhere; every screen reads with `fetch` and `useState`. Change the line to say so, dated 2026-10-29, rather than leave a dependency the code does not have.

## .claude/skills/offload-design/decisions.md

### 2026-10-29 · The change mark plays for the person's own dump, on every device
**Surface:** iOS, Android, web; the thread page
**Raised by:** spec 048, live updates, from the client review of its feature spec and the owner's choice of a silent redraw.

**Was:** *anything that appeared while somebody was watching* takes the change mark (readme, "The change mark"). Until 048 the only thing that could appear on an open screen was what the person's own dump filed, on the device they sent it from.

**Is:** an open screen now catches up to every change, from another device, another member or the nightly pass. The mark plays only for what one of the person's own dumps filed, on every device that has the thread open, from whichever one it was sent. Everything else just redraws: the owner's call on 2026-10-29, and moss means *offload did this for you*, which another member's change is not.

**Considered and not taken:** a mark for every live change (the owner chose a silent redraw); no mark on the second device (a dump from the phone filing into the thread open on the web is the case the mark exists for).

**Design system impact:** the readme's **The change mark** paragraph: replace *anything that appeared while somebody was watching* with *what the person's own dump filed, on every device with the thread open*. No token, no component contract.
