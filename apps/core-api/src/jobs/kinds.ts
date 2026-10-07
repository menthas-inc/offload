// Which runner owns which job kind.
//
// Two processes drain the jobs table now: this service handles email, and the
// Python worker handles anything that talks to a model. Each claims only its
// own kinds, because a runner that claims a kind it cannot handle marks the job
// dead on the spot, and unscoped that is what would have happened to every
// dump.
//
// The risk that creates is quieter than the one it fixes: a kind nobody owns is
// no longer failed loudly, it just sits queued forever. So the ownership is
// written down in one place and a test asserts every kind the codebase enqueues
// is owned by somebody.

/** Kinds the Python worker claims. Mirrored in apps/agent, and the test below
 *  this file's consumers is what keeps the two honest. */
export const MODEL_KINDS = [
  "dump.answer",
  "voice.forget",
  "embed.content",
  "embed.note",
  "embed.message",
  "embed.memory",
  "thread.nightly",
  "account.memories",
  "link.place",
] as const;
