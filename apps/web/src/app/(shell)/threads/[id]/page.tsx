"use client";

// A thread, beside the list it came from.
//
// The left pane is My threads rather than whatever you happened to be looking
// at before, because the stack is derived from the route rather than
// accumulated. That is what makes this link sendable: somebody opening it cold
// gets the same two panes you did.

import { use, useCallback, useEffect, useState } from "react";
import { Panes } from "../../../../components/shell/Panes";
import { MyThreads } from "../../../../components/panes/MyThreads";
import { Thread } from "../../../../components/panes/Thread";
import { useThreads } from "../../../../components/shell/threads-context";
import { fetchThread } from "../../../../lib/threads";

export default function ThreadRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { groups, loose, order, ready, reload: reloadThreads } = useThreads();
  const [name, setName] = useState<string>("Thread");
  // 037. The crumb wears the thread's icon once the thread is read.
  const [mark, setMark] = useState<{ icon: string; hue: number } | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => {
    setNonce((n) => n + 1);
    reloadThreads();
  }, [reloadThreads]);

  // Only the thread's own name, for the crumb. The list beside it is already
  // in hand, so the pane is drawn before the animation starts.
  useEffect(() => {
    let live = true;
    void fetchThread(id).then((bundle) => {
      // 028. The default thread's name is never shown; the pane goes to Not
      // in a thread.
      if (!live || !bundle || bundle.isDefault) return;
      setName(bundle.name);
      setMark({ icon: bundle.icon, hue: bundle.hue });
    });
    return () => {
      live = false;
    };
  }, [id, nonce]);

  return (
    <Panes
      crumbs={[
        { label: "My threads", href: "/threads", icon: "message-circle" },
        { label: name, href: `/threads/${id}`, ...(mark ? { thread: { id, ...mark } } : {}) },
      ]}
      panes={[
        <MyThreads key="threads" groups={groups} loose={loose} order={order} loading={!ready} onChanged={reload} />,
        <Thread key={id} id={id} onChanged={reload} />,
      ]}
    />
  );
}
