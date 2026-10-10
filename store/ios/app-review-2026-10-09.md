# App Review, 0.2.0: information needed (2026-10-09)

Apple's reply to the first submission (build 18, submission
b3b69fd0-bc0f-4df5-abf3-6037c1d186a0) was **Guideline 2.1, Information
Needed**, the standard request to a developer account with little review
history. The build was not judged. It is answered in App Store Connect, App
Review, the submission, **Reply to App Review**, then **Resubmit to App
Review** on the same page. Build 18 stays.

`[CODE]` below is the review code made for this review in the admin panel
(Waitlist, Review codes, note *App Store review 0.2.0*). It is in the review
notes in App Store Connect and is kept out of the repository. Revoke it
once offload is approved and released.

## 1. The screen recording (needs a physical iPhone)

Apple wants it on a physical device on the latest iOS, starting from
launching the app. Install the App Store build from TestFlight (offload
0.2.0, build 18), then record with Control Center's screen recording.

Use a **throwaway Apple ID or Hide My Email**, never the owner's account:
the recording ends by deleting it. The code has five uses.

In this order, a few minutes in all:

1. Launch offload. The sign-in screen.
2. **Have a code?**, enter `[CODE]`, **Continue with Apple**.
3. First run, start to finish.
4. Put things in: a typed note (for example "Flights to Lisbon on 14
   October, 214 dollars"), a photo, a voice note. Open the thread they land
   in, then **Today**.
5. Ask a question about something just added.
6. Share a thread with a connection, then **block** a person. Apple calls
   out reporting and blocking; offload has blocking, under the person's page
   in Settings, My people. (Sharing needs a second invited account connected
   to the first; if that is not set up, show the connection screen and
   blocking.)
7. Settings, Privacy, **Your copy** (export).
8. Settings, My account, **Delete account**, through to the end.

## 2. Sending it

1. App Store Connect, offload, **App Review**, the submission with
   *Unresolved Issues*, **Reply to App Review**: paste the reply below and
   attach the video.
2. Replace the **Notes** in the version page's App Review Information with
   the same text from section 2 onwards (it fits the 4,000-character limit).
   Edit it there directly: do not `eas metadata:push`, which would
   overwrite the owner's description edits.
3. **Resubmit to App Review**.

## The reply

Hello, and thank you. Answers below; the screen recording is attached.

1. Screen recording
Attached, recorded on an iPhone running the latest iOS. It starts at launch and shows signing in with a review code, first run, putting things in (a typed note, a photo, a voice note), how they are filed into threads, Today, asking a question, sharing a thread with a connection and blocking a person, exporting everything, and deleting the account in Settings.

2. Purpose and audience
offload is a personal assistant for keeping track of things. People put down whatever is on their mind (a note, a link, a photo, a screenshot, a PDF, a voice note or a forwarded email) and offload files it into a thread for each trip, plan or job, pulling out dates, places and to-dos. It solves the problem of details scattered across notes apps, messages to yourself and calendars, where they get lost. It is for adults in the United States, and is invite only while we grow; anyone else who opens it can join the waitlist.

3. Setup and access
There are no passwords. Sign-in is with Apple or Google, and only invited addresses get in. For review:
1. Open offload and tap "Have a code?" on the sign-in screen.
2. Enter this code: [CODE]
3. Continue with Apple or Google using any account of your own (Hide My Email works).
4. First run asks you to agree to the terms and to how offload processes what you put in; the remaining steps can be skipped.
Then type anything in the composer, for example "Flights to Lisbon on 14 October, 214 dollars", and offload files it into a thread. No sample files are needed; any photo or PDF works. Delete account: Settings, My account, Delete account. Export: Settings, Privacy, Your copy.

4. External services
- Sign in with Apple and Google Sign-In: authentication.
- Anthropic (Claude models): sorting, reading photos and PDFs, and answering questions; also web search and link reading, which can be turned off in Settings.
- Voyage AI: search embeddings.
- AssemblyAI: transcribing voice notes.
- Railway: our servers and database. Cloudflare R2: file storage and backups.
- Resend: email we send, and email people forward to offload.
- Expo: app builds, updates and push notifications, delivered by Apple Push Notification service.
- Google Maps Platform: maps and finding places by name.
- Google Calendar: optional, only if a person connects their own calendar.
offload does not use what people put in to train models, the AI providers above are bound not to either, and offload has no ads.

5. Regional differences
offload is offered only in the United States, and works the same everywhere it is offered.

6. Regulated industry or protected material
Neither. offload does not provide financial, medical or legal services, and it hosts no third-party content beyond short previews of links a person shares with it.
