// The three first-run illustrations, from ui_kits/web_app/WFirstRunGate.jsx.
//
// They are the screens' argument, not decoration: dumps going in, things coming
// out, and one notification that earned its interruption. Without them the
// three screens are three sentences.

import styles from "../app/(app)/auth.module.css";

const DUMPS = [
  "Ana can only travel the 14th to the 17th",
  "€214 for the flights",
  "matte black, 30cm",
  "dentist after the 20th",
] as const;

const THINGS = [
  // The count carries no unit, matching the phones. It read "4 things", and
  // "thing" is not a word the product says any more.
  ["lasso", "Lisbon trip", "4"],
  ["bookmark", "Bookshelf build", "2"],
  ["cloudy", "Read later", "23"],
] as const;

/** Three icons at 17px, drawn to the same weight as the rest of the set. */
function ThingIcon({ name }: { name: string }) {
  const common = {
    width: 17,
    height: 17,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "lasso") {
    return (
      <svg {...common}>
        <ellipse cx="12" cy="9" rx="8" ry="5.5" />
        <path d="M8 13.8c-1 .7-1.5 1.5-1.5 2.4 0 1.9 2.5 3.5 5.5 3.5" />
      </svg>
    );
  }
  if (name === "bookmark") {
    return (
      <svg {...common}>
        <path d="M6.5 4h11v16l-5.5-4-5.5 4z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M7 18h10a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6 1.3A3.4 3.4 0 0 0 7 18z" />
    </svg>
  );
}

export function RunArt({ kind }: { kind: "bubbles" | "threads" | "notification" }) {
  if (kind === "bubbles") {
    return (
      <div className={styles.art}>
        {DUMPS.map((text, index) => (
          <span key={text} className={`${styles.bubble} ${index % 2 ? styles.bubbleRight : ""}`}>
            {text}
          </span>
        ))}
      </div>
    );
  }

  if (kind === "threads") {
    return (
      <div className={styles.art}>
        {THINGS.map(([icon, name, meta]) => (
          <span key={name} className={styles.thingRow}>
            <span className={styles.thingIcon}>
              <ThingIcon name={icon} />
            </span>
            <span className={styles.thingName}>{name}</span>
            <span className={styles.thingMeta}>{meta}</span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.notification}>
      <div style={{ flex: 1 }}>
        <div className={styles.notificationApp}>
          <span>offload</span>
          <span>now</span>
        </div>
        <div className={styles.notificationTitle}>Brackets go up Friday</div>
        <div className={styles.notificationBody}>You saved the link on Tuesday.</div>
      </div>
    </div>
  );
}
