// Today, the agenda. 024.
//
// Three groups across every thread the person is in, from a person-facing
// read: every dated content row lands here, reminder or not, so the digest
// is the narrow view and the screen is the wide one. Notes do not; they are
// sentences, drawn on the rail.

import { fetchToday } from "./api";
import type { ContentRow } from "./threads";

export interface AgendaRow extends ContentRow {
  /** The thread the row lives in, where its sheets and Undo are. */
  threadId: string;
  /** The thread's name, the row's meta here. */
  threadName: string;
}

export interface Agenda {
  overdue: AgendaRow[];
  today: AgendaRow[];
  tomorrow: AgendaRow[];
  /** How many more are late than the hundred shown. */
  overdueMore: number;
  /** Whether anything has ever been filed: the day-one invitation is for an
   *  account that has never dumped anything, and "Nothing due today." for
   *  one that has. */
  everDumped: boolean;
  /** 025. The labels the rows above carry, and only those. */
  threadLabels: { id: string; name: string; colour: number }[];
}

export async function loadAgenda(): Promise<Agenda | null> {
  return fetchToday<Agenda>();
}

export function isQuiet(agenda: Agenda): boolean {
  return agenda.overdue.length + agenda.today.length + agenda.tomorrow.length === 0;
}

/** The three groups in the order they are drawn, with their labels. Empty
 *  groups are not drawn. */
export function groupsOf(agenda: Agenda): { key: "overdue" | "today" | "tomorrow"; label: string; rows: AgendaRow[] }[] {
  return [
    { key: "overdue" as const, label: "Overdue", rows: agenda.overdue },
    { key: "today" as const, label: "Today", rows: agenda.today },
    { key: "tomorrow" as const, label: "Tomorrow", rows: agenda.tomorrow },
  ].filter((group) => group.rows.length > 0);
}
