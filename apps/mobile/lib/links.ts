// Where the phones send you when the destination is a web page rather than a
// screen. Resolved the same way API_URL is: app config first, then the
// environment, then the production site, so a device build points somewhere
// real without anyone remembering to set it.

import Constants from "expo-constants";
import { Linking } from "react-native";

export const WEB_URL =
  (Constants.expoConfig?.extra?.["webUrl"] as string | undefined) ??
  process.env["EXPO_PUBLIC_WEB_URL"] ??
  "https://offload.club";

export const PRIVACY_URL = `${WEB_URL}/privacy`;


/** Open a web page in the system browser, and nothing that is not one.
 *
 *  A row's link is something a person pasted, in a thread other members may
 *  share, and a reply's source is the address of a page the model read. The
 *  platform's opener takes any scheme, so `sms:` with a body or another app's
 *  own scheme with arguments would open from a tap on a row (security review
 *  2026-09-22, L21). The server refuses anything but https on a row; this is
 *  the same rule on the device, for the day the server forgets. */
export async function openLink(url: string | null | undefined): Promise<boolean> {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  await Linking.openURL(url);
  return true;
}
