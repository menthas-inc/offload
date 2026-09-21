// A person as a settings row. 022.
//
// `SettingsDetail.jsx`'s `PersonRow`, with the prism where the kit drew two
// grey letters: a 32px mark, the name, a note, and a value. The mark is a
// door to the person, at a 44px hit; the row's own tap is whatever the page
// says it is.

import { Platform, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Glyph } from "../Glyph";
import { Avatar } from "../Avatar";
import { useColors } from "../../lib/colors";
import { nameOf, type Person } from "../../lib/people";

const isAndroid = Platform.OS === "android";

export function PersonRow({
  person,
  note,
  value,
  onPress,
  last,
}: {
  person: Person;
  note?: string | undefined;
  value?: string | undefined;
  /** The row's tap. Absent, the row opens the person, as the mark does. */
  onPress?: (() => void) | undefined;
  last?: boolean;
}) {
  const COLOR = useColors();
  const router = useRouter();
  const open = () => router.push(`/people/${person.accountId}`);
  return (
    <Pressable
      onPress={onPress ?? open}
      accessibilityRole="button"
      className={`flex-row items-center gap-space-4 py-space-3 ${last ? "" : "border-b border-border-hairline"}`}
      style={{ minHeight: isAndroid ? 56 : 48 }}
    >
      <Pressable onPress={open} hitSlop={6} accessibilityRole="button" accessibilityLabel={nameOf(person)}>
        <Avatar uid={person.accountId} initials={person.initials} name={person.displayName ?? undefined} size={32} />
      </Pressable>
      <View className="flex-1">
        <Text className={`font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 15, lineHeight: 20 }} numberOfLines={1}>
          {nameOf(person)}
        </Text>
        {note ? (
          <Text className={`mt-space-1 font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 12.5, lineHeight: 17.5 }} numberOfLines={2}>
            {note}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 14 }} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress === undefined ? <Glyph name="chevron-right" size={15} color={COLOR.iconOnWell} /> : null}
    </Pressable>
  );
}
