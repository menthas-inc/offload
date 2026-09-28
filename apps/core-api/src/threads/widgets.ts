// Which widgets a thread earns.
//
// **This moved to `@offload/widgets`.** It lived here and in
// `apps/web/src/lib/widgets.ts` as a deliberate copy; two phones would have
// made it four, and four clients disagreeing about what a thread looks like is
// a drift problem rather than a risk. The reasoning that used to be here went
// with it and is worth reading there.
//
// This file stays as the import site the rest of the server already uses, so
// the move is one package and not a rename across a dozen call sites.

export {
  WIDGET_KINDS,
  liveCount,
  readPreference,
  reorderPlan,
  respread,
  sinkDone,
  widgetsFor,
  type Ordered,
  type ReorderWrite,
  type Sortable,
  type ThreadPreference,
  type Widget,
  type WidgetKind,
} from "@offload/widgets";

/** A widget kind is one of three short words; this bounds what a request may
 *  send before `readPreference` drops anything it does not recognise. */
export const WIDGET_KIND_CHARS = 24;
