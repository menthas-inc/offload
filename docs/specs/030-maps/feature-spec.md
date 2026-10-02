# 030 A thread's map

**Status:** drafted 2026-10-02 against the design handoff of the same day (`handoff/APPLY-2026-10-02-maps.md`, `explorations/maps.html`, the readme's **A thread's map**, the design log's *2026-10-02 · A thread's map*), synced to `main` in `09ba56b`, with the product owner's answers and the project-lead, client and security reviews. **Rewritten the same day for Google Maps Platform**, on the owner's decision to use Google rather than the handoff's MapTiler and MapLibre, after reading Google's terms as of that date (`docs/tech/vendor-terms/google-maps/`, T0.3), and **revised again** with a second round of the three reviews against Google. The kits are not redrawn for the map; the exploration is the reference for everything offload draws, and where the exploration's code and its prose disagree, the code is read.
**Surfaces:** iOS, Android, web, the Core API and the agent plane.
**Depends on:** 006, which resolves a place name into a point and owns the two caches; 007, whose widgets earn the Places section this retires; 016, whose link reading, its switch and its quarantined reader feed a point; 019, whose connected calendars and per-thread picks put events in a thread; 022, whose shared threads show everyone the same rows; 025, whose labels colour a point and whose filter bar filters the map; 028, whose default thread is never drawn as a thread.
**Amends:**
- `docs/tech/decisions.md`: *The map has no tiles and no provider* and item 3 of the answered open decisions, which says 007 draws pins on a plain surface and real tiles are a later decision (both superseded: Google draws the map); the ⏳ *Google Maps Platform is a sub-processor and is not switched on* and the same item's no-training and short-retention conditions (superseded: switched on by this feature **without** those conditions, which Google does not offer; the owner accepted that on 2026-10-02 and the privacy page says so by name); the two widget entries that use *a map when it has locations* and *a trip full of places leads with the map* as the example of an earned widget; *A member's pick ... with a title and a time and nothing else* (the location now crosses); and `docs/tech/going-public.md` item 13 (rewritten for the Maps keys and quotas).
- 006: the lookup becomes Google Places in two steps, storing Google's place id and, for at most thirty days, its coordinates; Google's own name, address and categories are never stored or drawn; one filter keeps what may be personal data out of every query; a peppered query cache; a miss that expires.
- 007: the Places section and the `map` widget kind are retired.
- 016: the *Read links I paste* note, which today says *Nothing of yours is sent.*
- 019: *What crosses to another member is a title and a time: never the guests, never the place* becomes *a title, a time and where it is*, in the spec, in `threads/calendars.ts`, `routes/threads.ts` and both clients' `lib/threads.ts`. The pick sheet's copy says so. **019's impl-spec line 70, the model's `find_events` view, does not change**: the model still gets a title and a time.
- 025: line 77's pin rule (*solid with a white glyph*) is replaced by section 5's point.
- The design system, in one log entry on `main` (section 13): the map is Google's on all three surfaces, not MapLibre with MapTiler; Open shows a place sheet rather than the row's sheet; the column is decided by the pane's width, drops the list's width cap, and carries no chips of its own; the circle is a 300m radius; the app bar's labels and calendars move into More while the switch is drawn; three new tokens; the switch is an icon variant of `SegmentedControl`, its halves narrower than 44px across, accepted; Directions is always Google Maps, with no Apple Maps choice; dark-theme treatments; Android's picked half on the accent alias rather than `--moss-700`; attribution is Google's own logo and legal line, not a line of text; the count dot, which the exploration does not draw.
- The privacy policy, in the summary and sections 3, 4, 5, 6, 9, 10 and 11 (section 12 below), including the sentence that every company in section 6 publishes a no-training term and the one under the table that each acts only for us, which both gain Google Maps Platform as their one named exception.

## Why

Places are the one kind of thing offload keeps where a list is the wrong shape. A trip, a flat hunt or a week of dinners is a set of points, and a person planning one wants to see them against each other: what is near the hotel, which two viewings are on the same street, how far the restaurant is from the venue. Today a located place earns a Places section, which is rows with no map, and the readme says *the split pin waits for a map provider*.

The design decided on 2 October gives a thread a map once something in it has a point, behind a List | Map switch on the phones and as a column beside the list on a wide web pane. Most of what has a location in offload never arrives as a "place": it is a link to an Airbnb, a restaurant's page, a calendar invitation with a venue, or "dinner at Time Out Market on Friday". So the feature is as much about **finding points in what people already dump** as about drawing them.

Nothing about it asks anybody to choose anything. A thread earns its map the way it earns a widget, and loses it the same way.

**Why Google.** Its phone maps cost nothing at any volume and its web maps and place lookups are free well past offload's size for the foreseeable future, where MapTiler's commercial plan is a fixed monthly fee from the first public user. The price is in its terms: Google keeps and uses what it receives to improve its own products, as a controller in its own right; it may not be sent personal data; and its results may only be drawn on its own map. Section 12 says the first in public, section 2's filter answers the second, and the third decides the stack.

## What

### Vocabulary

In anything a person reads the feature is **the map**, its two views are **List** and **Map**, and a point on it is drawn but never named: no copy says pin, marker or point. **Directions** and **Open** are the callout's actions; the sheet Open shows is the **place sheet** in this spec and in code. In schema and code a row **has a point** when it is attached to a place with current coordinates, the components are `Point`, `Callout` and `ThreadMap`, and a place whose result is an area rather than a spot is **approximate**. The Places section's heading, *Places*, goes; 028's type chip *Places* on Not in a thread stays.

### 1. What has a point

A live row (not deleted, not archived; a ticked to-do counts, since a finished plan still happened somewhere) has a point when it is attached to a place with current coordinates. Four sources.

1. **A saved place**: a `location` row, looked up from its name as 006 does today. Renaming it looks it up again. A name the filter refuses (section 2) is kept as the row's name, with no point: a saved place is the person's own, so it is never refused, only not looked up.
2. **A link with a location.** When offload files a link from the dump, the worker already asks that page once for its picture (016). **Only when the dumper's *Read links I paste* switch is on**, the same response is also read for a location in the page's own metadata. The read is the same bounded request as the picture's: https only, no redirects, the public-address guard, 4 seconds, the first 256KB and no more. **Coordinates become the place directly**, with no lookup and nothing sent to Google. **A place name** is looked up (section 2). **A page that gives only a street address gives nothing**: an address cannot be sent to Google, and with no coordinates it would draw nowhere. A location the page keeps further down is not found, and most pages carry none; a link with no location is the ordinary case. **The link's point is read by code, never supplied by the model**, and the page's words are never shown as an instruction. The switch gates the read, at filing, by the person who dumped the link; the point that results is the row's, and every member of the thread sees it.
3. **An event offload filed, with a location.** An event row gains an optional location: the name of the public place it happens at, at most 120 characters on one line once trimmed. **offload attaches it when filing**, from the words the person dumped ("dinner at Time Out Market on Friday") or from the `place` field the quarantined reader (016) returned for a link in that same dump, and from nothing else. It does not search for a venue that was not given, and a person's home or name is not a venue ("dinner at Ana's" files no location). **A location the filter refuses is refused at the tool**, unlike a saved place's name, because here it is offload's reading of the dump and the model should hear that it is not a place to look up. A person changes or clears it by saying so: the edit tool takes an event's location, set or cleared, under the same rule. There is no field for it in the edit sheet in this pass. The location is looked up like a saved place's name.
4. **An event from a connected calendar** that a thread picks (019), whose own location text is looked up after the calendar syncs and when a calendar is first picked, for events from yesterday to sixty days ahead, **through the same filter**, so a calendar entry at a street address or a person's place has no point. That text was written by whoever made the event: it is a query and nothing else, never shown as an instruction, never given to the model by this feature. **In a shared thread the location crosses with the event**: a member's picked calendar has reached the others as a title and a time (019); from this feature it is a title, a time and where it is, drawn on everyone's map and in the place sheet's Address, for as long as the calendar is picked, including picks made before the feature (product owner, 2026-10-02; there is one account today). Guests, their answers and addresses, the event's description, who is invited and whether it is the member's own all stay with its owner.

A row whose location was not found, was filtered out, or has not been looked up yet has no point. It stays in the list exactly as today and is not drawn or counted anywhere on the map. Photos are not drawn on the map, whatever their camera recorded, and neither are notes.

**Correcting a point.** A wrong point is far more visible than a wrong row, so each source has a way out: a saved place is renamed; an event's location is changed or cleared; a link's point is cleared. All three by saying so in the composer, which the edit tool carries out under the usual rule that only a row's author changes it, with the turn's Undo putting the place back. A cleared link point is not read again. There is no control for it on the place sheet in this pass (out of scope).

**What the model sees.** A row the model lists carries one yes or no, whether it is on the map, so "take that off the map" finds the right row and the model can tell that it worked. **Nothing else this feature adds reaches a prompt**: no place, address, area or coordinate appears in any tool result, prompt block or trace, which also keeps Google's results out of anything the model writes (Google's terms forbid using its content to make other content). The model writes an event's location; it never reads a place back.

### 2. Looking a place up

Place lookup is **Google Places**, in two steps: a text search that returns only Google's id for the place, then that place's coordinates and kind. Everything 006 promised about the lookup stands and now covers all four sources:

- **Only what looks like a public place's name goes to Google.** One filter for every query, whatever its source, enforced where the lookup happens rather than by each caller. Tidied first (Unicode-normalised so a full-width or foreign digit is a digit, control characters removed, whitespace collapsed), then **not sent at all** if it: spans lines or runs past 120 characters; holds any digit (a street number, a flat, a postcode, a phone number); holds an `@`, a `/`, or a web address with or without `www.`; holds a possessive in any of its forms (*Ana's*, *the Silvas'*, *casa da Ana*, *chez Ana*, *bei Ana*); starts with a street word (*rua*, *avenida*, *travessa*, *calçada*, *largo*, *praça*, *estrada*, *street*, *road*, *lane*, *drive*, *boulevard*, *way* and their short forms); or is a call or no-place word (*Zoom*, *Google Meet*, *Teams*, *Webex*, *Whereby*, *Jitsi*, *online*, *phone*, *call*, *TBC*, *TBD*). Google's terms forbid sending it personal data, and these are where personal data most often sits in a place field. **It is a filter, not a guarantee**: a bare person's name with none of those marks still passes, and the privacy page says exactly what the filter does rather than what it hopes to catch. A place name with a number in it (*Terminal 2*) loses its point, which is the price of a filter that never guesses.
- **Only the query goes**, with nothing about the person, the thread, the dump or the turn.
- **In the background, never in a turn.** A dump never waits for Google.
- **What is kept is what Google's terms allow**: Google's place id, indefinitely, and the place's coordinates and whether it is an area for **at most thirty days**, after which they are deleted. When a map is opened and a place on it has lost its coordinates, they are fetched again then, so Google is asked about a place only when somebody looks at it. **Google's own name, address and categories are never stored and never drawn**; what the map, the callout and the place sheet show is offload's own text: the row's title, an event's location.
- **The same two caches**, never tied to an account. The query cache's key is peppered with a secret held outside the database, so a copy of the table is not a dictionary of places people mentioned. A remembered miss expires after thirty days. **A calendar's location text never enters the query cache**: the event remembers a keyed fingerprint of what it last looked up, not the text, and that goes with the calendar copy. A place nothing points at any more is deleted.
- **A too-coarse result is a miss.** A country or a region is treated as not found, since a point at a country's centre is worse than no point. Google's text search ranks results but gives no score, so a wrong match is not caught here; it is corrected as section 1 says, and a calendar's is corrected in the calendar.
- **Approximate**: a result whose kind is an area (a neighbourhood, a locality, a postcode) rather than an establishment, a point of interest or an address is approximate. A page's coordinates are exact.
- **Logged: that a lookup happened, and how it went.** Ids, outcome and latency. Never the query or the coordinates.
- **A calendar fills in a batch at a time**: at most two hundred lookups per calendar per sync, the rest on the next one fifteen minutes later.

Until the lookup is switched on, it is skipped and **nothing is remembered as a miss**. (Every location saved so far was remembered as a miss, because the key was never set; section 11 clears them.)

**What Google's terms allow, as offload reads them** (product owner, 2026-10-02, recorded in `docs/tech/decisions.md`): offload's server sends Google only filtered place names, which on their own say nothing about who asked and are not personal data; a device that opens a map sends Google its address and the area drawn itself, which Google collects as a controller under its own terms rather than receiving from offload. On that reading the terms' bar on providing a European user's personal data is met.

The town under a photo (020) is not on a map and stays off; its two-variable gate does not change.

### 3. The switch, on the phones and a narrow web pane

In the thread's app bar, after the title: a segmented pair, `list` and `map-pin`, named *List* and *Map* for assistive tech, pressed or not. It is an icon-only variant of `SegmentedControl`, logged as a contract change. iOS and the web: 36 by 30 halves on a `--surface-fill` pill, the picked half on `--surface-raised` with `--shadow-1`. Android: an outlined segmented button in `--border-strong`, 44 by 32 halves, the picked half on `--surface-accent-soft` with its glyph in `--text-accent`. The halves take their 44px target vertically, inside the bar; across, two adjacent halves cannot both reach 44 without overlapping, and the narrower target is accepted and logged.

- **Drawn only while the thread has a point**, which the thread's bundle says. When the last point goes, the switch goes and the thread returns to List.
- **While it is drawn, the bar is back, title, switch, share, More** on the phones. Labels and calendars, which are glyphs in the bar today, become the first two items in More. A thread with no point keeps today's bar. (Product owner, 2026-10-02.) On the web the switch sits in the pane head's tools, before the label tool.
- **Map replaces the body under the app bar** with the map, full bleed to the plate. The thread's name moves into the bar's title, where it sits today on iOS (left aligned, as built) and Android (64px bar, 22px title). The label filter bar floats over the map's top edge, its chips on `--surface-raised` with `--shadow-1` (8px radius on Android), with the same pick as the list and **no counts**. The composer plate stays, and a dump from the map is filed like any other.
- **Google's logo and legal line stay visible** above whatever covers the map's foot: the plate, the plate with the keyboard up, and the place sheet. The map's bottom padding follows what covers it; a padding change keeps the camera where it is and is not a re-fit.
- **The keyboard over the map** does not resize or re-fit the map; an open callout closes when the composer takes focus.
- **Back from Map returns to List** before leaving the thread, on Android's system back and predictive back alike. iOS's back chevron and edge swipe leave the thread, as they do today; the web's browser back is unchanged, since the view is not in the address.
- **Leaving Map for List and coming back** in one visit keeps the map where it was left; it fits again on the next visit.
- **The choice is kept per thread on the device**, in local storage on each client, the hundred most recent threads and no more. A thread opens the way it was left; one left on Map that no longer has a point opens on List.
- **While List is showing, a map kept from earlier in the visit is hidden from sight, touch, assistive tech and the keyboard**, not merely covered.
- On the web, a thread in the pane behind (the 520px one) draws no switch and no map; it shows its list.

### 4. The column, on a wide web pane

When the web's top thread pane is at least **1000px** wide, measured on the pane's own content box with 16px of give either way so a resize across the line does not flicker, the pane becomes two columns: the list, taking the rest of the pane with no width cap, and the map in a 460px column on the right, full height, sticky, with an inset 1px `--border-hairline` on its left. **No switch is drawn**, and the column carries no chips of its own: the list's filter bar filters both. Below that width, including whenever another pane sits beside the thread, the web uses the switch as the phones do. The width is the pane's, not the window's, so a second pane opening moves the thread to the switch rather than squeezing its list under the column. A thread alone beside the sidebar gets the column from a window of about 1250px.

- The composer's bar is held to the list's column while the split is on, so it never covers the map or Google's logo.
- Hovering a row scales its point to 1.35 over 140ms on `--ease-out`; hovering an approximate row raises its circle's fill to 30%.
- Picking a point or a row opens the point's callout and gives the row `--surface-fill`. A row that is not loaded is not scrolled to or fetched: its point still opens its callout.
- Crossing the width either way keeps the pick and keeps the map.

### 5. Points, circles and the callout

All drawn by offload over Google's map, the same on the three surfaces.

- **A point** is 16px with a 2.5px ring in `--paper` and `--shadow-point`. Its fill is its first label's `--label-n`, first in the order the bundle sends a row's labels, which is the thread's label order; two labels split it vertically at 50%; three or more use the first two; none is `--text-primary`. **An event is a square** with a 5px radius. Picked, it is 24px with a 3px ring and `--shadow-point-picked`. Its target is 44px, shared at the midpoint with a neighbour closer than that.
- **A connected calendar's event** is an ink square: it carries no labels (025) and has no row in the thread, so a label pick hides it and the wide web's row hover and highlight do not apply to it.
- **An approximate place** is a circle of **300m radius** in its label's colour (ink with none), 16% fill and a 1.5px ring at 70%; picked, 26% and 2.5px. **Tapping inside it picks it**: a tap on the map is tested against the circles first (inside the 300m, or within 22px of the centre on a small one, the nearest winning), and only a tap that hits nothing closes the callout. It becomes a point when an exact location replaces it.
- **Overlapping points** become a count dot until zoomed apart: 24px, `--text-primary`, with the count in `--surface-page` at 12px semibold. Tapping it zooms in to separate them, past the opening fit's limit if it has to. Its accessible name is *Zoom in to 3*.
- **The callout**: at most 228px wide, its contents wrapping rather than clipping at a large text size, `--surface-raised`, `--radius-md` (16 on Android, logged), `--shadow-callout`, a 12px rotated-square tail on the point (on the centre for a circle). The row's own title at 15px semibold; the kind and its `LabelMark`s at 12.5px; then two pills at least 32px tall (36 on Android), each reaching a 44px target: **Directions** on `--surface-inverse` with a `compass` in `--text-inverse`, and **Open** on `--surface-fill`. **On the phones the callout is an ordinary view over the map, placed from the point's position on screen** and moved with the map, never one of the map's own callouts, which Android draws as a picture with one tap target.
- Tapping the map closes the callout; tapping another point moves it; picking pans just enough to keep the callout inside the frame (126px from either side, 190px from the top).
- **For assistive tech** each point is a button named by its title and kind, the callout is a dialog named by the title, and Open is *Open Time Out Market*. On the web the points follow the list in tab order and Escape closes the callout.
- In a shared thread every member sees the same points.

### 6. Directions

**Directions** opens **Google Maps** with the place as the destination, by its coordinates and, where Google gave one, its place id, and nothing else. **Always Google Maps, on every surface**: Google's terms forbid handing its results to another company's map, so there is no Apple Maps choice (a divergence from the design, logged).

- **iOS and Android**: Google Maps' directions link, which opens the Google Maps app when it is installed and Google Maps in the browser when it is not.
- **Web**: the same link in a new tab, with no referrer.

An approximate place's Directions goes to the circle's centre. offload records nothing about the hand-off; Google receives the destination, and recognises the person if they are signed in to it.

### 7. Open, and the place sheet

**Open** shows the **place sheet**, reached only from the map. Tapping a row in the list, in either view, still opens what it opens today. The sheet is read-only and every line in it is offload's own text.

- **Phones**: a half sheet on the existing sheet machinery over the map, the map behind `--surface-scrim` and still live, its bottom padding raised to the sheet so Google's logo stays visible. iOS's sheet is `--surface-raised` with the usual grabber; Android's is its 28px-radius bottom sheet on `--surface-sheet`. **Web**: a 360px pane; in the column it covers the list's side and leaves the map whole; in switch mode the map narrows beside it rather than sitting under it. Closing it returns to the map with the callout still open.
- **Header**: the 44px type tile (a link's own picture where the list draws one), the row's title at 19px semibold, *kind · thread* under it, and a close reaching a 44px target.
- **Rows**, each at least 46px tall, only those present, with no chevrons: **When** (an event's time); **Address** (an event's location or a calendar event's location, prefixed *Approximate,* for an approximate place, so *Approximate, Alfama*; a saved place has no Address row, since its title is its name, except *Approximate* alone when it is one); **Link** (the link's domain); **Labels** (dots and names); **Added by** (in a shared thread, the member who put it down; *You* for one's own). Every value is plain text, never a link or markup, whoever wrote it.
- **Footer**: two equal pills at least 48px tall, 10px apart. **Directions** filled (`--surface-inverse`, `compass` in `--text-inverse`). Then **Open link** (`arrow-up-right`) for a link, opening it as a link row does, or **Edit** (`pencil`) otherwise, which closes the place sheet and opens what tapping the row opens: one's own row's edit sheet, someone else's row's action sheet. On Android the pills are at least 40px and the second is outlined in `--border-strong`.
- **A connected calendar's event** has no Edit and no Added by: its footer is Directions alone, full width, and *kind · thread* reads the calendar's name in place of the kind.

### 8. Framing and filtering

- **The map opens fitted to every point**, with 28px padding at the sides, 70px at the top (190px or 40% of the height, whichever is less, when a callout is open) and 40px at the bottom above whatever covers the map's foot. **The opening fit never comes closer than zoom 15**, so one point opens at street level; the map itself zooms further.
- **The label pick filters points and rows together.** A pick that leaves no points keeps the thread's whole area in frame and shows *Nothing under Food on the map.* on a raised pill at the foot, naming the label. Clearing the pick brings the points back. Calendar events are hidden under any pick (025).
- The map does not re-fit when a point arrives while it is open; it fits again on the next visit.
- **A point that lost its coordinates** (past thirty days) is fetched again when the map opens and drawn when it arrives, without a re-fit.
- **The dark theme**: the map takes Google's dark scheme, the ring stays `--paper` (which is the dark page), the unlabelled point and the count dot stay `--text-primary` (light on dark), and the floating chips and the switch's picked half take `--border-lift` since dark has no drop shadow. The points' own shadows sit over the map rather than a surface and keep their values in both themes. On the phones the map changes scheme in place, iOS by its own dark scheme and Android by Google's night style; the two are close, not identical, and that is accepted. **On the web a map's scheme is fixed when it is made**, so changing the theme in Settings makes a new map once; *Follow the system* is passed to the map as such, and follows without one.
- **Reduced motion**, read from one place on each client: the switch between List and Map, the place sheet and the callout are cuts, the hover scale does not animate, and every camera move jumps.

### 9. The map itself

- **Google's map on all three surfaces**: the Maps SDKs on iOS and Android, the Maps JavaScript API on the web. Points, circles, the count dot, the callout and the chips are offload's own views over it.
- **Attribution is Google's**: its logo and legal line where its map draws them, never covered, moved off-screen or hidden, with the composer, the keyboard or the place sheet up.
- **Where the points come from.** The thread's list is read a page at a time, so the map reads its points separately, once per visit and again after a change to the thread: every live row with a point, and every picked calendar event in its window with one, each with what the point, callout and place sheet draw. A thread holds a few dozen points in the heavy case; the read stops at five hundred, content first, then events nearest in time, and nothing says so on the map past that.
- **One map per visit, never per change.** A filter, a resize, crossing the column width, or switching List and Map and back within one visit never creates a new map; a theme change on the phones never does either. A new thread visit creates one. Google bills a web map per map made, past ten thousand a month, and does not bill the phones' maps at all, as long as they carry no cloud map id, which they do not.
- **Keys.** One per surface, each restricted to its app or site and to the APIs it needs: the web's to offload's own domains and the Maps JavaScript API, iOS's to its bundle id, Android's to its package and signing certificates, the server's to the Places and Geocoding APIs (the latter for 020's photo town, still off). Each API has a daily quota just above expected use, since a budget alerts but does not stop spending. **The phones' keys are in the app build**, as Google's SDKs require, and a new one means a new build; **a build made without its key draws no map at all**, rather than falling back to another company's; and the server can switch the map off everywhere at once.

**States.**
- **Loading**: the map's own ground, `--surface-page`, then the map; points draw as soon as the map can place them. No spinner.
- **The map or its points cannot load**: the map area says *Couldn't load the map* with Try again. The list, the switch and the composer are untouched, and List is one tap away. On the web and Android the map reports a failed load; iOS's does not, and an offline iOS map shows its blank ground with List one tap away, which is accepted.
- **The points arrive empty** though the bundle said there was one (the last went between the two reads): the thread returns to List and the switch goes.
- **The map is switched off** (by the server, or a phone build without the map): no switch and no column anywhere, and the thread is the list as today. An installed build without the map never receives code that needs it.

### 10. The Places section is retired

The *Places* heading and its block go from the thread's list on every surface, with the web's placeholder map surface, and from the label list on the phones. Located things stay in **Everything in here** like anything else; the web's row meta line, which drew a place's address under its title, draws an event's own location instead, as the phones already draw none for a place. The widget preference stops knowing `map`: a thread whose stored widget order names it is read without it and is never written back, and offload's own thread preference tool no longer offers it.

Nothing is lost while the map ships switched off: no place has ever resolved in production, so no thread there has ever drawn the section.

### 11. Existing rows

Production holds one account today, the product owner's, so this is a one-off for a small set, not a crawler. Once the lookup is switched on, one pass, marked per row so a re-run never repeats:

- **Every remembered miss is forgotten**, since each was recorded with no key set, and **every saved place with no point is looked up**.
- **Every link a person pasted themselves**, when their *Read links I paste* is on at the time of the pass, has its page asked **once more** for its metadata, as filing would have. Only links the person is the author of, never one another member put in a thread they share, and only links whose address appears in the words of the message they came from, so nothing the model chose is opened. The same bounded request as filing, one at a time, no retry: a page that does not answer, or gives nothing, leaves the link as it is. The page sees our server again, long after the paste, and the privacy page says so.

Events filed before this feature have no location to look up and stay as they are. Connected calendar events are looked up on their next sync.

### 12. What changes in public

Google Maps Platform becomes a company that receives content and acts for itself, and devices load the map from it. **The privacy policy changes in the same change that switches the map on, and account holders are told first**, as the page promises, by the consent version moving so every account sees the updated page. What the page will say:

- **The summary**: *We do not train AI on what you upload* keeps its words and gains that one company in section 6, Google Maps Platform, may use what it receives to improve its own products, and what it receives.
- **Section 3, *What we hold***: for a place, offload keeps Google's id for it indefinitely and its coordinates for up to thirty days, and asks Google again when a map shows it after that. **Section 3's *Which calendars offload reads*** and **section 11's** repetition of it change *as a title and a time* to *as a title, a time and where it is*; section 3 also gains that where a calendar event is gets looked up as section 5 says, and that what offload remembers of the lookup goes with the copy.
- **Section 4**: a row for what offload sends Google to put places on a map, on the basis of providing the service you asked for.
- **Section 5's no-training sentence** gains its one exception by name: every company in section 6 publishes terms ruling out training on what we send, **except Google Maps Platform**, which does not. **Section 5's *Looking things up*** gains: a place you save, the venue of an event offload files for you, a place name on a page you pasted (when *Read links I paste* is on) and the location of an event in a calendar a thread picks go to Google as a search, alone, to put them on the map, **after a filter that refuses anything with a number in it, an email or web address, a possessive, or a street word, which is what a street address, a phone number and a person's place usually look like**; and *Directions* opens Google Maps with the destination, which Google receives. **The *both off* bullet is reworded**: with both switches off nothing you dump is searched for on the web and no page is read, and a place still goes to Google to be put on the map, because that is what keeping a place is for. Place lookup gets no switch of its own; for a calendar, the control is the pick. **Section 5's link bullets**: a link's page is also read for a location when *Read links I paste* is on; and *once* gains its exception, that a link kept before the map existed has its page read one more time when the map arrives, and never again.
- **Section 6 gains a row of its own**, separate from Google's sign-in and calendar rows: Google Maps Platform, *draws the map in a thread and turns the name of a place into a point on it*; receives *the name of a place being looked up, alone, with nothing about who asked; and, from your device whenever a map is on screen, your IP address, the area being drawn and, on the phones, the device details Google's map collects; if you are signed in to Google there, it may recognise you. In a thread you share, that applies to each person who opens its map. Google decides for itself how it uses this, under its own terms, and those say it may keep it and use it to improve its products.* **The sentence under the table**, that each company acts only to provide its service to us and never for itself, gains *except Google Maps Platform, as its row says*.
- **Section 9**: transfers to Google Maps Platform are not under the terms offload holds with the companies that act for it; Google receives as a controller under its own.
- **Section 10**: a place's id and coordinates are not tied to an account and are not deleted with one; coordinates go after thirty days whatever happens, and a place nothing points at is deleted.
- **The *Read links I paste* note** in Settings, on all three surfaces: *Opens a link you dumped and reads the page. Where it names a place, the name goes to Google to put it on the map.*
- **The calendar pick sheet** says that everyone in a shared thread sees a picked calendar's events, with where they are.
- **The App Store privacy details and the Play data safety form** gain what Google's map SDK collects on the phones.

**Switching on is gated on the page, not on Google's terms.** Google's terms are captured into `docs/tech/vendor-terms/google-maps/` with their date (T0.3), as every vendor's are, and the owner accepted them as they stand, including the reading in section 2. **The build ships switched off**, and everything this section describes turns on together, in one change: the keys, the page, a calendar's location crossing to members, and the reading of a page for a location.

### 13. Recorded

- `docs/tech/decisions.md`: a superseding entry for the map's provider, the tiles and the lookup, recording the vendor bar's waiver and why; the owner's reading of Google's personal-data term (section 2); the calendar location crossing; what is stored and for how long under Google's terms; the filter; the peppered query cache, the expiring miss and the on-demand refresh.
- `.claude/skills/offload-design/decisions.md`: *2026-10-02 · A thread's map, as built (030)*, with the divergences listed under **Amends** and a **Design system impact** naming the readme's lines on the stack and attribution, Open, the 1200px column and the circle's size, the `SegmentedControl` and `AppBar` contracts, the three tokens, the count dot, and `explorations/maps.html`'s Open handler, as what catches up. **The contract changes and the tokens land on `main` before the clients that use them are built.**
- New tokens, both themes, the same value in each since they sit over the map: `--shadow-point`, `--shadow-point-picked` and `--shadow-callout`.

## Acceptance criteria

**What has a point**

- **AC-1.** A `location` row, a link with a location read from its page, an event with a location and a picked calendar's event in its window each have a point once their place has current coordinates; any other row, a photo, a note, or a row whose place has none has none.
- **AC-2.** Filing a link while the dumper's *Read links I paste* is off reads no location; while it is on, a page whose first 256KB carries coordinates gives the link a point with no call to Google; a page carrying a place name books a lookup; a page carrying only a street address gives nothing. The point is visible to every member. Verified against captured real pages, at least a listing, a restaurant and a hotel, as well as fixtures.
- **AC-3.** A result whose kind is an area stores an approximate place; the client draws a 300m-radius circle and the place sheet's Address reads *Approximate,* then offload's own text.
- **AC-4.** The model's tools carry no field for a link's location or coordinates; a listed row carries whether it is on the map and nothing else of its place; no tool result or prompt block carries a place, address or coordinate.
- **AC-5.** (Eval-verified, by a run the owner approves before switch-on.) Filing "dinner at Time Out Market on Friday at 8" files one event whose location is *Time Out Market*; "dinner at Ana's on Friday" and an event whose dump names no venue file none. The edit tool sets and clears an event's location. A location over 120 characters, spanning lines, or one the filter refuses is refused at the tool and never sent; a saved place's name the filter refuses is kept, with no point.
- **AC-6.** A picked calendar's event location is looked up after sync and on a first pick, for events from yesterday to sixty days ahead, at most two hundred a calendar per sync, through the same filter; its text never enters the query cache or any other table but the event's own. In a shared thread every member sees the event's point and location, including from picks made before the feature; no member sees its guests or description; `find_events` still carries a title and a time only.
- **AC-7.** No lookup runs inside a turn; Google receives only a query that passed the filter, with no identifying header; a country or region result is a miss; Google's name, address and categories are stored nowhere; no log line, job payload, request log, event or trace from the lookup, the backfill, the internal route or the map carries a query, URL, domain, address, coordinate, viewport or thread title.
- **AC-8.** With the lookup off (no key, `MAPS` not on, or no pepper), it is skipped and no miss is remembered; a remembered miss is looked up again after thirty days; the query cache's key is peppered.
- **AC-9.** Clearing a link's point, clearing or changing an event's location, and renaming a saved place each update the point, only for the row's author, and the turn's Undo puts the previous place back; a cleared link point is not read again; what Undo needed is gone once it can no longer be used.
- **AC-10.** Coordinates from Google are never more than thirty days old: past that they and the area mark are deleted whatever happens, a place on an opened map that lost them is fetched again then, and a place nothing points at is deleted; Google's place id is kept while something does.

**The switch and the column**

- **AC-11.** A thread with no point draws no switch and no column on any surface; the bundle says whether it has one.
- **AC-12.** Saving a place, a link with a location or an event with a location adds the switch once the place resolves, on the next read of the thread; losing the last point removes it and a thread on Map returns to List.
- **AC-13.** On the phones and a narrow web pane, Map replaces the body with the map, moves the thread's name into the bar, floats the label chips over it with no counts, and keeps the composer. While the switch is drawn the phones' bar is back, title, switch, share, More, with labels and calendars first in More. Back from Map returns to List on Android. Returning to Map in one visit keeps the camera. The choice survives leaving and reopening the thread on that device. A hidden map is out of sight, touch, assistive tech and tab order.
- **AC-14.** On the web, a top thread pane at least 1000px wide draws the list without its width cap and a 460px map column with no switch, no chips of its own and the composer held to the list; a narrower pane, including one beside a second pane, draws the switch; a pane behind draws neither. Crossing the width keeps the pick and does not create a new map.

**Drawing**

- **AC-15.** A point's fill is its first label's colour in the bundle's order; two labels split it; three or more draw the first two; none is `--text-primary`; an event is a rounded square; a calendar event is an ink square hidden under any label pick; a picked point is 24px.
- **AC-16.** Overlapping points draw as a count dot; tapping it zooms to separate them, beyond zoom 15 if needed. (The clustering, split and fit functions are unit-tested; the gesture is checked on a device.)
- **AC-17.** Picking a point or tapping inside a circle opens its callout with its title, kind, labels, Directions and Open, each action pressable on its own on every surface; a tap that hits nothing closes it, tapping another point moves it, and the callout is kept inside the frame.
- **AC-18.** On the wide web, hovering a row scales its point to 1.35 and picking a point gives its loaded row `--surface-fill`.
- **AC-19.** The map opens fitted to every point, the fit never closer than zoom 15; a label pick filters points and rows together, and a pick with no points keeps the thread's area and shows *Nothing under <label> on the map.*
- **AC-20.** Google's logo and legal line are visible on every map, in both themes, with the composer present, with the keyboard up and with the place sheet open.
- **AC-21.** The map follows the theme: on the phones in place, without a new map; on the web, a Settings theme change makes one new map, *Follow the system* is passed to the map, and a device switching scheme under it makes none. Under reduced motion no camera move animates.
- **AC-22.** On the phones, the keyboard rising over Map neither resizes nor re-fits the map and closes an open callout; a point that arrives while the map is open is drawn without re-fitting. (Checked on both devices.)
- **AC-23.** Every point, the count dot, the callout and its actions have accessible names as section 5 gives them, and the web reaches the points by keyboard.

**Directions and Open**

- **AC-24.** Directions opens Google Maps' directions link with only the destination's coordinates and place id, on every surface: the app or the browser on the phones, a new tab with no referrer on the web. No surface hands a place to another maps app.
- **AC-25.** Open shows the place sheet with the header, only the rows present, all in offload's own text and as plain text, and its footer: Directions and Open link for a link, Directions and Edit otherwise, Directions alone for a calendar's event. Edit closes the place sheet and opens what tapping the row opens. Tapping a row in the list never opens the place sheet.

**Retired, existing and switched off**

- **AC-26.** No surface draws a *Places* section or the web's placeholder map; the web's row meta draws no Google address; a stored widget preference naming `map` reads without it and is not rewritten; the preference tool refuses `map`.
- **AC-27.** The pass in section 11 forgets every remembered miss, books one lookup per saved place with no point, and reads each link once, for its author only when the author's switch is on and only when its address is in the words of the message it came from, never a link another member authored; it reads one page at a time, does not retry, and re-running it touches nothing it marked.
- **AC-28.** With the map switched off by the server, or on a phone build made without its key, no switch, column or map is drawn on that client and no map is mounted, and nothing else in the thread changes; a build without the map never receives an update that imports it.
- **AC-29.** A map or a points read that fails says *Couldn't load the map* with Try again where the platform reports it, and List stays reachable everywhere.
- **AC-30.** Neither client creates a new map on a filter change, a resize, a crossing of the column width, or a List and Map round trip within one visit; the phones do not on a theme change either; no phone map carries a cloud map id.
- **AC-31.** The points read returns every live row with a point and every in-window picked calendar event with one, scoped to a member of the thread, content first, stopping at five hundred.

**In public**

- **AC-32.** In the change that sets the keys: the privacy policy carries section 12's changes to the summary and sections 3, 4, 5, 6, 9, 10 and 11, including Google Maps Platform's row and its named exceptions; the consent version moves; the *Read links I paste* note and the pick sheet carry their new copy on every surface; the store privacy forms are updated; and `docs/tech/vendor-terms/google-maps/` holds the terms as read, dated.
- **AC-33.** The photo town's gate still needs both its variables, and the map's keys alone do not open it.

## Out of scope

- Editing an event's location or a place's address by hand in a sheet, and a control on the place sheet to clear a point. A person says so in the composer.
- A map anywhere but a thread: Today, My threads, Not in a thread, search results.
- The person's own location, *near me*, or distances.
- Photos and notes on the map.
- Searching the map, drawing routes, or saving a place by tapping the map.
- Points from a street address with no coordinates, which would need a lookup the filter forbids.
- Saying on the map that a thread has more than five hundred points.
- Offline maps.
- Redrawing the kits for the map, which the design system owns, and 028's `LooseParts.jsx` follow-ups.
- Moving a photo's town (020) off its current gate.
