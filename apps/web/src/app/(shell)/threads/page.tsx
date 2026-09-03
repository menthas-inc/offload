"use client";

import { useEffect, useState } from "react";
import { Panes } from "../../../components/shell/Panes";
import { MyThreads } from "../../../components/panes/MyThreads";
import { fetchThreads, type ThreadGroup } from "../../../lib/threads";

export default function ThreadsRoute() {
  const [groups, setGroups] = useState<ThreadGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    void fetchThreads().then((next) => {
      if (!live) return;
      setGroups(next);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <Panes
      crumbs={[{ label: "My threads", href: "/threads" }]}
      panes={[<MyThreads key="threads" groups={groups} loading={loading} />]}
    />
  );
}
