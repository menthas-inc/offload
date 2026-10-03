"use client";

// Health's pane head: the title, the three views and the range, on every
// view. The view and the range are both kept in the address, so a link lands
// on the same thing.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "../../admin.module.css";
import { PaneHead, RangePicker } from "../../ui";

export const VIEWS = [
  { value: "now", label: "Now" },
  { value: "jobs", label: "Jobs" },
  { value: "calls", label: "Calls" },
] as const;

export type View = (typeof VIEWS)[number]["value"];

/** The view in the address. Anything else there reads as Now. */
export function useView(): View {
  const value = useSearchParams().get("view");
  return VIEWS.some((view) => view.value === value) ? (value as View) : "now";
}

/** One choice of a few, written to the address under `name`: the range
 *  picker's segmented control, for a second question. Named apart from the
 *  design system's `SegmentedControl`, whose contract is an `onChange`. */
export function Picker<T extends string>({
  name,
  label,
  options,
  value,
}: {
  name: string;
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <span className={styles.seg} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={styles.segOption}
          onClick={() => {
            const next = new URLSearchParams(params.toString());
            next.set(name, option.value);
            router.replace(`${pathname}?${next.toString()}`);
          }}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}

export function Head({ asOf, onRefresh }: { asOf?: Date | null; onRefresh?: () => void }) {
  const view = useView();
  return (
    <PaneHead
      title="Health"
      sub="Read from offload's own database. Plots are in UTC."
      asOf={asOf ?? null}
      {...(onRefresh ? { onRefresh } : {})}
      tools={
        <>
          <Picker name="view" label="View" options={VIEWS} value={view} />
          <RangePicker />
        </>
      }
    />
  );
}
