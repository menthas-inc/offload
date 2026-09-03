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
import { fetchOne, type ContentDetail as Detail } from "../../../../lib/threads";

export default function ContentRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => {
    let live = true;
    void fetchOne(id).then((next) => {
      if (live) setDetail(next);
    });
    return () => {
      live = false;
    };
  }, [id]);

  if (!detail) {
    return <Panes crumbs={[{ label: "…", href: `/content/${id}` }]} panes={[<div key="wait" />]} />;
  }

  return (
    <Panes
      crumbs={[
        { label: "My threads", href: "/threads" },
        { label: detail.threadName, href: `/threads/${detail.threadId}` },
        { label: detail.title, href: `/content/${id}` },
      ]}
      panes={[
        <Thread key={detail.threadId} id={detail.threadId} onChanged={() => {}} onUndo={() => {}} />,
        <ContentDetail key={id} detail={detail} />,
      ]}
    />
  );
}
