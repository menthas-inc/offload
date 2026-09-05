// Which widgets a thread earns, and how their contents are grouped.
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
  dimensionsIn,
  groupBy,
  parseTag,
  readPreference,
  sinkDone,
  widgetsFor,
  type Group,
  type Sortable,
  type Tag,
  type ThreadPreference,
  type Widget,
  type WidgetKind,
} from "@offload/widgets";
