// The companies that process data for offload, on their own page with their
// own date (2026-10-05). The privacy policy names kinds of companies and how
// they are bound, and links here, so adding or changing one moves this date
// and not the policy's. A change that materially changes how content is
// handled is still emailed to account holders first, as the policy says.
//
// Corrected against the audit of 2026-10-05: Voyage embeds the words of a
// search too; for a linked site our server fetches the page; sign-in and maps
// act for themselves, so the contract sentence leaves them out. The web map is
// behind an admin switch and off in production, so its row says the web only
// when it is on.

import type { Metadata } from "next";
import { Screen, ScreenFooter, ScreenHeader, screenStyles } from "../../../../components/Screen";
import styles from "../privacy.module.css";

export const metadata: Metadata = {
  title: "Companies we use · offload",
  description: "The companies that help run offload, what each does, and what each receives.",
};

const UPDATED = "7 October 2026";

/** Company, what for, what they receive. Marked `self` when it acts for itself. */
const COMPANIES: { name: string; does: string; receives: string; self?: true }[] = [
  { name: "Railway", does: "Runs our servers and our database", receives: "Everything offload holds, because it is where offload runs" },
  {
    name: "Cloudflare R2",
    does: "Stores files, backups and exports",
    receives:
      "Your photos, screenshots, voice notes and the pictures from email you forward, our backups and your exports, all encrypted with keys it never receives; and product events, which carry no content",
  },
  {
    name: "Anthropic",
    does: "The AI models that sort, read and answer, and the web searches and link reading they do",
    receives: "The part of your content a task needs, and the words of a search",
  },
  {
    name: "Voyage AI",
    does: "Makes what offload holds searchable, lays out your memories by meaning and finds the ones a message needs",
    receives:
      "The text being indexed, your memories, the words of a search inside offload, and your own words in a message or a thread's name and your notes in it, to find the memories it needs",
  },
  { name: "AssemblyAI", does: "Transcribes voice notes, on its servers in the European Union", receives: "The audio of a voice note" },
  {
    name: "Resend",
    does: "Sends the emails we send, and receives email you forward to offload",
    receives:
      "Your email address, the emails we send you, and the email you forward, which it keeps as received, attachments included, for 30 days and then deletes",
  },
  {
    name: "Expo",
    does: "Builds the phone apps, updates them, and sends notifications",
    receives: "Your IP address and app version when the app opens, the words of each notification, and the token that names your phone",
  },
  { name: "Google Workspace", does: "Our email at hello@offload.club", receives: "What you write to us" },
  {
    name: "Apple and Google",
    does: "Sign you in, and deliver notifications to your phone",
    receives: "They tell us your email address and name. The words of a notification pass through them",
    self: true,
  },
  {
    name: "Google Calendar",
    does: "Only if you connect one: the calendars you choose, and the changes you ask for",
    receives: "The events offload writes for you. Your calendar is in your own Google account, under Google's terms",
    self: true,
  },
  {
    name: "Google Maps Platform",
    does: "Maps on the phones, and on the web when it is turned on; finding places by name",
    receives:
      "A place's name, on its own, with nothing about who asked. From your device while a map is on screen, your IP address and device details. Acts for itself under its own terms, which let it keep this and use it to improve its products",
    self: true,
  },
];

export default function Companies() {
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
        <h1 className={styles.title}>Companies we use</h1>
        <p className={styles.standfirst}>
          The companies that help run offload, what each does and what each receives. The{" "}
          <a href="/privacy">privacy policy</a> says how they are bound.
        </p>

        <section className={styles.section}>
          <div className={styles.scroller}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Company</th>
                  <th scope="col">What for</th>
                  <th scope="col">What they receive</th>
                </tr>
              </thead>
              <tbody>
                {COMPANIES.map((company) => (
                  <tr key={company.name}>
                    <td>{company.name}</td>
                    <td>{company.does}</td>
                    <td>{company.receives}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Each company above processes data only to provide its service to us, under terms that
            require it to protect that data, except the ones marked as acting for themselves:{" "}
            {COMPANIES.filter((company) => company.self)
              .map((company) => company.name)
              .join(", ")
              .replace(/, ([^,]*)$/, " and $1")}
            .
          </p>
          <p>
            <strong>The site a link points to</strong> is not one of ours. When offload reads a link
            you pasted, our server fetches the page, and your device may ask the site for its
            preview picture, which shows it your IP address. Its own policy applies.
          </p>
        </section>
      </article>

      <ScreenFooter />
    </Screen>
  );
}
