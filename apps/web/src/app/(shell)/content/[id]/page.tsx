"use client";

// One piece of content, beside the thread it is in.
//
// The thread has to be known before the left pane can render, so this waits for
// the detail rather than guessing. A piece of content is a place you can link
// to, which is the same reason a thread is.

import { use, useEffect, useState } from "react";
import { Panes } from "../../../../components/shell/Panes";
import { Thread } from "../../../../components/panes/Thread";
import { ContentDetail } from "../../../../components/panes/ContentDetail";
import { completeContent, fetchOne, type ContentDetail as Detail } from "../../../../lib/threads";

export default function ContentRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    void fetchOne(id).then((next) => {
      if (live) setDetail(next);
    });
    return () => {
      live = false;
    };
  }, [id, nonce]);

  async function toggle(): Promise<void> {
    if (!detail) return;
    if (await completeContent(detail.id, detail.doneAt === null)) setNonce((n) => n + 1);
  }

  if (!detail) {
    return <Panes crumbs={[{ label: "…", href: `/content/${id}` }]} panes={[<div key="wait" />]} />;
  }

  return (
    <Panes
      crumbs={[
        { label: "My threads", href: "/threads", icon: "message-circle" },
        { label: detail.threadName, href: `/threads/${detail.threadId}`, icon: "lasso" },
        { label: detail.title, href: `/content/${id}`, icon: "text-quote" },
      ]}
      panes={[
        <Thread
          key={`${detail.threadId}-${nonce}`}
          id={detail.threadId}
          onChanged={() => setNonce((n) => n + 1)}
          onUndo={() => {}}
        />,
        <ContentDetail key={id} detail={detail} onToggle={() => void toggle()} />,
      ]}
    />
  );
}
