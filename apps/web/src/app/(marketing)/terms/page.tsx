// The terms.
//
// Written the way the privacy page is: from what the product does, not from a
// template, and short enough to be read. Not reviewed by a lawyer. It names no
// governing law on purpose (owner, 2026-10-03): offload is not incorporated
// yet, and a clause naming a state would be a guess.
//
// It shares the privacy page's stylesheet because it is the same kind of
// page. Anything this page says about content has to agree with that one;
// where they could disagree, this page points there instead of restating it.

import type { Metadata } from "next";
import { Screen, ScreenFooter, ScreenHeader, screenStyles } from "../../../components/Screen";
import styles from "../privacy/privacy.module.css";

export const metadata: Metadata = {
  title: "Terms · offload",
  description: "What you can expect from offload, and what offload expects from you.",
};

const UPDATED = "5 October 2026";

const MAIL = <a href="mailto:hello@offload.club">hello@offload.club</a>;


export default function Terms() {
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
        <h1 className={styles.title}>Terms</h1>
        <p className={styles.standfirst}>
          What you can expect from offload, and what offload expects from you. You agree to these
          terms when you tick the box in first run, and by using offload.
        </p>

        <section className={styles.section}>
          <h2 className={styles.h2}>1. Who we are</h2>
          <p>
            offload is an assistant for organising thoughts and information. You put things in and
            offload files them into threads. It is not a company yet. It is run by Behrooz Afghahi,
            an individual in the United States, and this page will name the company when there is
            one. Write to us at {MAIL}.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>2. Who can use it</h2>
          <p>
            offload is invite only, for people aged 18 and over, and only offered in the United
            States. You sign in with Apple or Google, and the account is for one person. Keep that
            sign-in to yourself: what happens through your account is treated as coming from you.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>3. What you put in is yours</h2>
          <p>
            You keep every right you have in what you put in. You give offload permission to store
            it, process it and show it back to you and to the people you share a thread with, for
            the one purpose of running offload for you. That permission ends when the content is
            deleted, apart from the backups and the shared threads that{" "}
            <a href="/privacy">the privacy policy</a> describes.
          </p>
          <p>
            What offload does with your content, who else handles it and how long it is kept are
            all in the privacy policy. Where these terms and the policy differ about your content,
            the policy counts.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>4. Sharing a thread</h2>
          <p>
            A thread you share belongs to everyone in it. The others can read what you add, and it
            stays with them if you leave or delete your account. Only put into a shared thread
            what you are happy for its members to keep.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>5. What you agree not to do</h2>
          <ul>
            <li>Put in anything you have no right to, or anything that is illegal where you are.</li>
            <li>Put in sexual content involving minors, or malware.</li>
            <li>Use offload to harass anyone, or to store information about people in order to harm them.</li>
            <li>Try to get into an account, a thread or a system that is not yours, or probe other people&apos;s accounts.</li>
            <li>Try to extract or override offload&apos;s instructions, or make it act against the people it works for.</li>
            <li>Use offload in a way the usage policies of the AI companies it relies on do not allow.</li>
            <li>Send automated traffic, or resell or rehost offload.</li>
          </ul>
          <p>
            We can suspend or close an account that does any of these, and report what the law
            requires us to report.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>6. offload can be wrong</h2>
          <p>
            offload uses AI models to read what you put in, to file it and to answer you. It makes
            mistakes: a date read wrongly, something filed in the wrong thread, an answer that is
            not right. Everything it files can be corrected. Check anything that matters before you
            rely on it. You are responsible for how you use what offload produces.
          </p>
          <p>
            offload is not a doctor, a lawyer or a financial adviser, and nothing it says is
            professional advice.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>7. Apps you connect</h2>
          <p>
            You can connect a Google calendar. offload reads and writes there only as the privacy
            policy describes, and you can disconnect it at any time. Your use of Google&apos;s and
            Apple&apos;s services stays under their terms, not these.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>8. A beta, and free for now</h2>
          <p>
            offload is a beta. It changes often, parts of it may break or go away, and it may be
            unavailable at times. There are limits on how much each account can use in a day and
            on how much it can store. It costs nothing today. If that changes, we will say so
            before anything is charged, and nothing will be charged without you agreeing to it.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>9. Ending things</h2>
          <p>
            You can stop using offload whenever you like, and delete your account yourself in
            Settings, or ask us to at {MAIL}.
          </p>
          <p>
            We may suspend or close an account, or end offload, if these terms are broken, to keep
            offload or other people safe, if the law requires it, or for any other reason with
            notice. Unless the law or someone&apos;s safety prevents it, you get time to take a copy
            of what you put in first.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>10. What we do not promise</h2>
          <p>
            We work to keep offload running and what you put in safe, and the privacy policy says
            how. Beyond that, offload is provided as it is, without warranties of any kind, as far
            as the law allows.
          </p>
          <p>
            As far as the law allows, we are not liable for indirect or consequential losses, or
            for lost data, profits or opportunities, that come from using offload or being unable
            to, and our total liability for any claim about offload is limited to the greater of
            what you paid us in the 12 months before the claim and 100 US dollars. Nothing here
            limits a right you have by law that cannot be limited.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>11. If you got offload from the App Store</h2>
          <p>
            Apple&apos;s standard licensed application end user licence agreement applies too,
            alongside these terms. You can read it on{" "}
            <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">Apple&apos;s site</a>.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>12. Changes to these terms</h2>
          <p>
            When we change these terms we change the date at the top. If a change matters, it takes
            effect 14 days after we email account holders about it. Using offload after that means
            you accept the change; if you do not, you can take a copy and delete your account.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>13. The rest</h2>
          <p>
            We may transfer these terms to a company set up to run offload, or to a buyer bound by
            the privacy policy. If part of these terms cannot be enforced, the rest still applies.
            These terms and the privacy policy are the whole agreement between us about offload,
            and not enforcing a part of them straight away does not mean giving it up.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>14. Contact</h2>
          <p>{MAIL}</p>
        </section>
      </article>

      <ScreenFooter />
    </Screen>
  );
}
