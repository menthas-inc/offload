// The app's config: everything in app.json, and the map keys (030).
//
// **The keys go in through the maps plugin's mods, never its plugin entry.** A
// plugin entry's options are part of the config every build and update serves,
// so a key there is in each phone's manifest and in the build log; the mods run
// at prebuild and are not served. The keys come from the build's environment,
// `GOOGLE_MAPS_IOS_KEY` and `GOOGLE_MAPS_ANDROID_KEY`, sensitive EAS variables.
//
// **No key, no map.** `extra.mapsAvailable` says which platform was given one,
// and the client mounts no map and draws no switch where it was not: a keyless
// iOS build would otherwise draw Apple's map, which Google's terms forbid
// beside Google's places.

import type { ConfigContext, ExpoConfig } from "expo/config";

const withMaps = require("react-native-maps/app.plugin.js").default as (
  config: ExpoConfig,
  props: { iosGoogleMapsApiKey?: string; androidGoogleMapsApiKey?: string },
) => ExpoConfig;

export default ({ config }: ConfigContext): ExpoConfig => {
  const ios = process.env["GOOGLE_MAPS_IOS_KEY"] ?? "";
  const android = process.env["GOOGLE_MAPS_ANDROID_KEY"] ?? "";
  const base = {
    ...config,
    extra: { ...config.extra, mapsAvailable: { ios: ios !== "", android: android !== "" } },
  } as ExpoConfig;
  return withMaps(base, {
    ...(ios ? { iosGoogleMapsApiKey: ios } : {}),
    ...(android ? { androidGoogleMapsApiKey: android } : {}),
  });
};
