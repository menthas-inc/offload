"use client";

import { Panes } from "../../../components/shell/Panes";
import { MyThreads } from "../../../components/panes/MyThreads";
import { useThreads } from "../../../components/shell/threads-context";

export default function ThreadsRoute() {
  // From the shell, which already has it. Fetching a second copy here is what
  // made navigating flash.
  const { groups, invitations, loose, order, ready, reload } = useThreads();

  return (
    <Panes
      crumbs={[{ label: "My threads", href: "/threads", icon: "message-circle" }]}
      panes={[<MyThreads key="threads" groups={groups} loose={loose} invitations={invitations} order={order} loading={!ready} onChanged={reload} />]}
    />
  );
}
