// Notifications on the phone. 024.
//
// A push token is a delivery capability and is bound to a session: the app
// registers its token whenever permission is granted and it launches, through
// a route that takes no account id, and deletes it on the server before the
// session ends. Four channels on Android with private lock-screen
// visibility, never renamed once they exist; two categories on both, one with
// the verbs. The payload is not an instruction: it carries a closed kind and
// the ids the kind needs, the app maps a kind to a screen from the table
// below, re-reads every id from the server on arrival, and ignores anything
// else.

import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { actOnNotification, deletePushToken, registerPushToken } from "./api";
import { beforeSignOut } from "./auth";
import { failed } from "./log";

export const VERBS_CATEGORY = "digest_verbs";
export const PLAIN_CATEGORY = "digest";
export const PEOPLE_CATEGORY = "people";

/** The four channels, ids permanent and invisible; the labels are the
 *  notification titles, word for word. */
export const CHANNELS = [
  { id: "due_today", name: "Due today" },
  { id: "coming_tomorrow", name: "Tomorrow" },
  { id: "people_requests", name: "Connection requests" },
  { id: "shared_activity", name: "Added to a shared thread" },
] as const;

/** What a send carries, and nothing else. */
export type Payload =
  | { kind: "digest"; send: "morning" | "evening"; contentId?: string }
  | { kind: "request" }
  | { kind: "share"; memberId: string }
  | { kind: "shared_activity"; threadId: string };

/** The screen a kind opens, from a fixed table. A path never travels in a
 *  payload; an id does, and the screen it opens reads that id from the
 *  server as it does today. Null for anything the table does not name. */
export function routeFor(data: unknown): { pathname: string; params?: Record<string, string> } | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as Record<string, unknown>;
  const id = (key: string): string | null => (typeof payload[key] === "string" && /^[0-9a-f-]{36}$/.test(payload[key] as string) ? (payload[key] as string) : null);
  switch (payload["kind"]) {
    case "digest":
      return { pathname: "/" };
    case "request":
      return { pathname: "/settings/people" };
    case "share": {
      const memberId = id("memberId");
      return memberId ? { pathname: "/invitations/[memberId]", params: { memberId } } : null;
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
 *  platform keeps them. */
export async function prepare(): Promise<void> {
  try {
    await Notifications.setNotificationCategoryAsync(VERBS_CATEGORY, [
      { identifier: "done", buttonTitle: "Done", options: { opensAppToForeground: false, isAuthenticationRequired: true } },
      { identifier: "tomorrow", buttonTitle: "Tomorrow", options: { opensAppToForeground: false, isAuthenticationRequired: true } },
    ]);
    await Notifications.setNotificationCategoryAsync(PLAIN_CATEGORY, []);
    await Notifications.setNotificationCategoryAsync(PEOPLE_CATEGORY, [
      { identifier: "open", buttonTitle: "Open", options: { opensAppToForeground: true } },
    ]);
    if (Platform.OS === "android") {
      for (const channel of CHANNELS) {
        await Notifications.setNotificationChannelAsync(channel.id, {
          name: channel.name,
          importance: Notifications.AndroidImportance.DEFAULT,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
        });
      }
    }
  } catch (error) {
    failed("notifications.prepare", error);
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

/** A response: a verb acts without opening the app and dismisses the
 *  notification on success; a tap hands the screen to open to the caller. */
export async function respond(
  response: Notifications.NotificationResponse,
  open: (route: { pathname: string; params?: Record<string, string> }) => void,
): Promise<void> {
  const data: unknown = response.notification.request.content.data;
  const verb = verbOf(response.actionIdentifier);
  if (verb) {
    const contentId = (data as { contentId?: unknown } | null)?.contentId;
    if (typeof contentId !== "string") return;
    if (await actOnNotification(verb, contentId)) {
      await Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => undefined);
    }
    return;
  }
  const route = routeFor(data);
  if (route) open(route);
}
