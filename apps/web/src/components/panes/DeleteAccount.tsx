"use client";

// 035. Delete your account: the kit's danger panel at the foot of My account
// (`WSettings.jsx`, `SDanger`), and the confirmation the kit does not draw.
//
// The panel is the kit's, in the semantic danger tokens rather than its ramps.
// The confirmation is the people Modal the other destructive actions use, with
// one addition: a word to type, because this is the one action here that
// nothing brings back (OFF-6). The server checks the word again.
//
// No state here explains itself. A failure says what happened beside Try
// again; the last staff owner is told what to do first and offered nothing to
// press, since pressing again would get the same answer.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../people/Modal";
import { deleteAccount } from "../../lib/delete-account";
import modal from "../people/people.module.css";
import pane from "../../app/(shell)/shell.module.css";

const WORD = "delete";

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  return (
    <div className={pane.dangerPanel} role="group" aria-label="Delete your account">
      <p className={pane.dangerLabel}>Delete your account</p>
      <p className={pane.dangerBody}>
        A shared thread belongs to everyone in it. Deleting your account takes away your access and what only you could
        see, and leaves what you added with the others. Everything only you can see goes with it. There&apos;s no undo.
      </p>
      <button type="button" className={modal.danger} onClick={() => setOpen(true)}>
        Delete account
      </button>
      {open ? <Confirm onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function Confirm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [word, setWord] = useState("");
  const [state, setState] = useState<"idle" | "deleting" | "failed" | "last_owner">("idle");
  const matches = word.trim().toLowerCase() === WORD;
  const busy = state === "deleting";

  async function go(): Promise<void> {
    if (!matches || busy) return;
    setState("deleting");
    const outcome = await deleteAccount(word);
    if (outcome === "done") {
      router.replace("/sign-in?deleted=1");
      return;
    }
    if (outcome === "signed_out") {
      router.replace("/sign-in");
      return;
    }
    setState(outcome);
  }

  return (
    // Not dismissible while the delete is in flight: closing it would leave a
    // page that looks signed in over an account that may be gone.
    <Modal label="Delete your account" onClose={busy ? () => undefined : onClose}>
      <h2 className={modal.modalTitle}>Delete your account</h2>
      <p className={modal.modalBody}>
        Deleting your account takes away your access and what only you could see, and leaves what you added with the
        others in any thread you share. It can&apos;t be undone.
      </p>
      {state === "last_owner" ? (
        <p className={modal.failed} role="alert">
          Hand offload&apos;s ownership to someone else first.
        </p>
      ) : (
        <>
          {/* Above the field, not in it: a placeholder is gone at the first
              keystroke, and with it the only line that names the word. */}
          <label className={modal.fieldLabel} htmlFor="delete-word">
            Type delete to confirm
          </label>
          <input
            id="delete-word"
            className={modal.field}
            aria-label="Type delete to confirm"
            value={word}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            onChange={(event) => setWord(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void go();
            }}
          />
          {state === "failed" ? (
            <p className={modal.failed} role="alert">
              Couldn&apos;t delete your account
            </p>
          ) : null}
        </>
      )}
      <div className={modal.modalActions}>
        <button type="button" className={modal.ghost} onClick={onClose} disabled={busy}>
          {state === "last_owner" ? "Close" : "Cancel"}
        </button>
        {state === "last_owner" ? null : (
          <button type="button" className={modal.danger} onClick={() => void go()} disabled={!matches || busy}>
            {busy ? "Deleting" : state === "failed" ? "Try again" : "Delete account"}
          </button>
        )}
      </div>
    </Modal>
  );
}
