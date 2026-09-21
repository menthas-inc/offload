"use client";

// @ picks a person. 022. The web kit's `WMentions`: the same list as the
// share modal, filtered as you keep typing, three rows at a time, each a
// mark at 28 and the name. Picking one puts the name in the text and
// resolves it to the person; an @ that matches nobody stays plain text.

import { Avatar } from "../Avatar";
import { nameOf, type Person } from "../../lib/people";
import styles from "./people.module.css";

/** The @ token at the end of the text, or null: "share it with @Sa" gives
 *  "Sa"; "ana@example.com" gives nothing, since the @ has a word before it. */
export function mentionQuery(text: string): string | null {
  const match = /(^|\s)@([^\s@]*)$/.exec(text);
  return match ? (match[2] ?? "") : null;
}

export function withMention(text: string, name: string): string {
  return text.replace(/(^|\s)@([^\s@]*)$/, (_, lead: string) => `${lead}${name} `);
}

export function Mentions({ people, query, onPick }: { people: Person[]; query: string; onPick: (person: Person) => void }) {
  const needle = query.trim().toLowerCase();
  const shown = people.filter((p) => !needle || nameOf(p).toLowerCase().includes(needle)).slice(0, 3);
  if (shown.length === 0) return null;
  return (
    <div className={styles.mentions} role="listbox" aria-label="People">
      {shown.map((person) => (
        <button
          key={person.accountId}
          type="button"
          role="option"
          aria-selected={false}
          className={styles.mentionRow}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(person)}
        >
          <Avatar uid={person.accountId} initials={person.initials} name={person.displayName ?? undefined} size={28} />
          <span>{nameOf(person)}</span>
        </button>
      ))}
    </div>
  );
}
