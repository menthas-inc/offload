"use client";

// 040. Memories, from the sidebar's row.

import { Panes } from "../../../components/shell/Panes";
import { MemoriesPane } from "../../../components/panes/Memories";

export default function MemoriesRoute() {
  return (
    <Panes
      crumbs={[{ label: "Memories", href: "/memories", icon: "cloudy" }]}
      panes={[<MemoriesPane key="memories" />]}
    />
  );
}
