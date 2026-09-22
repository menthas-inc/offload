"use client";

import { use } from "react";
import { Panes } from "../../../../components/shell/Panes";
import { PersonPane } from "../../../../components/panes/Person";

export default function PersonRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Panes
      crumbs={[
        { label: "Settings", href: "/settings", icon: "settings" },
        { label: "My people", href: "/settings/people", icon: "users" },
      ]}
      panes={[<PersonPane key={id} id={id} />]}
    />
  );
}
