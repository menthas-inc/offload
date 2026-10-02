// A person as a settings row. 022.
//
// `SettingsDetail.jsx`'s `PersonRow`, with the prism where the kit drew two
// grey letters: a 32px mark, the name, a note, and a value. The mark is a
// door to the person, at a 44px hit; the row's own tap is whatever the page
// says it is. 031: the mark at 36 on both phones, and an act in place
// (Withdraw) as the settings rows' outline pill. The handoff asks 40 on
// Android; the governed contract (`components/core/Avatar.d.ts`) lists five
// sizes as every size the product draws, so the contract leads and the
// divergence is logged.

import { Platform, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Glyph } from "../Glyph";
import { Avatar } from "../Avatar";
import { useColors } from "../../lib/colors";
import { RowPill, useRowEdge } from "../settings/Rows";
import { nameOf, type Person } from "../../lib/people";

const isAndroid = Platform.OS === "android";

export function PersonRow({
  person,
  note,
  value,
  pill,
  onPress,
  last,
}: {
  person: Person;
  note?: string | undefined;
  value?: string | undefined;
  /** 031. An act in place, drawn as the outline pill. */
  pill?: string | undefined;
  /** The row's tap. Absent, the row opens the person, as the mark does. */
  onPress?: (() => void) | undefined;
  last?: boolean;
}) {
  const COLOR = useColors();
  const router = useRouter();
  const open = () => router.push(`/people/${person.accountId}`);
  const edge = useRowEdge(last);
  return (
    <Pressable
      onPress={onPress ?? open}
      accessibilityRole="button"
      className={`flex-row items-center gap-space-4 py-space-3 ${edge}`}
      style={{ minHeight: isAndroid ? 58 : 50 }}
    >
      <Pressable onPress={open} hitSlop={6} accessibilityRole="button" accessibilityLabel={nameOf(person)}>
        <Avatar uid={person.accountId} initials={person.initials} name={person.displayName ?? undefined} size={36} />
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
        <Text className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 15 }} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {pill ? <RowPill label={pill} /> : null}
      {onPress === undefined ? <Glyph name="chevron-right" size={15} color={COLOR.iconOnWell} /> : null}
    </Pressable>
  );
}
