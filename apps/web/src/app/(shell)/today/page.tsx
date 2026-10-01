"use client";

// Today. 027.
//
// One pane, and Customize Today beside it at `?customize=1`, with Today's pane
// at the kit's 520px. The crumb bar keeps today's date at its right whichever
// day the stepper shows. A door's `?day=` opens that day once.
//
// The layout is held here, above both panes, so a switch in Customize Today
// changes Today beside it at once, before the write lands.

import { useSearchParams } from "next/navigation";
import { noonUtc } from "@offload/widgets";
import { Panes } from "../../../components/shell/Panes";
import { TodayPane } from "../../../components/panes/Today";
import { CustomizePane, useTodayLayout } from "../../../components/today/Customize";
import { useClock } from "../../../lib/clock";
import styles from "../today.module.css";

const DATE_LINE = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export default function TodayRoute() {
  const search = useSearchParams();
  const customizing = search.get("customize") === "1";
  const { today } = useClock();
  const state = useTodayLayout();

  const crumbs = [
    { label: "Today", href: "/today", icon: "sun" },
    ...(customizing ? [{ label: "Customize Today", href: "/today?customize=1", icon: "sliders-horizontal" }] : []),
  ];

  return (
    <Panes
      crumbs={crumbs}
      together={customizing}
      aside={<span className={styles.crumbDate}>{DATE_LINE.format(noonUtc(today))}</span>}
      panes={[
        <TodayPane key="today" layout={state.layout} openDay={search.get("day")} customizing={customizing} />,
        ...(customizing ? [<CustomizePane key="customize" state={state} />] : []),
      ]}
    />
  );
}
