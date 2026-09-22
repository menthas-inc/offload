// Today's three groups. 024.
//
// The thread page's own row, with its chip, its checkbox and its two
// controls, and the thread's name as the row's meta. A tick acts here; the
// pencil, the trash and the long press open the thread the row lives in,
// where the sheets and Undo already are, rather than a second copy of them on
// this screen.

import { useState } from "react";
import { Platform, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ContentRowView } from "../shell/ContentRow";
import { completeContent } from "../../lib/threads";
import { groupsOf, type Agenda, type AgendaRow } from "../../lib/agenda";

const isAndroid = Platform.OS === "android";

export function TodayAgenda({ agenda, onChanged }: { agenda: Agenda; onChanged: () => void }) {
  const router = useRouter();
  // A tick drawn first and written second, put back if the write fails.
  const [ticked, setTicked] = useState<Map<string, string | null>>(new Map());

  async function toggle(row: AgendaRow): Promise<void> {
    const wasDone = row.doneAt !== null;
    setTicked((held) => new Map(held).set(row.id, wasDone ? null : new Date().toISOString()));
    const ok = await completeContent(row.id, !wasDone);
    if (!ok) {
      setTicked((held) => {
        const next = new Map(held);
        next.delete(row.id);
        return next;
      });
      return;
    }
    onChanged();
  }

  const open = (row: AgendaRow) => router.push({ pathname: "/threads/[id]", params: { id: row.threadId } });

  return (
    <View className="gap-space-6">
      {groupsOf(agenda).map((group) => (
        <View key={group.key}>
          <Text
            className={`pb-space-2 font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
            style={{ fontSize: 17 }}
          >
            {group.label}
          </Text>
          <View className={`overflow-hidden rounded-lg ${isAndroid ? "bg-a-c-low" : "bg-surface-fill"}`}>
            {group.rows.map((row, index) => {
              const drawn = ticked.has(row.id) ? { ...row, doneAt: ticked.get(row.id) ?? null } : row;
              return (
                <ContentRowView
                  key={row.id}
                  row={drawn}
                  border={index < group.rows.length - 1}
                  note={row.threadName}
                  onToggle={row.type === "task" ? () => void toggle(row) : undefined}
                  onEdit={() => open(row)}
                  onActions={() => open(row)}
                  onDelete={() => open(row)}
                  onArchive={() => open(row)}
                />
              );
            })}
          </View>
          {group.key === "overdue" && agenda.overdueMore > 0 ? (
            <Text className={`pt-space-2 font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 13 }}>
              {agenda.overdueMore} more before these
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
