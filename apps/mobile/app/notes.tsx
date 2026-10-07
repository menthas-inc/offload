// 040. Notes became Memories, and the route moved with it. Anybody holding
// the old link, a notification or a bookmark, lands on the new one.

import { Redirect } from "expo-router";

export default function NotesMoved() {
  return <Redirect href="/memories" />;
}
