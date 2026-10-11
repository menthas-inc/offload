"use client";

// 040. Memories, from the sidebar's row. 042: a door's `?memory=` (MEMORY_PARAM) opens that
// memory, which Today's Reminders links.

import { useSearchParams } from "next/navigation";
import { MEMORY_PARAM } from "@offload/widgets";
import { Panes } from "../../../components/shell/Panes";
import { MemoriesPane } from "../../../components/panes/Memories";

export default function MemoriesRoute() {
  const search = useSearchParams();
  return (
    <Panes
      crumbs={[{ label: "Memories", href: "/memories", icon: "cloudy" }]}
      panes={[<MemoriesPane key="memories" openId={search.get(MEMORY_PARAM)} />]}
    />
  );
}
