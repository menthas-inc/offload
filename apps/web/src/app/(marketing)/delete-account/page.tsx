// How to delete an offload account, for somebody who does not have the app
// open. 035.
//
// Play asks for a web address where deletion can be started without the app,
// and this is it. It is the same page for every visitor and it takes nothing:
// a field for an address would answer whether that address has an account.
// The deleting itself happens signed in, in Settings, behind a typed word.
//
// Everything this page says about what goes and what stays has to agree with
// the privacy page beside it.

import type { Metadata } from "next";
import { Screen, ScreenFooter, ScreenHeader, screenStyles } from "@/components/Screen";
import styles from "../privacy/privacy.module.css";

export const metadata: Metadata = {
  title: "Delete your account · offload",
  description: "How to delete an offload account, what goes with it, and what stays.",
};

export default function DeleteAccount() {
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
        <h1 className={styles.title}>Delete your account</h1>
        <p className={styles.standfirst}>
          You can delete your offload account yourself, in the app or here on the web. It happens at once and it
          can&apos;t be undone.
        </p>

        <section className={styles.section}>
          <h2 className={styles.h2}>How</h2>
          <ul>
            <li>
              <strong>On the web.</strong> <a href="/sign-in">Sign in</a>, open Settings, then My account, and choose
              Delete account at the foot of the page.
            </li>
            <li>
              <strong>On a phone.</strong> Open Settings, then My account, then Delete account.
            </li>
          </ul>
          <p>You are asked to type a word to confirm, and then it is done.</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>What goes</h2>
          <p>
            Everything only you could see: your threads that nobody else is in and all they hold, your conversations
            with offload, what offload noted about you, your calendar connection, which is also revoked at Google, and
            your sign-in on every device. It leaves our live systems at once and our backups within 30 days.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>What stays</h2>
          <p>
            A thread you shared belongs to everyone in it. Deleting your account takes away your access and leaves
            what you added with the others, with no name on it. <a href="/privacy">The privacy page</a> says why.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>If you can&apos;t sign in</h2>
          <p>
            If you are on the waitlist and have no account yet, or you can no longer sign in, write to{" "}
            <a href="mailto:hello@offload.club">hello@offload.club</a> from the address you used and we will remove
            it.
          </p>
        </section>
      </article>

      <ScreenFooter />
    </Screen>
  );
}
