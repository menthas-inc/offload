// @ picks a person. 022.
//
// The kit's `MentionList`: the same list as the share sheet, filtered as you
// keep typing, three rows at a time so it never covers what you wrote, each
// row a mark at 28 and the name. Picking one puts the name in the text and
// resolves it to the person, which the composer carries on the wire as an
// id; an @ that matches nobody stays plain text. Above the composer, so the
// keyboard's lift moves it with the plate.

import { Platform, Pressable, Text, View } from "react-native";
import { Avatar } from "../Avatar";
import { nameOf, type Person } from "../../lib/people";
import { useColors } from "../../lib/colors";

const isAndroid = Platform.OS === "android";

/** The @ token at the end of the text, or null. "share it with @Sa" gives
 *  "Sa"; "ana@example.com" gives nothing, since the @ has a word before it. */
export function mentionQuery(text: string): string | null {
  const match = /(^|\s)@([^\s@]*)$/.exec(text);
  return match ? (match[2] ?? "") : null;
}

/** The text with the @ token replaced by the person's name and a space. */
export function withMention(text: string, name: string): string {
  return text.replace(/(^|\s)@([^\s@]*)$/, (_, lead: string) => `${lead}${name} `);
}

export function MentionList({
  people,
  query,
  onPick,
}: {
  people: Person[];
  query: string;
  onPick: (person: Person) => void;
}) {
  const COLOR = useColors();
  const needle = query.trim().toLowerCase();
  const shown = people.filter((p) => !needle || nameOf(p).toLowerCase().includes(needle)).slice(0, 3);
  if (shown.length === 0) return null;
  return (
    <View
      className={`mb-space-3 rounded-lg px-space-5 py-space-2 ${isAndroid ? "bg-a-c" : "bg-surface-raised"}`}
      // The one shadow token with a value in dark, as a lifted row takes it.
      style={{
        shadowColor: COLOR.shadowLift.color,
        shadowOpacity: 1,
        shadowRadius: COLOR.shadowLift.radius,
        shadowOffset: { width: 0, height: COLOR.shadowLift.offsetY },
        elevation: 4,
      }}
      accessibilityRole="menu"
    >
      {shown.map((person, i) => (
        <Pressable
          key={person.accountId}
          onPress={() => onPick(person)}
          accessibilityRole="menuitem"
          className={`flex-row items-center gap-space-4 ${i < shown.length - 1 ? "border-b border-border-hairline" : ""}`}
          style={{ minHeight: 44 }}
        >
          <Avatar uid={person.accountId} initials={person.initials} name={person.displayName ?? undefined} size={28} />
          <Text className={`flex-1 font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 15 }} numberOfLines={1}>
            {nameOf(person)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
