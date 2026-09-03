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
import { fetchThread, fetchThreads, type ThreadGroup } from "../../../../lib/threads";

export default function ThreadRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [groups, setGroups] = useState<ThreadGroup[]>([]);
  const [name, setName] = useState<string>("Thread");
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    void Promise.all([fetchThreads(), fetchThread(id)]).then(([next, bundle]) => {
      if (!live) return;
      setGroups(next);
      if (bundle) setName(bundle.name);
    });
    return () => {
      live = false;
    };
  }, [id, nonce]);

  return (
    <Panes
      crumbs={[
        { label: "My threads", href: "/threads" },
        { label: name, href: `/threads/${id}` },
      ]}
      panes={[
        <MyThreads key="threads" groups={groups} loading={false} />,
        <Thread key={id} id={id} onChanged={reload} onUndo={() => {}} />,
      ]}
    />
  );
}
