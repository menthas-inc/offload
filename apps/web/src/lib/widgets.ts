// Which widgets a thread earns, and how their contents are filtered.
//
// **This moved to `@offload/widgets`.** It was a deliberate copy of the
// server's, and its old header said so; two phones would have made four copies
// of the rule that decides what a thread looks like. The reasoning went with
// it and is worth reading there.
//
// One thing the move settled rather than papered over. The two copies disagreed
// about one field: the server's row carried `placeId` and this one carried the
// whole `place`, because the client draws the pin. Only presence decides
// whether the map is earned, so the shared `Sortable` takes the narrower of the
// two and `ContentRow` carries both, the id for the rule and the object for the
// pin. `fetchContent` derives the id, so nothing above it has to think about it.

export {
  WIDGET_KINDS,
  DONE_SHOWN,
  dimensionsIn,
  filtersFor,
  groupBy,
  matching,
  parseTag,
  readPreference,
  sinkDone,
  splitDone,
  splitRepeating,
  widgetsFor,
  cadenceLabel,
  type Filter,
  type Group,
  type Series,
  type Sortable,
  type Tag,
  type ThreadPreference,
  type Widget,
  type WidgetKind,
} from "@offload/widgets";

// 015's rail, from the same package and for the same reason: three surfaces
// draw it and two of them are a phone.
export {
  MAX_DOTS,
  WEEKS_BEFORE_MONTHS,
  dayLabel,
  datedFor,
  localDay,
  monthFor,
  railFor,
  stepMonth,
  thingsOn,
  weeksSpanned,
  type Dated,
  type Day,
  type Month,
  type RailRow,
  type WeekStart,
} from "@offload/widgets";
