"use client";

// The way into the admin panel from the app.
//
// The nav has "Back to the app"; this is the other direction, so the two are
// bidirectional rather than a one-way trip that ends in typing a URL.
//
// Moss, matching the panel's own nav, because that colour already means "this
// is the staff surface" and reusing it makes the destination obvious before
// the click. It is the only moss chrome in the app.
//
// Renders nothing for everyone else. The check is the same request the panel
// itself makes: 404 for anyone who is not staff, so a non-staff account cannot
// learn the panel exists by inspecting this component's network call.

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "../app/(app)/auth.module.css";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

export function AdminLink() {
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`${API}/v1/admin/me`, { credentials: "include" })
      .then((response) => {
        if (live && response.ok) setIsStaff(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!isStaff) return null;

  return (
    <Link href="/admin/waitlist" className={styles.adminLink}>
      admin
    </Link>
  );
}
