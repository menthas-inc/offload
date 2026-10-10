// Notifications on the phone. 024.
//
// A push token is a delivery capability and is bound to a session: the app
// registers its token whenever permission is granted and it launches, through
// a route that takes no account id, and deletes it on the server before the
// session ends. Five channels on Android with private lock-screen
// visibility, never renamed once they exist; the verbs category and the
// people category on both phones, the plain digest's on iOS alone, since
// Android refuses a category without an action. The payload is not an
// instruction: it carries a closed kind and
// the ids the kind needs, the app maps a kind to a screen from the table
// below, re-reads every id from the server on arrival, and ignores anything
// else.

import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { CHANNELS, PEOPLE_CATEGORY, PLAIN_CATEGORY, VERBS_CATEGORY, dayIn } from "@offload/widgets";
import { actOnNotification, deletePushToken, registerPushToken } from "./api";
import { beforeSignOut } from "./auth";
import { dayOfPush } from "./today";
import { failed } from "./log";

// The ids are the shared package's, the same declaration the server files a
// send under, so neither side can rename what a shipped phone already made.
export { CHANNELS, PEOPLE_CATEGORY, PLAIN_CATEGORY, VERBS_CATEGORY };

/** What a send carries, and nothing else. */
export type Payload =
  | { kind: "digest"; send: "morning" | "evening"; contentId?: string }
  | { kind: "request" }
  | { kind: "share"; memberId: string }
  | { kind: "shared_activity"; threadId: string }
  | { kind: "reminder"; threadId: string; contentId?: string; noteId?: string };

/** The screen a kind opens, from a fixed table. A path never travels in a
 *  payload; an id does, and the screen it opens reads that id from the
 *  server as it does today. Null for anything the table does not name. */
export function routeFor(data: unknown, today?: string): { pathname: string; params?: Record<string, string> } | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as Record<string, unknown>;
  const id = (key: string): string | null => (typeof payload[key] === "string" && /^[0-9a-f-]{36}$/.test(payload[key] as string) ? (payload[key] as string) : null);
  switch (payload["kind"]) {
    case "digest": {
      // 027. An evening digest names tomorrow; launch hands its day to Today.
      const day = today ? dayOfPush(payload, today) : null;
      return day ? { pathname: "/", params: { day } } : { pathname: "/" };
    }
    case "request":
      return { pathname: "/settings/people" };
    case "share": {
      const memberId = id("memberId");
      return memberId ? { pathname: "/invitations/[memberId]", params: { memberId } } : null;
    }
    case "reminder": {
      // 042. A reminder of its own opens its thread, which re-reads the
      // thing; an id it carries that is not one refuses the whole payload.
      const bad = (key: string) => payload[key] !== undefined && id(key) === null;
      if (bad("contentId") || bad("noteId")) return null;
      const threadId = id("threadId");
      return threadId ? { pathname: "/threads/[id]", params: { id: threadId } } : null;
    }
    case "shared_activity": {
      const threadId = id("threadId");
      return threadId ? { pathname: "/threads/[id]", params: { id: threadId } } : null;
    }
    default:
      return null;
  }
}

/** The verb a response carries, if it is one of the two. */
export function verbOf(actionIdentifier: string): "done" | "tomorrow" | null {
  if (actionIdentifier === "done") return "done";
  if (actionIdentifier === "tomorrow") return "tomorrow";
  return null;
}

let registered: string | null = null;

/** The categories and, on Android, the channels. Once per launch; the
 *  platform keeps them. Two separate tries, because the first Pixel run
 *  (2026-09-24) lost every channel to a category that Android refused: it
 *  throws for a category with no actions, which is what the plain digest
 *  asked for. iOS takes that category; a send with no verbs needs none on
 *  Android, where the channel alone files it. */
export async function prepare(): Promise<void> {
  try {
    await Notifications.setNotificationCategoryAsync(VERBS_CATEGORY, [
      { identifier: "done", buttonTitle: "Done", options: { opensAppToForeground: false, isAuthenticationRequired: true } },
      { identifier: "tomorrow", buttonTitle: "Tomorrow", options: { opensAppToForeground: false, isAuthenticationRequired: true } },
    ]);
    if (Platform.OS === "ios") await Notifications.setNotificationCategoryAsync(PLAIN_CATEGORY, []);
    await Notifications.setNotificationCategoryAsync(PEOPLE_CATEGORY, [
      { identifier: "open", buttonTitle: "Open", options: { opensAppToForeground: true } },
    ]);
  } catch (error) {
    failed("notifications.prepare", error, { step: "categories" });
  }
  if (Platform.OS !== "android") return;
  try {
    for (const channel of CHANNELS) {
      await Notifications.setNotificationChannelAsync(channel.id, {
        name: channel.name,
        importance: Notifications.AndroidImportance.DEFAULT,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      });
    }
  } catch (error) {
    failed("notifications.prepare", error, { step: "channels" });
  }
}

/** Whether the person has said yes. Never asks: first run did, once. */
export async function permitted(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

/** Register this phone's token with the session's account, when permitted. */
export async function register(): Promise<void> {
  if (!(await permitted())) return;
  try {
    const projectId = Constants.expoConfig?.extra?.["eas"]?.["projectId"] as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {});
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;
    if (await registerPushToken(token, Platform.OS)) registered = token;
  } catch (error) {
    failed("notifications.register", error);
  }
}

/** The token goes before the session does. */
beforeSignOut(async () => {
  if (registered) await deletePushToken(registered);
  registered = null;
});

/** For a test: what this phone registered. */
export function registeredToken(): string | null {
  return registered;
}

/** The responses this launch has acted on. The tap that opens the app
 *  arrives twice, as the launch response and through the listener, and
 *  Tomorrow moves a date by a day each time it is asked. A refused write is
 *  taken out again, so tapping the verb once more is a retry. */
const handled = new Set<string>();

/** The platform keeps the last response across launches; once it has been
 *  acted on it is cleared, so the next launch does not act on it again. */
async function clearLast(): Promise<void> {
  await Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
}

/** A response: a verb acts without opening the app and dismisses the
 *  notification on success; a tap hands the screen to open to the caller. */
export async function respond(
  response: Notifications.NotificationResponse,
  open: (route: { pathname: string; params?: Record<string, string> }) => void,
): Promise<void> {
  const id = response.notification.request.identifier;
  if (handled.has(id)) return;
  handled.add(id);
  const data: unknown = response.notification.request.content.data;
  const verb = verbOf(response.actionIdentifier);
  if (verb) {
    const contentId = (data as { contentId?: unknown } | null)?.contentId;
    if (typeof contentId !== "string") return;
    if (await actOnNotification(verb, contentId)) {
      await Notifications.dismissNotificationAsync(id).catch(() => undefined);
      await clearLast();
    } else {
      handled.delete(id);
    }
    return;
  }
  // The phone's own day: Today checks the account's again when it opens.
  const route = routeFor(data, dayIn(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone || null));
  if (route) {
    await clearLast();
    open(route);
  }
}
