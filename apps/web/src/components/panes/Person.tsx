"use client";

// A person, as a pane. 022.
//
// The web kit's `WPerson`, without its Message tool, which has nothing
// behind it, and with "Shared with Ana" for the heading the kit calls
// *Things you share*. The kit's Between you and What offload knows sections
// are not drawn: nothing writes who a row is waiting on and nothing writes a
// memory about a person yet. More holds what applies: Remove connection for
// a connection, Block for anybody not blocked, Unblock for somebody blocked.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "../Icon";
import { Avatar } from "../Avatar";
import { PaneHead, type MoreAction } from "../shell/PaneHead";
import { ConfirmModal } from "../people/Modal";
import { refreshMe } from "../../lib/use-me";
import { blockPerson, fetchPerson, firstNameOf, nameOf, removeConnection, unblockPerson, type PersonPage } from "../../lib/people";
import pane from "../../app/(shell)/shell.module.css";
import styles from "../people/people.module.css";

function relationLine(page: PersonPage): string {
  switch (page.relation) {
    case "connected":
      return page.shared.length === 0
        ? "Connected"
        : `Shares ${page.shared.length} ${page.shared.length === 1 ? "thread" : "threads"} with you`;
    case "asked_you":
      return "Asked to connect";
    case "you_asked":
      return "You asked to connect";
    case "blocked":
      return "Blocked";
    case "thread":
      return page.shared.length === 1 ? `In ${page.shared[0]!.name} with you` : `In ${page.shared.length} threads with you`;
    case "waiting":
      return "Waiting on a share";
  }
}

function threadMeta(thread: { count: number; lastActivityAt: string }): string {
  const days = (Date.now() - new Date(thread.lastActivityAt).getTime()) / 86_400_000;
  return `${thread.count} · ${days < 30 ? "active" : "quiet"}`;
}

export function PersonPane({ id }: { id: string }) {
  const router = useRouter();
  const [page, setPage] = useState<PersonPage | "gone" | null>(null);
  const [confirm, setConfirm] = useState<"remove" | "block" | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const [loadFailed, setLoadFailed] = useState(false);
  const load = useCallback(async () => {
    setLoadFailed(false);
    const next = await fetchPerson(id);
    if (next === null) setLoadFailed(true);
    else setPage(next);
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  const more: MoreAction[] = [];
  if (page && page !== "gone") {
    if (page.relation === "connected") more.push({ label: "Remove connection", icon: "x", onSelect: () => setConfirm("remove") });
    if (page.relation === "blocked") {
      more.push({
        label: "Unblock",
        icon: "check",
        onSelect: () => {
          void unblockPerson(page.accountId).then((ok) => (ok ? load() : setLoadFailed(true)));
        },
      });
    } else more.push({ label: "Block", icon: "lock", onSelect: () => setConfirm("block") });
  }

  async function act() {
    if (!page || page === "gone" || !confirm) return;
    setBusy(true);
    setFailed(false);
    const ok = confirm === "remove" ? await removeConnection(page.accountId) : await blockPerson(page.accountId);
    setBusy(false);
    if (!ok) {
      setFailed(true);
      return;
    }
    setConfirm(null);
    void refreshMe();
    if (confirm === "remove") router.push("/settings/people");
    else await load();
  }

  const first = page && page !== "gone" ? firstNameOf(page) : "";
  const count = page && page !== "gone" ? page.shared.length : 0;
  const threads = count === 1 ? "thread" : "threads";

  return (
    <>
      {/* The kit's `WPerson` head, with the mark at 52 beside the name, as
          the design draws a person's page. */}
      <PaneHead
        title={
          page && page !== "gone" ? (
            <span className={styles.personTitle}>
              <Avatar uid={page.accountId} initials={page.initials} name={page.displayName ?? undefined} size={52} />
              <span>{nameOf(page)}</span>
            </span>
          ) : (
            ""
          )
        }
        sub={page && page !== "gone" ? relationLine(page) : undefined}
        more={more.length > 0 ? more : undefined}
      />
      <div className={pane.paneBody}>
        {loadFailed ? (
          <p className={pane.signOutFailed} role="alert">
            That didn&rsquo;t go through.{" "}
            <button type="button" className={pane.retryQuiet} onClick={() => void load()}>
              Try again
            </button>
          </p>
        ) : null}
        {page === "gone" ? <p className={styles.gone}>Not here any more.</p> : null}
        {page && page !== "gone" ? (
          <>
            {page.shared.length === 0 ? (
              <p className={styles.gone} style={{ textAlign: "left", padding: "var(--space-4) 0" }}>
                {page.relation === "connected" ? `Open a thread and click Share to bring ${first} into it.` : `Nothing shared with ${first} yet.`}
              </p>
            ) : (
              <>
                <h2 className={pane.section}>
                  Shared with {first}
                  <em className={pane.sectionCount}>{page.shared.length}</em>
                </h2>
                {page.shared.map((thread) => (
                  <Link key={thread.id} href={`/threads/${thread.id}`} className={pane.row}>
                    <span className={pane.rowIcon}>
                      <Icon name="lasso" size={18} />
                    </span>
                    <span className={pane.rowText}>
                      <span className={pane.rowTitle}>{thread.name}</span>
                      <span className={pane.rowMeta}>{threadMeta(thread)}</span>
                    </span>
                  </Link>
                ))}
              </>
            )}
          </>
        ) : null}
      </div>
      {confirm && page && page !== "gone" ? (
        <ConfirmModal
          title={confirm === "block" ? `Block ${nameOf(page)}?` : `Remove ${nameOf(page)}?`}
          body={
            confirm === "block"
              ? `${first} will not be able to ask to connect with you again.${
                  count > 0 ? ` The ${count} ${threads} you already share ${count === 1 ? "stays as it is" : "stay as they are"}, and` : ""
                } ${first} can still be in a thread you share if somebody else brings them in.`
              : `You will not be able to share anything new with ${first}, and ${first} will not be able to share with you.${
                  count > 0 ? ` The ${count} ${threads} you already share ${count === 1 ? "stays as it is" : "stay as they are"}.` : ""
                }`
          }
          rows={confirm === "remove" ? page.shared.map((t) => ({ title: t.name, meta: threadMeta(t), icon: <Icon name="lasso" size={16} /> })) : []}
          rowCount={confirm === "remove" ? count : 0}
          hint={confirm === "remove" && count > 0 ? "Leave a thread from its own More menu if you want out of it." : undefined}
          action={confirm === "block" ? "Block" : "Remove"}
          danger
          busy={busy}
          failed={failed}
          onConfirm={() => void act()}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </>
  );
}
