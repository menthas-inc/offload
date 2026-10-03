// Why a job failed, as a code from a closed set.
//
// `jobs.last_error` is free text: scrubbed of addresses and URLs, truncated,
// and still whatever an exception happened to say. The admin panel may not
// show that (OFF-1, and 034's "an error is a code"), so every failure also
// writes one of these to `jobs.error_code`, and that column is the only one an
// admin route reads.
//
// Two runners write it. The worker's reasons were always enum-shaped strings
// (`apps/agent/src/offload_agent/queue.py`) and are written to both columns
// unchanged; the Core API's are the last five.

export const ERROR_CODES = [
  // The worker's.
  "stale",
  "nightly_error",
  "nightly_unparseable",
  "link_place_error",
  "forget_error",
  "embed_error",
  "embed_unavailable",
  "undeliverable",
  "invalid_output",
  "model_error",
  "transcription_failed",
  "timeout",
  // The Core API's. `stale` is shared: a lock its owner abandoned.
  "no_handler",
  "mail_failed",
  "vendor_error",
  "handler_error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** A failure that knows its own code. Anything else a handler throws is
 *  `handler_error`. The message is still scrubbed before it is stored. */
export class JobError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string = code,
  ) {
    super(message);
  }
}

export function codeOf(error: unknown): ErrorCode {
  return error instanceof JobError ? error.code : "handler_error";
}
