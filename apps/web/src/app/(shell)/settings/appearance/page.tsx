"use client";

// Settings, Appearance. One pane: there is no settings index yet, and the nav
// foot's Settings row comes straight here because Appearance is the only page
// that exists. When there is an index, this becomes the second pane behind it.

import { Panes } from "../../../../components/shell/Panes";
import { AppearancePane } from "../../../../components/panes/Appearance";

export default function AppearanceRoute() {
  return (
    <Panes
      crumbs={[
        { label: "Settings", href: "/settings/appearance", icon: "settings" },
        { label: "Appearance", href: "/settings/appearance", icon: "blend" },
      ]}
      panes={[<AppearancePane key="appearance" />]}
    />
  );
}
