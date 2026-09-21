// A person's mark. 022.
//
// The design system's `Avatar`: the prism the server drew once from the
// account's id, with the initials over it in the product's type. An `<img>`
// with the session's cookie, since the route is the person's to see; until
// it loads, and when it cannot, the initials sit on the fill, which is what
// every face drew before there was a mark. Sizes are the design's five: 28,
// 32, 36, 52, 56. Never below 28.

"use client";

import { useState } from "react";
import { avatarUrl, rememberedMark } from "../lib/people";
import styles from "./avatar.module.css";

export type AvatarSize = 28 | 32 | 36 | 52 | 56;

export function Avatar({
  uid,
  initials,
  name,
  size = 36,
}: {
  uid: string;
  initials: string;
  name?: string | undefined;
  size?: AvatarSize;
}) {
  const [failed, setFailed] = useState(false);
  const fontSize = Math.round(size * 0.36);
  return (
    <span
      className={styles.avatar}
      style={{ width: size, height: size }}
      role="img"
      aria-label={name ?? "Someone"}
      data-size={size}
    >
      {failed ? null : (
        <img
          className={styles.mark}
          src={rememberedMark(uid) ?? avatarUrl(uid)}
          alt=""
          width={size}
          height={size}
          onError={() => setFailed(true)}
          draggable={false}
        />
      )}
      <span className={styles.initials} data-plain={failed ? "" : undefined} style={{ fontSize }} aria-hidden="true">
        {initials}
      </span>
    </span>
  );
}
