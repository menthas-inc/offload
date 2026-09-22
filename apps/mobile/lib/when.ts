// The when field, shared. 023.
//
// One implementation in the widgets package; this file keeps the import
// paths the sheets already use. It held a copy of the module until the code
// review of 2026-09-22 found the phones and the web with byte-identical files.

export {
  NOTHING,
  anHourAfter,
  clockLabel,
  drawnWhen,
  formatRule,
  patchFor,
  repeatsLabel,
  sameWhen,
  timeHM,
  whenChipLabel,
  whenLabel,
  whenValueOf,
} from "@offload/widgets";
export type { WhenPatch, WhenValue } from "@offload/widgets";
