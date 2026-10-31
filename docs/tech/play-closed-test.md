# The Play closed test

Google requires a personal developer account to run a **closed test with at
least 12 testers, opted in for 14 days in a row**, before it may apply for
production. offload's Play account is personal, and the dashboard says so
(checked 2026-10-10: *0 testers currently opted-in*). Until then Android stays
on the internal track (going-public items 6 and 22).

## Owner: before inviting anyone

**Status 2026-10-31:** steps 1 to 3 are done. App setup is complete, the
closed track (*Closed testing - Alpha*, United States) uses the existing
*close group* email list, so internal testers count too, and release 0.3.0
(9) went to Google for review on 2026-10-31. The tester code is *Play
closed test* in the admin panel (50 uses, until 29 January); Google's
reviewers have their own, *Play review*, in Sign in details. Only step 4
is left, once the review passes. The data safety form now matches the iOS
label; an earlier draft had wrong purposes on seven types.

1. **Finish setting up the app** in Play Console (Dashboard, *Finish setting up
   your app*, View tasks). The closed test stays locked until this is done:
   store listing (name, short and full description, icon, 1024 x 500 feature
   graphic, phone screenshots from the Android app), and App content: privacy
   policy (https://offload.club/privacy), app access (sign-in needs a code:
   give Google the review code and the steps from
   `store/ios/app-review-2026-10-09.md`), ads (none), content rating, target
   audience (18 and over), data safety (map it from the 16 iOS label types in
   `store/ios/listing-draft.md`), and countries: United States only.
2. **Create the closed test:** Test and release, Testing, Closed testing,
   *Create track* (or the default track), countries United States, testers
   *Email lists*, a new list called *closed test*, feedback address
   hello@offload.club. Then **Promote release** of 0.2.0 (8) from Internal
   testing to it and roll out. Closed releases can take a day or two to be
   reviewed the first time.
3. **Make a tester code** in offload's admin panel: Waitlist, Review codes,
   *New code*, note *Play closed test*, 50 uses, 90 days. It is shown once.
   The *Review codes* switch on the Limits page must stay on until the test
   ends (item 17d).
4. **Copy the opt-in link:** Closed testing, Testers, *Join on the web*,
   *Copy link*.

## Owner: for each tester

1. Ask for the **email of the Google account on their Android phone** (the
   one the Play Store uses). It can differ from the address they sign in to
   offload with.
2. Add it to the *closed test* email list and save.
3. Send them the message below with the link and the code filled in.
4. The dashboard counts opted-in testers. The 14 days run while at least 12
   stay opted in; someone leaving early can reset the count, so invite a few
   more than 12.
5. After 14 days: Dashboard, *Apply for production*, and answer Google's
   questions about the test (who tested, what feedback came in, what changed).

## The message to send

> Hi, would you help me test offload on Android? It is a place to put down
> anything you would otherwise forget, and it sorts it for you.
>
> 1. Send me the email of the Google account on your Android phone, the one
>    the Play Store uses. I will add you to the test.
> 2. Once I say you are added, open this link on your phone: [LINK]. Tap
>    **Become a tester**, then **Download it on Google Play**.
> 3. Open offload. On the sign-in screen tap **Have a code?**, enter
>    **[CODE]**, then **Continue with Google**. Any Google account works.
> 4. Use it for a couple of weeks for anything on your mind: a note, a link,
>    a photo, a voice note, a forwarded email. offload files it into threads.
> 5. **Please stay in the test for at least 14 days and keep the app
>    installed.** Google needs 12 people in the test for 14 days in a row
>    before offload can go on the Play Store, and leaving early resets the
>    count.
>
> Anything odd or confusing, tell me, or write to hello@offload.club.
> offload is for adults in the United States for now.
