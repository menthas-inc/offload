"use client";

// 028. Not in a thread, beside the list it came from, as a thread is.
//
// Its own directory so it wins over `[id]`. The chip that was on in the group
// arrives as `type`, and the pane opens filtered to it. Keyed by it, so a
// second link with another chip starts the list again.

import { useSearchParams } from "next/navigation";
import { Panes } from "../../../../components/shell/Panes";
import { MyThreads } from "../../../../components/panes/MyThreads";
import { LoosePane } from "../../../../components/loose/LoosePane";
import { useThreads } from "../../../../components/shell/threads-context";
import { CHIPS, type ChipKey } from "../../../../lib/loose";
import { ARCHIVED_PARAM, ROW_PARAM } from "@offload/widgets";

export default function LooseRoute() {
  const { groups, loose, invitations, order, ready, reload } = useThreads();
  const params = useSearchParams();
  const asked = params.get("type");
  const type: ChipKey | null = CHIPS.find((chip) => chip.key === asked)?.key ?? null;

  return (
    <Panes
      crumbs={[
        { label: "Threads", href: "/threads", icon: "message-circle" },
        { label: "Not in a thread", href: "/threads/loose" },
      ]}
      panes={[
        <MyThreads key="threads" groups={groups} loose={loose} invitations={invitations} order={order} loading={!ready} onChanged={reload} />,
        <LoosePane key={type ?? "all"} type={type} onChanged={reload} at={params.get(ROW_PARAM)} atArchived={params.get(ARCHIVED_PARAM) === "1"} />,
      ]}
    />
  );
}
