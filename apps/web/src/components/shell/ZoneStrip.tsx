"use client";

// The one place the browser's own zone appears. 023.
//
// On Today, when the browser's zone differs from the account's clock, follow
// is on and this zone is not the one they answered Keep to. `InvitationStrip`'s
// shape: the soft accent ground, a compass in a 28px disc, one sentence, and
// both answers inside the card as text buttons.
//
// It states the fact before it offers the change, so ignoring it is a
// complete answer. Use writes the clock, and the server clears what was kept
// with it; Keep writes this zone as kept, so a two-week trip asks on arrival
// and stays quiet, and a third zone asks again. Both draw first and write
// second: a failed write puts the strip back with one clause, and the same
// two answers are the way to try again. Cities, never offsets.

import { useEffect, useState } from "react";
import { zoneCity, zoneStrip } from "@offload/widgets";
import { Icon } from "../Icon";
import { deviceZone } from "../../lib/clock";
import { currentMe, onMe, updateClock, type Me } from "../../lib/use-me";
import styles from "../../app/(shell)/today.module.css";

export function ZoneStrip() {
  // The identity the shell already asked for, heard rather than fetched again.
  const [me, setMe] = useState<Me | null>(currentMe());
  useEffect(() => onMe(setMe), []);
  const [answered, setAnswered] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const strip = me ? zoneStrip(me, deviceZone()) : null;
  if (!strip || answered === strip.device) return null;

  const here = zoneCity(strip.device);
  const clock = zoneCity(strip.account);
  const device = strip.device;

  async function answer(patch: { timeZone: string } | { keptTimeZone: string }) {
    setAnswered(device);
    setFailed(false);
    if (!(await updateClock(patch))) {
      setAnswered(null);
      setFailed(true);
    }
  }

  return (
    <div className={styles.zoneStrip}>
      <div className={styles.zoneLine}>
        <span className={styles.zoneDisc} aria-hidden="true">
          <Icon name="compass" size={15} />
        </span>
        <p className={styles.zoneText}>
          Showing times in <b>{clock}</b>. This browser says <b>{here}</b>.
        </p>
      </div>
      {failed ? <p className={styles.zoneFailed}>Couldn&apos;t save that.</p> : null}
      <div className={styles.zoneAnswers}>
        <button type="button" className={styles.zoneAnswer} onClick={() => void answer({ timeZone: device })}>
          Use {here}
        </button>
        <button
          type="button"
          className={`${styles.zoneAnswer} ${styles.zoneKeep}`}
          onClick={() => void answer({ keptTimeZone: device })}
        >
          Keep {clock}
        </button>
      </div>
    </div>
  );
}
