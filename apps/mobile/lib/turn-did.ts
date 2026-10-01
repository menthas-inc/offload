// 028. Whether a turn did something worth the Done mark.
//
// A pill, or the server saying it filed: a turn that filed only into the
// default thread has no pill and still did something. Its own file because
// `dump.ts` reaches native modules a logic test cannot load.

export function turnDid(answer: { threads?: readonly unknown[]; filed?: boolean }): boolean {
  return (answer.threads?.length ?? 0) > 0 || answer.filed === true;
}
