"use client";

// One piece of content, beside the thread it is in.
//
// The thread has to be known before the left pane can render, so this waits for
// the detail rather than guessing. A piece of content is a place you can link
// to, which is the same reason a thread is.

import { DEFAULT_THREAD_ICON } from "@offload/widgets";
import { use, useEffect, useState } from "react";
import { Panes } from "../../../../components/shell/Panes";
import { Thread } from "../../../../components/panes/Thread";
import { ContentDetail } from "../../../../components/panes/ContentDetail";
import { LoosePane } from "../../../../components/loose/LoosePane";
import { useToast } from "../../../../components/shell/Toast";
import { completeContent, fetchOne, type ContentDetail as Detail } from "../../../../lib/threads";

export default function ContentRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [nonce, setNonce] = useState(0);
  const toast = useToast();

  useEffect(() => {
    let live = true;
    void fetchOne(id).then((next) => {
      if (live) setDetail(next);
    });
    return () => {
      live = false;
    };
  }, [id, nonce]);

  /** Tick, or put it back. Drawn at the press; the thread beside it reloads
   *  once the server agrees, and the tick comes off with a word if it does
   *  not. */
  async function toggle(): Promise<void> {
    if (!detail) return;
    const done = detail.doneAt === null;
    setDetail({ ...detail, doneAt: done ? new Date().toISOString() : null });
    if (await completeContent(detail.id, done)) return setNonce((n) => n + 1);
    setDetail(detail);
    toast.show(done ? "Couldn't tick that off" : "Couldn't put that back", {
      label: "Retry",
      onPress: () => toggle(),
    });
  }

  if (!detail) {
    return <Panes crumbs={[{ label: "…", href: `/content/${id}` }]} panes={[<div key="wait" />]} />;
  }

  // 028. A row not in a thread stands beside Not in a thread, never beside a
  // thread page for the default thread, which is drawn nowhere.
  const loose = detail.threadName === null;

  return (
    <Panes
      crumbs={[
        { label: "My threads", href: "/threads", icon: "message-circle" },
        loose
          ? { label: "Not in a thread", href: "/threads/loose" }
          : {
              label: detail.threadName ?? "",
              href: `/threads/${detail.threadId}`,
              thread: { id: detail.threadId, icon: detail.threadIcon ?? DEFAULT_THREAD_ICON, hue: detail.threadHue ?? 1 },
            },
        { label: detail.title, href: `/content/${id}`, icon: "text-quote" },
      ]}
      panes={[
        loose ? (
          <LoosePane key={`loose-${nonce}`} type={null} onChanged={() => setNonce((n) => n + 1)} />
        ) : (
          <Thread
            key={`${detail.threadId}-${nonce}`}
            id={detail.threadId}
            onChanged={() => setNonce((n) => n + 1)}
          />
        ),
        <ContentDetail key={id} detail={detail} onToggle={() => void toggle()} />,
      ]}
    />
  );
}
