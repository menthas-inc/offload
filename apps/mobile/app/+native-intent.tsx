// What the share extension opens the app with is not a route.
//
// On iOS a share arrives as `offload://dataUrl=offloadShareKey?nonce=…`: the
// extension writes the files into the app group and opens the app with a key
// to them. Expo Router took that for a path and drew its unmatched-route
// screen over the app, which is how the first share from Photos on an iPhone
// ended. `ShareArrival` reads the intent off the same URL through the native
// module, so the router has nothing to do here: nothing is returned, a warm
// app stays on the screen it was on, and a cold one opens at the index as it
// always does. Android delivers a share as an intent, never as a URL, so this
// never runs there.

import { getShareExtensionKey } from "expo-share-intent";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  return path.includes(`dataUrl=${getShareExtensionKey()}`) ? null : path;
}
