// A refusal the person-facing write routes name. 023.
//
// `NotYours` is the tenancy answer and stays a 404. These are the shape
// answers: the request was theirs to make and one field of it cannot be
// written as sent. The route maps them to a status and the client puts the
// screen back with one clause.

export type RefusalCode = "bad_date" | "bad_rule" | "on_calendar";

export class Refused extends Error {
  constructor(readonly code: RefusalCode) {
    super(code);
  }
}
