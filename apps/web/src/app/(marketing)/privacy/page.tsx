// The privacy policy.
//
// A first draft, written from docs/constitution/principles.md and
// docs/tech/stack.md rather than from a template, so every claim on it is one
// the code actually supports. OFF-2 is the reason the security section says
// what is *not* covered: "your data is encrypted" is a sentence this product
// may never print, anywhere, including here.
//
// Not reviewed by a lawyer. Everything still to be decided is wrapped in
// <Todo>, which draws in amber, so an unfilled value cannot be missed.
//
// Copy on this page says "upload" where the rest of the product says "dump".
// That is deliberate and, for now, local to this page. See decisions.md.

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Screen, ScreenFooter, ScreenHeader, screenStyles } from "@/components/Screen";
import styles from "./privacy.module.css";

export const metadata: Metadata = {
  title: "Privacy · offload",
  description:
    "What offload holds, why, who else touches it, and how to get rid of it. Plus a plain summary at the top.",
};

const UPDATED = "1 September 2026";

function Todo({ children }: { children: ReactNode }) {
  return <span className={styles.todo}>{children}</span>;
}

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
        <h1 className={styles.title}>Privacy</h1>
        <p className={styles.standfirst}>
          offload only works if you put real material into it, and you should only do that if you
          know where it goes. This page says where it goes.
        </p>

        <section className={styles.summary}>
          <h2 className={styles.summaryTitle}>The short version</h2>
          <p className={styles.disclaimer}>
            This section is not a legal document. It is our attempt to summarise this page to make
            it more readable. Where the two disagree, the sections below are the ones that count.
          </p>

          <ul className={styles.bullets}>
            <li>
              <strong>What you upload is yours.</strong> We do not sell it, rent it, trade it or
              hand it to advertisers. If offload is ever bought, the buyer is bound by this page as
              it stands, and section 8 says what that means.
            </li>
            <li>
              <strong>We do not train AI on what you upload.</strong> That stays off unless you
              explicitly allow us to improve the product with your content, and you can withdraw
              that at any time.
            </li>
            <li>
              <strong>Delete anything, whenever you want.</strong> A single upload, a thread, or the
              whole account. It leaves our live systems immediately and our backups within 30 days.
              One exception: what you put into a thread you share stops being yours alone. Section
              10 explains why.
            </li>
            <li>
              <strong>Your photos, screenshots and voice notes are encrypted</strong> before we
              store them, with a key our storage provider never receives. The text in offload is
              not. We plan to encrypt that too.
            </li>
            <li>
              <strong>No ad trackers and no cookie banner.</strong> Nothing on our site follows you
              anywhere else.
            </li>
            <li>
              <strong>A few companies help us run offload.</strong> All of them are named below,
              none of them may use what you upload for their own purposes, and we do not add one
              quietly. We may also be obliged by a court to hand over your content, and section 7
              describes how we handle that.
            </li>
            <li>
              <strong>We only look at your content to fix problems.</strong> Someone here may read
              it when you ask us for help, or when we are chasing a bug that needs it. Not
              otherwise.
            </li>
            <li>
              <strong>You can take it all with you.</strong> One export, readable without offload.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>1. Who we are</h2>
          <p>
            offload is run by <Todo>[legal name]</Todo>, a <Todo>[state]</Todo> corporation at{" "}
            <Todo>[registered address]</Todo>. We decide what happens to the information described
            here, which makes us the controller of it under European and UK data protection law,
            and a business under the California Consumer Privacy Act.
          </p>
          <p>
            Write to us about anything on this page at{" "}
            <a href="mailto:hello@offload.club">hello@offload.club</a>. A person reads it.
          </p>
          <p className={styles.note}>
            To fill in before this is published: our EU and UK representative under Article 27, once
            we have users in either place. <Todo>[representative, or a note that we have none yet]</Todo>
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>2. What this covers</h2>
          <p>
            The offload apps for iOS and Android, the offload web app, and this website. It does not
            cover anything a link from here takes you to, including the companies listed in section
            6, who each have their own policy.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>3. What we hold</h2>

          <h3 className={styles.h3}>What you give us</h3>
          <ul>
            <li>
              <strong>Your email address</strong>, which comes from Apple or Google when you sign
              in. There is no password, so we never hold one.
            </li>
            <li>
              <strong>Your name.</strong> Either the one Apple or Google passes along when you
              first sign in, or the one you type, and you can change it at any time in Settings.
            </li>
            <li>
              <strong>Everything you upload.</strong> Notes, links, screenshots, photos, voice
              notes, and what you say to offload in the composer. This is the product, so we keep
              it.
            </li>
          </ul>

          <h3 className={styles.h3}>What offload makes from it</h3>
          <ul>
            <li>
              The <strong>threads</strong> what you upload is sorted into, and the tags, dates and
              amounts pulled out of it.
            </li>
            <li>
              <strong>Transcripts</strong> of your voice notes, and text read out of screenshots.
            </li>
            <li>
              <strong>Memories</strong>, which are short standing notes about a thread: how you
              want it handled, or something that stays true about it. You write some of them and
              offload writes others from what you dumped, and they are what lets it be useful
              without your whole history in front of it. Plus the numeric representations that
              make search work.
            </li>
          </ul>

          <p className={styles.note}>
            The same advice first run gives you: we do not recommend sharing passwords, card
            numbers or government IDs in any AI tool. Nothing in offload is built to handle them,
            and no assistant is the right place to keep them.
          </p>

          <h3 className={styles.h3}>What comes from an app you connect</h3>
          <p>
            If you connect an email account, a calendar or a browser, offload reads what is there,
            keeps what it describes, and throws the rest away. We store that plus a reference we can
            use to fetch the original again on demand. We do not keep the raw message, the raw event
            or the raw page. What you upload is something you chose to hand us. A connected inbox is
            not, and we treat the two differently on purpose.
          </p>
          <p>
            <strong>A connected calendar is the one that also goes the other way.</strong> You can
            ask offload to add, change or delete an event, and it writes to your calendar to do it.
            It never writes anywhere else: not your mail, not your files. When a change would reach
            somebody else, because the event has guests or the calendar is one you share, offload
            asks you first and tells you who will find out. When it reaches nobody but you, it just
            does it and you have a few seconds to undo.
          </p>
          <p>
            <strong>An event brings other people with it.</strong> If somebody is invited to an
            event on your calendar, offload keeps their name and whether they accepted, so it can
            tell you who you are seeing. It keeps their email address only for an event offload
            itself created with guests, because changing that event later means telling those guests
            again. Everyone else&rsquo;s address is dropped before anything is stored. These details
            are kept for as long as the event is, which is until you delete it. We keep what a
            calendar describes and none of the event&rsquo;s own description text.
          </p>

          <h3 className={styles.h3}>What we collect because software has to run</h3>
          <ul>
            <li>
              <strong>Your IP address and a description of your browser or device</strong>, stored
              against your sign-in sessions so we can show you where you are signed in and end a
              session that should not be there.
            </li>
            <li>
              <strong>Server logs.</strong> Which request, how long it took, whether it worked.
              Never what was in it.
            </li>
            <li>
              <strong>Product events</strong>, such as joining the waitlist or finishing first run.
              These carry a random identifier for your account rather than your account id or your
              address. Deleting your account destroys the mapping, after which every event we have
              already recorded is permanently unattributable to you.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>4. Why we hold it, and on what basis</h2>
          <p>
            If you are in the UK or the European Economic Area, the law asks us to name a legal
            basis for each purpose. These are ours.
          </p>
          <div className={styles.scroller}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Why</th>
                  <th scope="col">What</th>
                  <th scope="col">Basis</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>To give you offload at all</td>
                  <td>Your account and everything you upload</td>
                  <td>Performance of our contract with you</td>
                </tr>
                <tr>
                  <td>To keep you signed in and keep others out</td>
                  <td>Sessions, IP address, device description, rate limits</td>
                  <td>Our legitimate interest in a secure service</td>
                </tr>
                <tr>
                  <td>To email you about your account</td>
                  <td>Your email address</td>
                  <td>Performance of our contract with you</td>
                </tr>
                <tr>
                  <td>To find out whether offload works</td>
                  <td>Pseudonymous product events and server logs, never content</td>
                  <td>Our legitimate interest in improving the product</td>
                </tr>
                <tr>
                  <td>To hold the private material people inevitably upload</td>
                  <td>Health, money, and anything else personal that lands in a thread</td>
                  <td>Your explicit consent, given on the last screen of first run</td>
                </tr>
                <tr>
                  <td>To improve offload using your own content</td>
                  <td>What you upload, only if you switch this on</td>
                  <td>Your consent, and off until you give it</td>
                </tr>
                <tr>
                  <td>To answer a lawful request or defend a claim</td>
                  <td>Whatever is strictly relevant</td>
                  <td>Legal obligation, or our legitimate interest</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Where the basis is our legitimate interest, you can object, and section 14 says how.
            Where it is consent, you can withdraw it at any time without losing anything else.
          </p>
          <p>
            <strong>The consent on the private material row is the one that matters most</strong>,
            and it is why first run ends with two tick boxes rather than a button. Some of what
            people upload will be health, money, beliefs or relationships, because those are the
            subjects worth not forgetting, and European law asks for consent that is explicit and
            specific before anyone holds them. That is the tick. It is separate from acknowledging
            this page, and if you withdraw it we can no longer run offload for you, so withdrawing
            it means closing the account and taking your export with you.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>5. AI, and what it does with what you upload</h2>
          <p>
            Sorting an upload into a thread, pulling a date out of a sentence, transcribing a voice
            note and answering you in the composer are all done by AI models we call on your behalf.
            To do that, the relevant part of your content is sent to the companies in the table
            below.
          </p>
          <ul>
            <li>
              <strong>They do not train on it.</strong> Every company in the table below publishes
              terms that rule out using what an API sends them to train or improve their own models,
              and not publishing such a term disqualifies a company from this list. We rely on those
              published terms rather than on separately negotiated ones, which is worth knowing
              because a published term can be changed by the company that published it. We check
              them, and section 17 says what happens when something material moves.
            </li>
            <li>
              <strong>Only what the task needs goes out.</strong> Not your account, not your
              history, not your other threads.
            </li>
            <li>
              <strong>Our own monitoring never sees content.</strong> The tooling we use to watch
              cost and reliability receives identifiers, model names, token counts, timings and
              outcomes. No prompts, no responses, nothing you wrote.
            </li>
            <li>
              <strong>We do not train models on your content either</strong>, and there is nothing
              in offload today that does. If that ever changes it will be a switch that starts off,
              described here first, and yours to leave alone.
            </li>
          </ul>
          <p>
            <strong>Automated decisions.</strong> Filing is automatic, which is the whole point of
            offload, but it produces no legal or similarly significant effect on anyone. Every
            decision it makes is visible to you and reversible by you, and anything filed in the
            wrong place can be moved afterwards. We do not profile you to decide anything about you.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>6. The companies that help us run offload</h2>
          <div className={styles.scroller}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Company</th>
                  <th scope="col">What they do</th>
                  <th scope="col">What they receive</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Railway</td>
                  <td>Runs our servers and our database</td>
                  <td>Everything, because it is where offload runs</td>
                </tr>
                <tr>
                  <td>Cloudflare R2</td>
                  <td>Stores files and our nightly backup</td>
                  <td>Your photos, screenshots and voice notes, encrypted, and never a key</td>
                </tr>
                <tr>
                  <td>Anthropic</td>
                  <td>Claude, which does the sorting and the conversation</td>
                  <td>The part of your content a given task needs</td>
                </tr>
                <tr>
                  <td>Voyage AI</td>
                  <td>Turns what you upload into something searchable</td>
                  <td>The text being indexed</td>
                </tr>
                <tr>
                  <td>AssemblyAI</td>
                  <td>Transcribes voice notes</td>
                  <td>The audio of a voice note</td>
                </tr>
                <tr>
                  <td>Langfuse</td>
                  <td>Tells us what our AI calls cost and whether they worked</td>
                  <td>Identifiers, timings and counts. No content, by rule</td>
                </tr>
                <tr>
                  <td>Resend</td>
                  <td>Sends the handful of emails we send</td>
                  <td>Your email address and the email itself</td>
                </tr>
                <tr>
                  <td>Google Calendar</td>
                  <td>Only if you connect one: reads your calendars, and writes the changes you ask for</td>
                  <td>
                    The events in the calendars you turn on, and the events offload writes for you.
                    A separate connection from signing in, which you can end at any time
                  </td>
                </tr>
                <tr>
                  <td>Apple and Google</td>
                  <td>Sign you in</td>
                  <td>
                    They tell us your verified email address and your name. We tell them nothing
                    about what you upload
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Each of them is under a contract that lets them process this only to provide their
            service to us, and never for themselves. We do not add a company that will hold your
            content without updating this page and telling account holders before the change takes
            effect.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>7. If someone else asks for your content</h2>
          <p>
            The companies in section 6 are not the only way something could leave offload. A court,
            a regulator or the police can compel disclosure, and no privacy policy can promise
            otherwise. Here is what we do.
          </p>
          <ul>
            <li>
              <strong>We give what the law requires, not more.</strong> A request for an account
              gets that account. It does not get a thread other people are also in, and it does not
              get an adjacent account because it would be convenient.
            </li>
            <li>
              <strong>We check that a request is valid before we answer it.</strong> A demand
              without the paperwork behind it gets refused, and we push back on one that is
              overbroad rather than treating any letterhead as an order.
            </li>
            <li>
              <strong>We tell you, unless we are forbidden from telling you.</strong> If we can say
              that your content has been asked for, we will, before we hand anything over if there
              is time and afterwards if there is not. Where a gag order applies we say nothing,
              because that is what a gag order is, and we tell you the moment it lifts.
            </li>
            <li>
              <strong>We cannot hand over a key we do not have.</strong> That cuts both ways: your
              photos, screenshots and voice notes are encrypted, and your text is not. Section 12 is
              precise about which is which.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>8. If offload is bought or merges</h2>
          <p>
            Companies get bought, merge and occasionally wind up, and personal information usually
            moves with the rest of the business when they do. Our commitment:
          </p>
          <ul>
            <li>
              <strong>A buyer inherits this page as it stands.</strong> If offload is acquired,
              merges, or its assets are sold, whoever ends up holding your content is bound by the
              policy you are reading, not by whatever policy they already had.
            </li>
            <li>
              <strong>Anything weaker needs your agreement first.</strong> A new owner who wants to
              do something this page does not allow, including anything that would count as selling
              your information, has to ask you and get a yes. Not a notice, not a banner, not
              continued use of the app. A yes.
            </li>
            <li>
              <strong>You get told before it completes, and you can leave with everything you put in.</strong>{" "}
              We email account holders ahead of a change of ownership, with enough time to export
              everything and delete the account first if that is what you want.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>9. Where it is kept</h2>
          <p>
            offload runs in the United States, in <Todo>[region]</Todo>. If you are in the UK or the
            European Economic Area, that means your information is transferred out of it. We rely on
            the European Commission's standard contractual clauses, and the UK addendum to them, for
            those transfers, and we hold the same terms with each company in section 6.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>10. How long we keep it</h2>
          <ul>
            <li>
              <strong>What you upload: for as long as your account exists.</strong> offload does not
              age your uploads out or thin them down over time. Being able to find something from
              three years ago is the product, so nothing expires on a clock.
            </li>
            <li>
              <strong>Anything you delete: immediately, then 30 days.</strong> It goes from the live
              database and from file storage as soon as you ask. Our backups, which exist so a bad
              day is recoverable, roll over within 30 days, and after that it is gone from those
              too.
            </li>
            <li>
              <strong>Product events:</strong> kept, but detached. Deleting your account destroys
              the identifier that connects them to you.
            </li>
          </ul>

          <h3 className={styles.h3}>Deleting your account, and shared threads</h3>
          <p>
            Deleting your account removes what you kept privately, including your memories, and
            your membership of every thread you were in. There is one deliberate exception:{" "}
            <strong>
              what you put into a thread you shared with other people stays in that thread, and
              that includes the memories you added to it.
            </strong>{" "}
            Understand this before you share anything, so here is the reasoning behind it.
          </p>
          <p>
            <strong>Sharing is a deliberate act, on one thread, with one person you already know.</strong>{" "}
            offload has no public links and nothing is shared by default. You pick a thread and you
            pick a connection, someone you and they have both agreed to be connected to, and you do
            it again for the next thread. Nothing arrives in a shared thread by accident.
          </p>
          <p>
            <strong>What you put in a shared thread becomes part of a shared record.</strong> The
            moment you add something to a thread with other people in it, it stops being only your
            information and becomes theirs as well: their record of a trip you are planning
            together, their copy of the answer to a question they asked, the context for everything
            they added after it. Taking your part back out later would not return the thread to some
            earlier state. It would leave the other members with a conversation full of holes and no
            way to know what used to be there, and it would delete information about them, on your
            instruction, without their agreement.
          </p>
          <p>
            <strong>So nobody owns a shared thread, including us.</strong> A thread has members and
            no owner. There is no role that can throw someone out, take it over, or empty it, and
            being the person who created it grants nothing beyond having been the first one in it.
            Nobody, including you, can delete what somebody else wrote while that person is
            still in the thread. That symmetry is the point: the protection you give up over your
            own contribution is exactly the protection you get over everybody else's.{" "}
            <strong>
              When somebody leaves a thread, or deletes their account, what they left in it becomes
              the thread's.
            </strong>{" "}
            Anyone still there can edit or remove it. We think that is the right way round: the
            protection exists so a thread cannot become a place where someone else destroys your
            work, and once you have gone there is no work of yours left to protect, only a thread
            other people still use carrying things none of them can tidy.
          </p>
          <p>
            <strong>What you keep is the right to leave, and the thread ends with its last
            member.</strong> You can take yourself out of a shared thread at any time. Your
            membership and your access go, and the other members' view is untouched. When the last
            member leaves, the thread and everything in it is deleted, which is the only moment at
            which nobody is left who could read it. Nothing is kept forever against everyone's
            wishes. It is kept for as long as somebody in it still wants it.
          </p>
          <p>
            We tell you all of this at the moment you share a thread, not afterwards, so the trade
            is one you make on purpose. If you would rather keep something entirely yours, keep it
            in a thread you have not shared, where deleting it deletes it.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>11. Other people</h2>
          <ul>
            <li>
              You can share a thread with a <strong>connection</strong>, which is someone you have
              both agreed to be connected to. Everyone in a thread can read everything in it and add
              to it, and nobody can delete what they did not write themselves.
            </li>
            <li>
              <strong>Everyone in a shared thread sees your name</strong> and the initials taken
              from it, next to what you add. Changing your name in Settings changes what they see.
            </li>
            <li>
              <strong>There are no public links.</strong> Nothing in offload can be handed to
              someone who is not in the thread, and nothing is visible to anyone you have not
              connected to.
            </li>
            <li>
              Leaving a shared thread takes you and your access out of it. The other members' view
              is untouched.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>12. Security, described exactly</h2>
          <p>
            We would rather make a narrow claim that is true than a broad one that sounds better.
            Precisely:
          </p>

          <h3 className={styles.h3}>What is encrypted by us</h3>
          <p>
            Your photos, your screenshots and the audio of your voice notes are encrypted by offload
            before they are stored, each under its own key, and our storage provider never receives
            a key. They hold ciphertext and nothing else.
          </p>

          <h3 className={styles.h3}>What is not, and what that means</h3>
          <p>
            The text in offload is not encrypted by us. Titles, notes, transcripts, memories and
            search indexes sit in our database as ordinary text, protected by our provider's own
            disk encryption and by access control, the way most software works. Three consequences
            follow from that:
          </p>
          <ul>
            <li>
              Someone who obtained a copy of our database would be able to read text content in it.
            </li>
            <li>
              <strong>What a file says is not protected even where the file is.</strong> A voice
              note's audio is encrypted while its transcript is ordinary text, and the same is true
              of the words read out of a screenshot.
            </li>
            <li>None of this defends against a compromise of the running service itself.</li>
          </ul>
          <p className={styles.note}>
            We plan to encrypt text as well. This section changes when that ships, and section 17
            says how we tell you.
          </p>

          <h3 className={styles.h3}>The rest of it</h3>
          <ul>
            <li>
              Every request is authorised on the server, per row, against the account that owns it.
              A client is never trusted to decide what it may see.
            </li>
            <li>
              Content never leaves in a log, an error report, an analytics event or an AI trace.
              Those carry identifiers, counts and outcomes only, and that rule is enforced in the
              code rather than remembered.
            </li>
            <li>
              Only a small number of people can reach production, and they read your content when
              you have asked for help or when a specific fault requires it. Not to look around.
            </li>
            <li>
              Backups run nightly and are encrypted. We can restore to a point in time if something
              goes badly wrong.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>13. What you can change</h2>
          <p className={styles.note}>
            offload is an invite-only beta as of {UPDATED}, and none of the controls below is
            built yet. Email us and we will do any of it by hand, usually the same day. Nothing
            here is on unless the text says so.
          </p>
          <ul>
            <li>
              <strong>Improve offload with my data.</strong> Off. Nothing you upload is used to
              train anything unless you turn this on yourself.
            </li>
            <li>
              <strong>Let offload notice patterns.</strong> On. This is what lets it work out that
              the brackets belong to the bookshelf. It stays inside your own account.
            </li>
            <li>
              <strong>Crash and usage reports.</strong> Counts and failures, never content.
            </li>
            <li>
              <strong>Export everything.</strong> One file, readable without offload.
            </li>
            <li>
              <strong>Delete.</strong> A single upload, a thread, or your whole account.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>14. Your rights</h2>
          <p>
            Wherever you live, you can ask us for a copy of what we hold, ask us to correct it, or
            ask us to delete it, and we will not treat you differently for asking. Write to{" "}
            <a href="mailto:hello@offload.club">hello@offload.club</a>. We answer within 30 days and
            usually much sooner. We may need to confirm you are who you say you are before we act,
            which for most requests means asking from the address you signed in with.
          </p>

          <h3 className={styles.h3}>If you are in the UK or the European Economic Area</h3>
          <p>
            You have the right to access your information, to have it corrected, to have it erased,
            to restrict what we do with it, to object to processing we base on a legitimate
            interest, to take your information elsewhere in a portable form, and to withdraw any
            consent you have given without that affecting what came before it.
          </p>
          <p>
            <strong>One limit on erasure, and it is the one in section 10.</strong> We will delete
            everything of yours that is yours alone, on request, without asking why. We will not
            delete what you put into a thread you shared with other people, because that is also
            their information and erasing it would be erasing theirs at your request. We will always
            remove you from the thread, which takes away your membership and your access, and the
            thread and its contents are deleted when the last member leaves it. If you think that
            balance is wrong in your particular case, tell us and a person will look at it rather
            than a policy.
          </p>
          <p>
            You also have the right to complain to your data protection authority. In the UK that is
            the Information Commissioner's Office; in the EEA it is the authority for the country
            you live in. We would rather you came to us first, but it is your call.
          </p>

          <h3 className={styles.h3}>If you are in California</h3>
          <p>
            You have the right to know what we collect and why, to a copy of it, to have it deleted,
            to have it corrected, and not to be discriminated against for exercising any of that.
            You may use an authorised agent.
          </p>
          <p>
            <strong>
              We do not sell your personal information and we do not share it for cross-context
              behavioural advertising,
            </strong>{" "}
            as those terms are defined by the California Consumer Privacy Act, and we have not in
            the twelve months before the date at the top of this page. There is therefore nothing to
            opt out of, and no "do not sell" link, because there is no sale.
          </p>
          <p>
            Some of what you upload may count as sensitive personal information. We use it only to
            give you offload, which is a purpose the Act permits without a separate right to limit,
            and never to infer anything about you for anyone else.
          </p>

          <h3 className={styles.h3}>If you are elsewhere in the United States</h3>
          <p>
            Several other states now give their residents broadly the same rights. Rather than
            checking which state you are in, we apply the list above to everyone.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>15. Cookies</h2>
          <p>
            offload sets what it needs to keep you signed in and to stop the sign-in and waitlist
            being abused. That is the entire list. There is no advertising cookie, no third-party
            analytics running in your browser and nothing that follows you to another site, which is
            why this page is not interrupted by a banner asking you to accept something.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>16. Age</h2>
          <p>
            offload is for people aged 18 and over. We do not knowingly hold information about
            anyone younger, and if we find out that an account belongs to someone under 18 we delete
            it. If you think that has happened, tell us at{" "}
            <a href="mailto:hello@offload.club">hello@offload.club</a> and we will deal with it.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>17. Changes to this page</h2>
          <p>
            When we change this we change the date at the top. If a change actually matters, meaning
            it affects what we do with your content rather than how a sentence is worded, we email
            account holders before it takes effect rather than relying on you to notice.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>18. Contact</h2>
          <p>
            <a href="mailto:hello@offload.club">hello@offload.club</a>, or{" "}
            <Todo>[postal address]</Todo>.
          </p>
        </section>
      </article>

      <ScreenFooter />
    </Screen>
  );
}
