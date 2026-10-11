# App Store listing, draft for 0.2.0 (build 16)

Drafted 2026-10-08 for the owner to verify. Nothing here has been entered in App Store Connect. Every count is characters, spaces and punctuation included, measured with a script. Text inside code blocks is what gets pasted.

Sources read: `CLAUDE.md`, `apps/web/src/components/LandingStory.tsx`, `apps/web/src/app/(marketing)/privacy/page.tsx` (updated 7 October 2026), `privacy/companies/page.tsx` (7 October 2026), `terms/page.tsx`, `docs/tech/going-public.md` items 21 and 22, `docs/specs/039-reviewer-codes/`, the feature specs named below, `apps/mobile/app.json`, `apps/mobile/package.json` and the phones' code. Apple's pages: *Age ratings values and definitions*, *Set an app age rating*, *Unlisted app distribution* (developer.apple.com, read 2026-10-08).

---

## 1. App information

| Field | Value | Count |
| --- | --- | --- |
| Name | `offload: notes, sorted` | 22 of 30 |
| Subtitle | `Send it. offload files it.` | 26 of 30 |
| Subtitle, alternative | `Dump it in. It gets filed.` | 26 of 30 |
| Primary category | Productivity | |
| Secondary category | None | |
| Privacy policy URL | https://offload.club/privacy | |
| Bundle id | `club.offload.app` (from `app.json`) | |

The subtitle is the landing page's first heading, word for word. The alternative avoids repeating the brand next to the name.

### Content rights

**Does your app contain, show, or access third-party content?** Yes.

- **Link previews.** When a person pastes a link, offload's server reads the page, and the phone may load the page's preview picture straight from the site (privacy page section 5, *Looking things up*; companies page, last paragraph).
- **Web search.** When offload needs a fact it does not hold, it searches the web and answers in its own words with the addresses of the pages it read (privacy page sections 3 and 5). It can be turned off in Settings, Privacy (*Search the web*, *Read links I paste*).
- **Google Maps** draws maps and finds places by name, under Google's terms (030; companies page).
- **Google Calendar** events, only from a calendar the person connects, which is their own (section 7).

**Do you have all the necessary rights?** Suggested answer: Yes. The third-party content is a page the person pointed offload at, shown as a short preview with its address, or a Google service used under Google's terms. offload hosts no catalogue of other people's works. Owner to confirm (open question 6).

### Age rating questionnaire

Apple's questionnaire as of 2026 (*Set an app age rating*): in-app controls, then capabilities, then five content sections answered None, Infrequent or Frequent, then Yes or No items, then Additional information with the calculated rating and the override.

**Step 1: In-app controls**

| Question | Answer | Why |
| --- | --- | --- |
| Parental controls | No | None in the app. |
| Age assurance | No | No age check. First run asks consent to processing (`BeforeYouStart.tsx`, `ConsentTicks.tsx`), not age. The 18+ rule is in the terms and section 19 of the policy. |

**Step 2: Capabilities**

| Question | Answer | Why |
| --- | --- | --- |
| Unrestricted web access | No | No browser in the app. A link a person taps opens in Safari, outside offload (`apps/mobile/lib/links.ts`, `Linking.openURL`, http and https only). The in-app sheet (`expo-web-browser`) opens only offload's own pages: terms, privacy, the mail contact card. offload reading a link or searching happens on the server and comes back as a short answer, not a page to browse. |
| User-generated content | No, suggested | Apple's definition is *broad distribution* of content created by users. offload has no public links, no feed and no discovery: a thread is shared only with a connection, someone both people agreed to connect with (policy section 8; 022). Owner's call, see open question 7. |
| Social media | No | No feed, likes, follows or amplification. |
| Social media disabled for users under 13 | No | Not applicable. |
| Messaging and chat | Yes | Members of a shared thread add to it and see each other's additions with names and marks (section 8). That is group communication between people, so the honest answer is yes. It does not raise the rating (4+ in Apple's table). |
| Advertising | No | No ads (policy summary and section 16). |

**Step 3: Mature themes**

| Question | Answer |
| --- | --- |
| Profanity or crude humor | None |
| Horror/fear themes | None |
| Alcohol, tobacco, or drug use or references | None |

**Step 4: Medical or wellness**

| Question | Answer | Why |
| --- | --- | --- |
| Medical or treatment information | None | offload does not provide medical content. It answers from what a person put in and can look up a fact; it is not a health app (policy section 15). |
| Health or wellness topics | None | Same. |

**Step 5: Sexuality or nudity**

| Question | Answer |
| --- | --- |
| Mature or suggestive themes | None |
| Sexual content or nudity | None |
| Graphic sexual content and nudity | None |

**Step 6: Violence**

| Question | Answer |
| --- | --- |
| Cartoon or fantasy violence | None |
| Realistic violence | None |
| Prolonged graphic or sadistic realistic violence | None |
| Guns or other weapons | None |

**Step 7: Chance-based activities**

| Question | Answer |
| --- | --- |
| Simulated gambling | None |
| Contests | None |
| Gambling | No |
| Loot boxes | No |

**Step 8: Additional information**

- **Calculated rating:** 4+ (messaging and chat sits at 4+ in Apple's table; nothing else is declared).
- **Age categories and override:** **Override to higher age rating, 18+.** Apple's page says that when the EULA's minimum age is above the calculated rating, *you must override to a rating that adheres to the requirements*. The terms say *offload is invite only, for people aged 18 and over* (`terms/page.tsx` line 58) and the policy says the same (sections 1 and 19).
- **Made for Kids:** Not applicable.
- **Age suitability URL (optional):** https://offload.club/terms

**Resulting rating: 18+** (displayed), with the content descriptions reflecting the answers above.

---

## 2. Version page

### Promotional text (162 of 170)

```
Put down what is on your mind: a note, a link, a photo, a voice note. offload reads it and files it into a thread for each trip, plan or job. Invite only for now.
```

### Description (1774 of 4000)

Each claim checked against a built spec and the phones' code: the dump and composer (003, 009), share extension for photos and PDFs (`app.json` `iosActivationRules`), voice notes (021), photos (020), PDFs (041), mail in (026), threads and extraction (005, 006), timeline and map (015, 030), moving a row (028), Today (027, amended 2026-10-07), notifications (024, *Due today*), answering and web lookups (013, 016), calendars (012, 019), sharing (022), Memories (038, 040), export and deletion (035).

```
offload is a place to put down what is on your mind: notes, links, photos and voice notes. It reads each one and files it into a thread, one for each trip, plan or job you are keeping track of. You never choose where something goes before you put it down.

Send it as is
Type it, say it, snap it, or forward it. A note, a link, a screenshot, a photo, a PDF or a voice note all go in the same way. Share a photo or a PDF from another app, or forward an email to offload.

Everything lands in threads
What belongs together gathers in one thread. Dates, places and to-dos are pulled out as they arrive, so a thread shows what is coming up, where it is on a map and what is left to do. If something lands in the wrong thread, move it.

Today
What to expect and what to do, across every thread: what is next, where you will be, and anything that needs you. Turn on notifications to see each morning what is due.

Ask it
Ask about anything you put in and offload answers from your threads. When it needs a fact it does not hold, it can look it up on the web. You can turn that off in Settings.

Works with your Google Calendar
Connect your Google Calendar and offload can show what is on it and add or change events when you ask. You choose which calendars it may use.

Share a thread
Share a thread with someone you are connected to, and plan it together. There are no public links.

Memories
offload remembers what it learns about you across your threads, such as the people in your life and their birthdays. See, change or forget any of it in Memories.

Yours to keep
No ads. offload does not sell what you put in or use it to train models. Export everything or delete your account in Settings.

Invite only
offload is in an invite only alpha, for adults in the United States.
```

Notes on the wording:
- *does not sell what you put in or use it to train models* is offload's own act, which the policy states without exception (summary, sections 5 and 16). It does not claim the same of every company, because the policy names Google Maps Platform as the exception.
- *forward an email to offload*: the address is in Settings, Connected apps, and on first run.
- No "folder", "item", "capture" or "thing". "Note" appears only as what a person writes.

### Keywords (100 of 100)

```
ai,assistant,organizer,brain dump,voice memo,reminder,calendar,trip,planner,screenshot,pdf,link,todo
```

No word from the name (offload, notes, sorted) or the category. Singular forms, since Apple matches plurals. "Google" is left out as a trademark. If the owner wants one swapped: `shared`, `list`, `photo` and `memory` are the next candidates.

### URLs

| Field | Value |
| --- | --- |
| Support URL | https://offload.club (the footer carries hello@offload.club, `Screen.tsx` line 67; there is no help page) |
| Marketing URL | https://offload.club |

### What's new in 0.2.0 (129)

Apple does not show this field for an app's first version on the store, so it may not appear. If it does:

```
What's new: first App Store version. Put down a note, a link, a photo, a PDF or a voice note, and offload files it into a thread.
```

### Copyright

```
2026 Behrooz Afghahi
```

Apple's format is year then holder, without the symbol. The policy names him as running offload, not incorporated (section 1; going-public item 23).

---

## 3. App Review information

| Field | Value |
| --- | --- |
| Sign-in required | Yes |
| User name / password | Leave empty: there is no password. The code goes in the notes. |
| Contact first name | Behrooz |
| Contact last name | Afghahi |
| Phone | `[OWNER]` |
| Email | hello@offload.club |

### Review notes

Make the code first (going-public item 21): admin panel, Waitlist, *New code*, note *App Store review 0.2.0*, 5 uses, 30 days. It is shown once. Paste it over `[CODE]`.

```
This app is intended for unlisted distribution. offload is an invite only alpha for adults in the United States, and people get the App Store link from us.

Signing in
offload has no passwords. Sign-in is with Apple or Google, and only invited addresses get in. To let you in we made a review code.
1. Open offload and tap "Have a code?" under the waitlist line on the sign-in screen.
2. Enter this code: [CODE]
3. Continue with Apple or with Google, using any account of your own. Hide My Email works.
4. First run asks you to agree to the terms and to offload processing what you put in, then offers a few optional steps. Each can be skipped.
The code works for 5 sign-ins and 30 days.

Things to try
- Type or say anything in the composer, for example "Flights to Lisbon on 14 October, 214 dollars". offload files it into a thread and pulls out the date.
- Attach a photo, a screenshot or a PDF, or record a voice note from the microphone.
- Today, the first tab, shows what is next across every thread.
- Ask a question about something you added, and offload answers from your threads.
- Memories, the third tab, shows what offload has learned about you. Each one can be changed or forgotten.

Where things are
- Settings is the gear in the app bar.
- Delete account: Settings, My account, Delete account.
- Export everything: Settings, Privacy, Your copy.
- Turn web search and link reading off: Settings, Privacy.
- Block a person: on their page from Settings, My people. Blocked people are listed there too.

Sharing
A thread can be shared only with a connection, a person both sides agreed to connect with by exact email address. There are no public links, feeds or search for people.

AI
Sorting, answering, reading photos and PDFs and transcribing voice notes use AI models from other companies, as our privacy policy describes at https://offload.club/privacy. offload does not use what you put in to train models.

Google Calendar is optional. Google is still verifying our calendar access, so connecting a calendar may show Google's "Google hasn't verified this app" screen until that review completes.

Questions: hello@offload.club
```

Check before pasting: the Google line is true only while going-public item 1 is under review. Drop it once Google has answered.

---

## 4. App Privacy (nutrition labels)

**Do you or your third-party partners collect data from this app?** Yes.
**Is any data used to track?** No. Policy section 18: *We do not track you across other sites*; summary: never sold or used for advertising. `NSPrivacyTracking` is false in the app's manifest and in both SDK manifests below. Since PR 98 the app's own manifest (`expo.ios.privacyManifests` in `apps/mobile/app.json`) declares every row marked collected below, with the same linked and purposes, and `apps/mobile/test/privacy-manifest.test.ts` holds the two together.

Apple counts data collected by third-party SDKs in the app. Two SDKs declare data in their own privacy manifests, read from `node_modules/react-native-maps/ios/`:
- **Google Maps SDK** (`AirGoogleMaps/Resources/GoogleMapsPrivacy.bundle/PrivacyInfo.xcprivacy`, shipped because the phones use `PROVIDER_GOOGLE`, `components/map/ThreadMap.tsx`): Crash data, Performance data, Product interaction and Device ID, not linked, Analytics (Device ID also App functionality); User ID, linked, Analytics. None for tracking.
- **react-native-maps** (`ios/PrivacyInfo.xcprivacy`): Precise location, not linked, App functionality. This is for showing the user's own position on a map, which offload never does: no location permission string in `app.json`, no `showsUserLocation` anywhere. It will appear in Xcode's privacy report; it does not apply.

Purposes, in Apple's words: App functionality, Analytics, Product personalization, Developer's advertising or marketing, Third-party advertising, Other purposes. Only the first two are used below.

| Apple data type | Collected | Linked | Tracking | Purposes | Basis |
| --- | --- | --- | --- | --- | --- |
| **Contact info: Name** | Yes | Yes | No | App functionality | Section 3: *Your email address and name, from Apple or Google when you sign in.* Shown to thread members (section 8). |
| **Contact info: Email address** | Yes | Yes | No | App functionality | Section 3, as above, and the waitlist address (`app/waitlist.tsx`). Used to sign in, to find a connection by exact address (022) and to email about the account (section 4). Not marketing. |
| Contact info: Phone number | No | | | | Not asked for. |
| Contact info: Physical address | No | | | | Not asked for. An address typed into a note is Other user content. |
| Contact info: Other user contact info | No | | | | |
| Health and fitness: Health | No, suggested | | | | offload does not ask for it (section 15). A person can put it in, which is covered by Other user content. Open question 8. |
| Health and fitness: Fitness | No | | | | |
| Financial info: Payment, Credit, Other | No | | | | Free, no payments. Section 3 advises against card numbers. |
| **Location: Precise location** | Yes | Yes | No | App functionality | Section 3: *Photos can carry details the camera wrote into them, such as when and where they were taken; we keep those with the photo.* `apps/agent/src/offload_agent/renditions.py` reads the GPS tags and the coordinate is stored on the blob (`places/reverse.ts`). The device's own location is never asked for (section 3). |
| **Location: Coarse location** | Yes, suggested | Yes | No | App functionality | The country set in Settings (section 3), sent with a web search (section 5). Owner may judge a self-chosen country is not location; declaring it costs nothing. |
| Sensitive info | No, suggested | | | | Not asked for. Memories are told to keep sensitive categories only when asked (section 3). Open question 8. |
| **Contacts** | Yes, suggested | Yes | No | App functionality | No address book access. But Apple's definition includes a *social graph*: connections and blocks (section 8), and Memories hold *the names of people in your life, how they relate to you and their birthdays* (section 3). |
| **User content: Emails or text messages** | Yes | Yes | No | App functionality | Section 3: forwarded email, *its text, its pictures and its PDFs, its subject, who sent it and when*; and what members write to each other in a shared thread (section 8). |
| **User content: Photos or videos** | Yes | Yes | No | App functionality | Section 3: photos, screenshots. No video. |
| **User content: Audio data** | Yes | Yes | No | App functionality | Section 3: voice notes; companies page: AssemblyAI receives *the audio of a voice note*. |
| User content: Gameplay content | No | | | | |
| User content: Customer support | No | | | | Support is email to hello@offload.club, outside the app. |
| **User content: Other user content** | Yes | Yes | No | App functionality | Section 3: notes, links, PDFs, what you type to offload, thread notes, labels, memories, offload's replies. |
| Browsing history | No | | | | No browser in the app. A pasted link is user content. |
| Search history | No | | | | No search field on the phones. A question to offload is a message (Other user content). Web search queries are not kept: `schema.ts` *LookupsTable*, *No query and no URL*; place lookups keep a hash (`PlaceLookupsTable`). |
| **Identifiers: User ID** | Yes | Yes | No | App functionality, Analytics | The account id. Analytics because the Google Maps SDK declares User ID, linked, for analytics. |
| **Identifiers: Device ID** | Yes | Yes | No | App functionality, Analytics | Section 3: *If you turn notifications on, a token that identifies your phone* (`lib/notifications.ts`, `getExpoPushTokenAsync`). The Google Maps SDK also declares a device id, not linked, for analytics. |
| Purchases | No | | | | |
| **Usage data: Product interaction** | Yes | Yes | No | Analytics | Section 3 (since PR 98): *Product events, such as finishing first run, under a random identifier that only we can link back to you, until you delete your account.* `apps/core-api/src/analytics.ts`: server-emitted events under `accounts.analytics_subject_id`, removed with the account row. Linked by Apple's test. Google Maps SDK adds product interaction, not linked. |
| Usage data: Advertising data | No | | | | |
| Usage data: Other usage data | No | | | | Request records are under Other diagnostic data. |
| **Diagnostics: Crash data** | Yes | No | No | Analytics | offload has no crash reporter (`apps/mobile/lib/log.ts`). Declared only for the Google Maps SDK; the companies page and section 6 name crash and performance reports since PR 98. |
| **Diagnostics: Performance data** | Yes | No | No | Analytics | Google Maps SDK only, as above. |
| **Diagnostics: Other diagnostic data** | Yes | Yes | No | App functionality, Analytics | Section 3: *Records of what each request did, how long it took and what it cost, including each call to an AI model.* Removed from them when the account is deleted (section 13), so linked while it exists. |
| Surroundings: Environment scanning | No | | | | |
| Body: Hands, Head | No | | | | |
| **Other data** | Yes | Yes | No | App functionality | Section 3: *Your IP address and a description of your device and browser, kept with your sign-in sessions* (security), and the device's time zone. |

### Where the policy and the label would disagree

Resolved by PR 98 (policy and companies page dated 8 October 2026, `CONSENT_VERSION` 2026-10-08, so every account is asked to agree again):
- The companies page and section 6 now say the device sends Google Maps Platform, while a map is on screen, *your IP address, device details, an identifier, how the map is used, and on the phones crash and performance reports*, which covers the SDK manifest's crash, performance, product interaction, device id and user id.
- Section 3 now says product events carry *a random identifier that only we can link back to you, until you delete your account*, matching linked on the label.
- The app's own privacy manifest declares the 16 collected types in the table, and keeps the three required-reason APIs prebuild writes (FileTimestamp C617.1, UserDefaults CA92.1, SystemBootTime 35F9.1). It ships in the next build; read the manifest from that build's archive (Xcode privacy report) before submitting.

Still open:

1. **Precise location next to *We do not ask your device for its location*.** Both are true, the location comes from photo metadata, but it is worth a reader-level check. Separately, `PHOTO_TOWNS` must be off in production: if it is on, a rounded coordinate goes to Google Geocoding, and the companies page's *A place's name, on its own* would be untrue (`decisions.md`, reverse geocoding entry).

---

## 5. Pricing and availability

| Field | Value |
| --- | --- |
| Price | Free (USD 0.00) |
| Availability | United States only. Every other storefront off. Policy section 1 and the terms: *only offered in the United States*; going-public item 22. |
| Distribution method | Public (owner, 2026-10-08). No unlisted request. |
| Release | **Manually release this version.** If the build is approved before the unlisted request is, an automatic release would put offload in search. |
| iPad | Not offered (`supportsTablet: false`) |
| Apple silicon Mac, Vision Pro | Turn off unless the owner wants them; the app was never checked on either. |
| EU trader status | Not needed for a US-only app. If App Store Connect asks anyway, the owner decides. |

---

## 6. Unlisted distribution request

**Dropped 2026-10-08 (owner):** offload is listed publicly in the US; the waitlist is the gate. Kept below for reference only.

Apple's form is at developer.apple.com/contact/request/unlisted-app and needs an Apple Developer sign-in, so its exact fields could not be read. The fields below are the ones the form is known to ask; match them to what it shows. Apple's conditions (from the support page): the app must be submitted to App Review or already on the store, not in beta, and the review notes must say it is intended for unlisted distribution, which section 3 does.

| Field | Draft answer |
| --- | --- |
| App name | offload: notes, sorted |
| Apple ID (app) | From App Store Connect, App Information, `[OWNER]` |
| Developer name | Behrooz Afghahi |
| Contact email | hello@offload.club |
| Is the app on the App Store or submitted for review? | Submitted, version 0.2.0 build 16, with *Manually release* set. |
| Describe your app | offload is a personal assistant for keeping track of things: people put down notes, links, photos, PDFs and voice notes, and it files them into threads for each trip, plan or job, which they can share with people they know. |
| Why unlisted? | offload is an invite only alpha. Only addresses we have invited can sign in, so a public listing would show the app to people who cannot use it. We want the people we invite to install it from the App Store rather than TestFlight, and to keep it out of search until it opens to everyone. |
| Intended audience | Adults in the United States whom we have invited personally, currently friends and people from our waitlist. Tens of people now, a few hundred during the alpha. |
| How will people get the link? | From us directly, by email or message, at the moment we invite them. The link is not published on our website or anywhere public. |
| Access control | Sign-in with Apple or Google, and only invited email addresses get in. Everyone else sees a waitlist. |

Risk: Apple lists partner tools, employee resources and research studies as good candidates and says unlisted is for apps *not suited for public distribution*. A consumer app on its way to a public launch may be declined. Fallback in open question 9.

---

## 7. Screenshots

Required set: 6.9-inch iPhone (1320 by 2868, portrait). Smaller sizes scale from it. No iPad set, since iPad is off.

Suggested order, no captions on the images unless the owner wants them:

1. **Today**: a morning with the next line, Where you will be and To do filled, and Open in your threads.
2. **The composer**: a dump being sent, ideally a voice note or a photo attached, so the first two shots say "put it down".
3. **Lisbon trip thread**: the timeline rail and the rows (flat, flights, Ana's dates, Tram 28), as in the landing story.
4. **Lisbon trip, map**: the List | Map switch on Map, with Google's logo and legal line visible, as Google's terms require.
5. **Calendar**: the reply *Added Flights to Lisbon to your calendar* and the day with Google Calendar events.
6. **Memories**: the tab with a few people and their birthdays.
7. **Shared thread**: the Lisbon thread with members' marks and a row added by someone else.
8. Optional: **Not in a thread** with a Move to suggestion, to show that offload's filing can be corrected.

Shoot on a seeded account (the cast, `apps/core-api/src/seed-cast.ts`), never a real person's data. Light theme for all, or dark for all, not mixed.

---

## 8. Open questions

1. **Phone number** for App Review contact.
2. **Subtitle:** *Send it. offload files it.* or *Dump it in. It gets filed.*
3. **Google Maps SDK data** (privacy flag 1): widen the companies page, which re-asks consent from everyone, or another route? Needs settling before the label is submitted.
4. **Product events** (flag 2): declare linked and add a few words to section 3, or leave the policy as is?
5. **The app's privacy manifest** (flag 3): fill `expo.ios.privacyManifests` before this build ships, or after? Build 16 already carries the empty one.
6. **Content rights:** confirm offload has the rights to show link previews, web-sourced answers and Google content.
7. **User-generated content:** answer No (no broad distribution) or Yes (anything shared between people)? Yes may draw Guideline 1.2 questions about reporting; offload has blocking but no report control.
8. **Health, sensitive and financial data:** leave undeclared as types, since offload never asks for them and they only arrive as free text, or declare them to be safe?
9. **If Apple declines unlisted:** list publicly in the US with sign-in behind the invite, or stay on TestFlight external testing?
10. **Google Calendar line** in the review notes: keep it while verification is pending, or ask reviewers not to connect a calendar?
11. **Support page:** is the home page with the footer address enough, or does offload want a /support page before submitting?
12. **`PHOTO_TOWNS`:** confirm it is off in production (flag 4).
