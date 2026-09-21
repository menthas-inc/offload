"use client";

// A person as a settings row on the web. 022. The mark is a door to the
// person; the row's own click is whatever the page says it is, and opens
// the person when it says nothing.

import { useRouter } from "next/navigation";
import { Icon } from "../Icon";
import { Avatar } from "../Avatar";
import { nameOf, type Person } from "../../lib/people";
import styles from "./people.module.css";

export function PersonRow({
  person,
  note,
  value,
  onClick,
  last,
}: {
  person: Person;
  note?: string | undefined;
  value?: string | undefined;
  onClick?: (() => void) | undefined;
  last?: boolean;
}) {
  const router = useRouter();
  const open = () => router.push(`/people/${person.accountId}`);
  return (
    <div className={`${styles.personRow} ${last ? styles.personRowLast : ""}`} onClick={onClick ?? open} role="button" tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") (onClick ?? open)();
      }}
    >
      <button
        type="button"
        className={styles.door}
        onClick={(event) => {
          event.stopPropagation();
          open();
        }}
        aria-label={nameOf(person)}
      >
        <Avatar uid={person.accountId} initials={person.initials} name={person.displayName ?? undefined} size={32} />
      </button>
      <span className={styles.personText}>
        <span className={styles.personName}>{nameOf(person)}</span>
        {note ? <span className={styles.personNote}>{note}</span> : null}
      </span>
      {value ? <span className={styles.personValue}>{value}</span> : null}
      {onClick === undefined ? (
        <span className={styles.personChevron} aria-hidden="true">
          <Icon name="chevron-right" size={15} />
        </span>
      ) : null}
    </div>
  );
}
