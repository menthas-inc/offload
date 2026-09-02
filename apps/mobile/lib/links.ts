// Where the phones send you when the destination is a web page rather than a
// screen. Resolved the same way API_URL is: app config first, then the
// environment, then the production site, so a device build points somewhere
// real without anyone remembering to set it.

import Constants from "expo-constants";

export const WEB_URL =
  (Constants.expoConfig?.extra?.["webUrl"] as string | undefined) ??
  process.env["EXPO_PUBLIC_WEB_URL"] ??
  "https://offload.club";

export const PRIVACY_URL = `${WEB_URL}/privacy`;
