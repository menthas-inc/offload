// The privacy policy.
//
// Rewritten general on 2026-10-05 (owner: "generalize when it helps"), from a
// legal review and a claim by claim audit of the page before it. It states
// what the law and the stores ask for (who, what, why, who else, how long,
// rights, changes) and promises outcomes, not mechanisms, so ordinary product
// work does not make a line of it untrue. The companies are on their own page,
// /privacy/companies, with their own date.
//
// OFF-2 is the reason the security section says what is *not* covered: "your
// data is encrypted" is a sentence this product may never print, anywhere,
// including here. Not reviewed by a lawyer.
//
// Copy on this page says "put in" and "upload" where the rest of the product
// says "dump". That is deliberate and local to this page. See decisions.md.
//
// CONSENT_VERSION in apps/core-api/src/routes/session.ts must be the latest of
// this page's UPDATED, the companies page's and the terms page's; a test holds
// the three together.
// Moving it asks every account to agree again the next time they open offload.

import type { Metadata } from "next";
import { Screen, ScreenFooter, ScreenHeader, screenStyles } from "../../../components/Screen";
import styles from "./privacy.module.css";

export const metadata: Metadata = {
  title: "Privacy policy · offload",
  description:
    "What offload collects, why, who else handles it, how long it is kept and how to get rid of it. Plus a short version at the top.",
};

const UPDATED = "8 October 2026";

const MAIL = <a href="mailto:hello@offload.club">hello@offload.club</a>;

export default function Privacy() {
  return (
    <Screen atmosphere="pinned">
      <ScreenHeader
        action={
          <a className={screenStyles.action} href="/sign-in">
            Sign in
          </a>
        }
      />

      <article className={styles.document}>
        <p className={styles.updated}>Last updated {UPDATED}</p>
        <h1 className={styles.title}>Privacy policy</h1>
        <p className={styles.standfirst}>
          offload only works if you put real material into it, and you should only do that if you
          know where it goes. This page says where it goes.
        </p>

        <section className={styles.summary}>
          <h2 className={styles.summaryTitle}>The short version</h2>
          <p className={styles.disclaimer}>
            This summary is not the policy. Where the two differ, the sections below count.
          </p>

          <ul className={styles.bullets}>
            <li>
              <strong>What you put in is yours.</strong> We do not sell it, rent it or use it for
              advertising.
            </li>
            <li>
              <strong>We do not use your content to train models,</strong> and the companies that
              process it for us are bound not to either, except Google Maps Platform, as section 6
              says.
            </li>
            <li>
              <strong>Only what a task needs goes to the companies that help run offload.</strong>{" "}
              They are listed on <a href="/privacy/companies">their own page</a>.
            </li>
            <li>
              <strong>Delete anything, or your whole account, whenever you want.</strong> What you
              put in a shared thread stays with the people in it. Section 9 says why.
            </li>
            <li>
              <strong>Take it all with you.</strong> You can export everything yourself, in
              Settings.
            </li>
            <li>
              <strong>Your photos, screenshots and voice notes are encrypted by us.</strong> Your
              text is not. Section 14 is exact about it.
            </li>
            <li>
              <strong>offload is for adults in the United States.</strong>
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>1. Who we are</h2>
          <p>
            offload is not a company yet. It is run by Behrooz Afghahi, an individual in the United
            States. This page will name the company when there is one. &ldquo;We&rdquo; on this page
            means him and anyone who helps him run offload.
          </p>
          <p>
            offload is only offered in the United States, to people aged 18 and over. Write to us
            about anything on this page at {MAIL}.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>2. What this covers</h2>
          <p>
            The offload apps for iOS and Android, the web app, and this website. Sites and services
            a link takes you to have their own policies.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>3. What we collect</h2>

          <h3 className={styles.h3}>What you give us</h3>
          <ul>
            <li>
              Your email address and name, from Apple or Google when you sign in. You can change
              your name in Settings.
            </li>
            <li>
              If you join the waitlist, the email address you give it, which we keep until you are
              invited or ask us to remove it.
            </li>
            <li>
              Everything you put in: notes, links, photos, screenshots, PDFs, voice notes, what you
              type to offload, and email you forward to it. Photos can carry details the camera wrote
              into them, such as when and where they were taken; we keep those with the photo.
            </li>
            <li>
              From an email you forward, its text, its pictures and its PDFs, its subject, who sent
              it and when, but not the raw email or its other attachments.
            </li>
          </ul>

          <h3 className={styles.h3}>What offload makes from it</h3>
          <ul>
            <li>
              The threads and labels it sorts what you put in into, and the dates, places and other
              details it pulls out.
            </li>
            <li>
              Transcripts of voice notes, and descriptions of what photos, screenshots and PDFs
              show, including any words in them. The text of a PDF itself is not kept.
            </li>
            <li>Notes about a thread, written by you or by offload.</li>
            <li>
              Memories: what offload knows about you across your threads, such as the names of
              people in your life, how they relate to you and their birthdays, what your calendars
              are, and how you like things done. offload keeps one when you ask it to remember
              something, when you answer a question it asked, from what you said, overnight, and
              when you add one yourself in Memories. offload is told to keep health, religion,
              politics, sexuality, ethnicity, a criminal record and money only when you asked it to
              remember them or added them yourself, and never an ID or account number, a password
              or immigration status, and it filters what it learns overnight. That is an
              instruction and a filter, not a guarantee: you can see and forget every memory in
              Memories.
            </li>
            <li>
              Its replies to you, with the addresses of the pages it read or searched to answer.
            </li>
            <li>Suggestions, and search indexes that make all of this findable.</li>
          </ul>
          <p>
            We advise against putting passwords, card numbers or government IDs into offload, or
            into any AI tool. offload is asked to leave those out of what it writes down, but that
            is an instruction to a model, not a guarantee.
          </p>

          <h3 className={styles.h3}>What comes from an app you connect</h3>
          <p>
            If you connect a Google calendar, offload reads the calendars you choose, keeps what it
            needs from their events, and writes to them when you ask it to. Section 7 says more.
          </p>

          <h3 className={styles.h3}>What we collect because software has to run</h3>
          <ul>
            <li>Your IP address and a description of your device and browser, kept with your sign-in sessions.</li>
            <li>
              Your device&rsquo;s time zone, so dates mean what you meant. We do not ask your device
              for its location.
            </li>
            <li>The country you set in Settings, if you set one.</li>
            <li>
              Records of what each request did, how long it took and what it cost, including each
              call to an AI model. These are built to hold no content.
            </li>
            <li>
              Product events, such as finishing first run, under a random identifier that only we can
              link back to you, until you delete your account.
            </li>
            <li>Records of staff access to your account, kept for security.</li>
            <li>
              If you turn notifications on, a token that identifies your phone, and a record of
              what was sent to it.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>4. Why we use it</h2>
          <ul>
            <li>
              To run offload for you: store, sort, search, answer, look things up, put places on a
              map, send the notifications you choose, and connect the apps you choose.
            </li>
            <li>To keep accounts secure and stop abuse.</li>
            <li>To find out whether offload works and what it costs, from records that carry no content.</li>
            <li>To email you about your account and about changes to this page.</li>
            <li>To answer a lawful request, or to establish or defend a legal claim.</li>
          </ul>
          <p>
            First run asks you to agree to offload holding what you put in, which can include
            private matters, and to it being processed to run offload, including by AI services
            from other companies. You need that, and an email address, to have an account. If you
            no longer agree, delete your account; you can take a copy first.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>5. AI</h2>
          <p>
            Sorting, reading photos and PDFs, transcribing voice notes, looking things up and
            answering you are done by AI models from other companies, which we call on your behalf.
            Each call carries what that task needs: what you just put in (of a PDF, its first ten
            pages), the recent conversation, the names of your threads and labels, what offload
            knows about you, and, when offload answers,
            what it reads from your threads to answer. Not more. What offload knows about you is
            never put into a web search.
          </p>
          <ul>
            <li>
              <strong>No training.</strong> We do not use your content to train models. The
              companies that process your content for us are bound, by their terms or by settings
              we have turned on, not to use it to train theirs.
            </li>
            <li>
              <strong>Looking things up.</strong> When offload needs a fact it does not hold, it may
              search the web with words from what you put in and the country you set in Settings,
              and read a link you pasted. The site
              sees a request from our server, and your device may load the page&rsquo;s preview
              picture straight from the site. You can turn searching and link reading off in
              Settings under Privacy.
            </li>
            <li>
              <strong>Places.</strong> When something you keep names a place, a place&rsquo;s name,
              on its own, is sent to Google Maps Platform to put it on a map.
            </li>
            <li>
              <strong>Automated decisions.</strong> Filing is automatic, which is the point of
              offload, but it has no legal or similarly significant effect on anyone. You can see
              and correct everything offload does.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>6. The companies that help us run offload</h2>
          <p>
            We use a small number of companies: for hosting and our database, file storage and
            backups, AI models and web search, search indexing, transcription, email, building the
            phone apps and sending notifications, signing in, maps, and, if you connect one, your
            calendar. The current list, with what each does and receives, is on{" "}
            <a href="/privacy/companies">the companies page</a>, which has its own date.
          </p>
          <p>
            Each processes data only to provide its service to us, under terms that require it to
            protect that data. Two are different. Apple and Google, when you sign in with them, act
            for themselves under their own terms. Google Maps Platform, which draws maps and finds
            places by name, receives a place&rsquo;s name from us with nothing about who asked.
            From your device while a map is on screen, it receives your IP address, device details,
            an identifier, how the map is used, and on the phones crash and performance reports. It
            acts for itself under its own terms, which allow it to keep that and use it to improve
            its products, and it may recognise you if you are signed in to Google.
          </p>
          <p>
            We keep the list current. If a change would materially change how your content is
            handled, offload tells you the next time you open it and asks you to agree again before
            you go on.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>7. Google user data</h2>
          <p>
            If you connect a Google account, offload accesses your calendar list, the events in the
            calendars you choose, and who each of your calendars is shared with. It uses them to
            show your calendar in offload, to file and answer from it, and to add, change or delete
            events when you ask. When a change would notify other people, offload asks you first.
            We keep only what those features need, delete it when you disconnect or delete your
            account, and ask Google to revoke our access when you delete your account.
          </p>
          <p>
            Calendar data goes only to the companies on our list that are needed to provide those
            features, and to the members of a shared thread you choose to show a calendar in.
          </p>
          <p>
            offload&rsquo;s use and transfer of information received from Google APIs will adhere
            to the{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy">
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements. We do not use Google user data for
            advertising, we do not sell it, and we do not use it to develop, improve or train AI or
            machine learning models. Nobody at offload reads it unless you have agreed to that for
            the specific data, for example to fix a problem you reported, it is needed for
            security, or the law requires it.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>8. Other people in offload</h2>
          <ul>
            <li>
              You can share a thread with a connection: someone you have both agreed to connect
              with. There are no public links.
            </li>
            <li>
              Everyone in a thread can read everything in it and add to it, and sees your name and
              your mark next to what you add.
            </li>
            <li>
              Somebody who knows the email address you signed up with can ask to connect with you.
              They cannot see anything you have put in.
            </li>
            <li>A calendar you show in a shared thread is visible to its members while it is shown.</li>
            <li>
              A PDF in a shared thread opens for its members as a copy without the details of who
              made it and without anything in it that could run.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>9. Shared threads, and deleting</h2>
          <p>
            Sharing is deliberate: one thread, with people you already know.{" "}
            <strong>
              What you put in a shared thread becomes part of a record the other members rely on,
              so it stays with them
            </strong>{" "}
            when you leave the thread or delete your account. Taking it out would leave them with
            gaps and delete information about them on your instruction.
          </p>
          <p>
            While you are in a thread, nobody else can delete what you wrote, and you cannot delete
            what they wrote. Any member can export the thread as they see it, and any member can
            take another out. Once you leave, what you left becomes the thread&rsquo;s, and the
            others can edit or remove it. When the last member leaves, the thread is deleted.
          </p>
          <p>
            We show you this when you share a thread. If you want something to stay entirely yours,
            keep it in a thread you have not shared.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>10. If someone else asks for your data</h2>
          <p>
            A court, a regulator or the police can compel us to disclose data. We hand over only
            what a valid request requires, we push back on requests that are not valid or go too
            far, and we tell you before we do, unless the law forbids it or there is no time, in
            which case we tell you when we can. Our storage provider holds your photos only in
            encrypted form, but we hold the keys, so a request to us can reach your photos as well
            as your text.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>11. If offload is bought or merges</h2>
          <p>
            Whoever ends up holding your information is bound by this page. Anything weaker needs
            your agreement first. We email account holders before a change of ownership completes,
            with time to take a copy and delete the account.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>12. Where it is kept</h2>
          <p>
            offload runs in the United States. Some of the companies on our list may process data
            in other countries, under the terms section 6 describes.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>13. How long we keep it</h2>
          <ul>
            <li>
              <strong>What you put in, and what offload makes from it:</strong> for as long as your
              account exists, or until you delete it. Nothing expires on a clock, because finding
              something from years ago is the point. A memory is kept while it is still true: when
              one is replaced, the old one goes after 30 days.
            </li>
            <li>
              <strong>What you delete is deleted.</strong> It is removed from our live systems
              promptly, and from our backups within 30 days.
            </li>
            <li>
              <strong>Data from a connected app:</strong> while it is connected, and only the part
              offload is using. It goes when you disconnect or delete your account.
            </li>
            <li>
              <strong>Working records,</strong> such as what offload keeps so a change can be
              undone, or a list of the notifications it sent: only as long as the feature needs
              them, usually days or weeks.
            </li>
            <li>
              <strong>A copy you export: 7 days,</strong> then it is deleted.
            </li>
            <li>
              <strong>Logs and usage records:</strong> server logs for a limited period set by our
              host. Records of what requests did and cost are kept, and when you delete your
              account it is removed from them.
            </li>
            <li>
              <strong>Security records,</strong> including staff access to your account: up to two
              years.
            </li>
            <li>
              <strong>Product events:</strong> kept, but deleting your account destroys the
              identifier that links them to you.
            </li>
            <li>
              <strong>The companies on our list</strong> keep what we send only as long as their
              service needs, under their terms, except Google Maps Platform, as section 6 says.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>14. Security</h2>
          <p>We would rather make a narrow claim that is true than a broad one that sounds better.</p>
          <p>
            <strong>Encrypted by us:</strong> your photos, screenshots, PDFs, voice note audio and
            the pictures and PDFs in email you forward, before they are stored, with keys our
            storage provider never receives. A PDF you open on your phone is handed to the
            phone&rsquo;s own viewer from a private copy, deleted when you come back to offload.
            Our own nightly backup and your exports are encrypted the same way. We hold the keys,
            so this protects against a breach at our storage provider, not against a compromise of
            offload itself.
          </p>
          <p>
            Our host&rsquo;s recovery copies of the database are protected by its encryption, as the
            database is, not by ours.
          </p>
          <p>
            <strong>Not encrypted by us:</strong> the text in offload, including transcripts and
            what offload writes about a photo or a PDF. It sits in our database protected by our host&rsquo;s
            disk encryption and access controls. Someone who obtained a copy of our database could
            read it.
          </p>
          <p>
            Access to your data is checked on our servers for every request. Only a few people can
            reach production, and they read your content only when you ask for help or a specific
            fault requires it, and Google user data only as section 7 allows. Our staff tools show
            no content, and their use is recorded. Our logs, analytics and monitoring are built to
            carry no content. Notifications are the exception: they carry a few words of what you
            or a thread member wrote, to your own phone.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>15. Health information</h2>
          <p>
            offload does not ask for health information. If you put some in, it is treated like
            everything else you put in: used only to run offload for you, never sold, never used
            for advertising, and deleted when you delete it. offload is told to keep it as a memory
            only when you asked it to remember it or added it yourself in Memories. That is an
            instruction and a filter, not a guarantee, and you can forget any memory there.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>16. Your choices and your rights</h2>
          <p>
            In Settings you can export everything, delete your account, turn web search and link
            reading on or off, connect or disconnect a calendar, and choose your notifications. You
            delete something you put in, or a thread, where it is.{" "}
            <a href="/delete-account">How deleting an account works</a>. In Memories you can see,
            add, change and forget what offload knows about you; you can also ask offload what it
            remembers, and your export lists them too.
          </p>
          <p>
            Wherever you are in the United States, you have the right to know what we collect and
            why, to a copy, to correct it, and to delete it, and we will not treat you differently
            for asking. You may use an authorised agent. Write to {MAIL}. We answer within one
            month, and may need to confirm it is you, usually by having you write from the address
            you sign in with. One limit on deleting: section 9.
          </p>
          <p>
            We do not sell your personal information or share it for cross-context behavioural
            advertising, so there is nothing to opt out of. We use sensitive information only to
            run offload for you.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>17. If you are not on offload</h2>
          <p>
            What people put in can mention you: an event you are invited to, an email you sent that
            someone forwarded, a note with your name in it, or a memory of theirs that says who you
            are to them. We hold that only as part of their
            account, for the purposes above, and the same retention and security apply. To ask
            about it, write to {MAIL}.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>18. Cookies and tracking</h2>
          <p>
            offload sets what it needs to sign you in, keep you signed in and stop abuse, and your
            browser keeps your display preferences on your device. There are no advertising
            cookies and no third-party analytics in your browser, so there is no banner. We do not
            track you across other sites, so we treat a Do Not Track signal the way we treat
            everyone. Two others can see your device&rsquo;s requests while you use offload: Google,
            when a map is on screen, which may recognise you across its own services as section 6
            says, and a site whose preview picture is shown for a link.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>19. Age</h2>
          <p>
            offload is for people 18 and over. If we learn an account belongs to someone younger,
            we delete it. Tell us at {MAIL} if you think that has happened.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>20. Changes to this page</h2>
          <p>
            When we change this page we change the date at the top. If a change materially affects
            how your information is handled, offload tells you the next time you open it and asks
            you to agree again before you go on. The list of companies has its own date and changes
            there.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>21. Contact</h2>
          <p>{MAIL}. We have no postal address to give yet.</p>
        </section>
      </article>

      <ScreenFooter />
    </Screen>
  );
}
