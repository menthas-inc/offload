// A promise raced against a deadline, for anything a screen waits on that
// could otherwise wait forever.

/** Race a promise against a deadline, resolving to a fallback instead of
 *  hanging.
 *
 *  Nothing about "look up a stored cookie" should be able to stop the app
 *  forever, and on a device it did: every screen sat blank because the read
 *  never settled and the fetch that depended on it therefore never happened.
 *  A slow or unavailable keystore is a reason to carry on, not a reason to
 *  show nothing. */
export async function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
