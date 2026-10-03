// The pieces every settings page is made of.
//
// From `SettingsScreen.jsx` and `SettingsDetail.jsx`, which build ten pages out
// of one small vocabulary so that ten screens cost one layout.
//
// `Group` is `Card variant="fill"`'s shape: a sunken grey ground, `radius-lg`,
// no border. `Row` divides with an inset hairline rather than a border, so the
// last row's rounded corner is not cut by a line across it.
//
// 031, *Settings, tightened*. **A section opens with a glyph tile, a heading and
// an optional caption**, because a 12px tertiary label over 15px rows read as a
// caption and every page read as one long list. The heading is drawn when the
// group has an `icon`; a `label` alone keeps the small label, which is what the
// picker regions and the Calendar and Mail pages one level down still are. On
// Android the card's rows part with a 2px gap in the page's colour rather than
// a hairline, Material's list, so a group tells its rows which it is.

import { createContext, useContext, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import { Glyph } from "../Glyph";
import { NameField } from "../NameField";
import { useColors } from "../../lib/colors";

const isAndroid = Platform.OS === "android";

/** Whether the rows sit in a headed section, which on Android parts them with
 *  the page's colour instead of a hairline. */
const Headed = createContext(false);

/** 031. The divider and gutter a custom row needs to sit in a group like
 *  `Row` does: a hairline, or on Android in a headed section the page's colour
 *  with the row's own gutter. */
export function useRowEdge(last?: boolean): string {
  const headed = useContext(Headed);
  if (isAndroid && headed) return `px-space-5 ${last ? "" : "border-b-2 border-a-surface"}`;
  return last ? "" : "border-b border-border-hairline";
}

/** 031. Rows inside a card inside a headed section (Connected apps) keep the
 *  hairline: the card is their ground, not the page. */
export function Plain({ children }: { children: React.ReactNode }) {
  return <Headed.Provider value={false}>{children}</Headed.Provider>;
}

/** The space between sections, and the page's first one under the bar. Off the
 *  spacing scale as the kits are (memory: kit spacing is off-scale). */
export function Sections({ children }: { children: React.ReactNode }) {
  return <View style={{ gap: 26, paddingTop: 10 }}>{children}</View>;
}

export function Group({
  label,
  icon,
  caption,
  count,
  bare,
  children,
}: {
  label?: string | undefined;
  /** 031. The section's glyph. With it the label is a heading; without it,
   *  the small label as before. */
  icon?: string | undefined;
  /** 031. One line under the heading, for a section that needs explaining. */
  caption?: string | undefined;
  /** 019. A trailing count on the label, `4 of 7 in use`. Under a heading it
   *  is the pill beside it. */
  count?: string | undefined;
  /** 031. Children drawn as they are, with no card around them: a request
   *  card, a field, choice tiles. */
  bare?: boolean;
  children: React.ReactNode;
}) {
  const COLOR = useColors();
  const headed = Boolean(icon && label);
  const card = (
    <View
      className={`overflow-hidden ${isAndroid ? "bg-a-c-low" : "rounded-lg bg-surface-fill"} ${
        isAndroid && headed ? "" : "px-space-4"
      } ${isAndroid && !headed ? "rounded-lg" : ""}`}
      style={isAndroid && headed ? { borderRadius: 22 } : undefined}
    >
      {children}
    </View>
  );

  if (headed) {
    return (
      <View>
        <View className="flex-row items-start gap-space-5 pb-space-5" style={{ paddingHorizontal: 2 }}>
          <View
            className={`items-center justify-center ${
              isAndroid ? "rounded-pill bg-surface-attention-soft" : "bg-surface-accent-soft"
            }`}
            style={isAndroid ? { width: 32, height: 32 } : { width: 32, height: 32, borderRadius: 9 }}
          >
            <Glyph name={icon!} size={17} color={COLOR.sectionGlyph} />
          </View>
          {/* 5px down, so the heading's first line centres on the tile. */}
          <View className="flex-1" style={{ paddingTop: 5 }}>
            <View className="flex-row flex-wrap items-center gap-space-4">
              <Text
                className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
                style={{ fontSize: 17, lineHeight: 21, letterSpacing: -0.17 }}
                accessibilityRole="header"
              >
                {label}
              </Text>
              {count ? (
                <View className="rounded-pill bg-surface-fill-strong" style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text
                    className={`font-core font-medium ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
                    style={{ fontSize: 12, lineHeight: 14, fontVariant: ["tabular-nums"] }}
                  >
                    {count}
                  </Text>
                </View>
              ) : null}
            </View>
            {caption ? (
              <Text
                className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
                style={{ fontSize: 13, lineHeight: 19, marginTop: 3 }}
              >
                {caption}
              </Text>
            ) : null}
          </View>
        </View>
        <Headed.Provider value>{bare ? children : card}</Headed.Provider>
      </View>
    );
  }

  return (
    <>
      {label ? (
        <View className="flex-row items-baseline px-space-1 pb-space-3 pt-space-5">
          <Text
            className={`flex-1 font-core font-medium ${
              isAndroid ? "text-a-on-var" : "text-text-tertiary"
            }`}
            style={{ fontSize: 12 }}
          >
            {label}
          </Text>
          {count ? (
            <Text
              className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-tertiary"}`}
              style={{ fontSize: 11, fontVariant: ["tabular-nums"] }}
            >
              {count}
            </Text>
          ) : null}
        </View>
      ) : null}
      {bare ? children : card}
    </>
  );
}

interface RowProps {
  title: string;
  /** A second line under the title, for anything that needs explaining. */
  note?: string | undefined;
  /** The current state, on the right, or under the title when the two do not
   *  fit on one line. Absent rather than invented: no row here shows a number
   *  nothing computes. */
  value?: string | undefined;
  /** A Lucide slug for the leading well. */
  icon?: string | undefined;
  /** Tappable, and the chevron appears with it. Omit for a row that only
   *  states something. */
  onPress?: (() => void) | undefined;
  last?: boolean;
  /** 022. The 8px clay dot in its paper ring on the lead, for a request
   *  waiting on the viewer. The one row in Settings that carries one. */
  badge?: boolean;
  /** 026. False for a row that acts in place rather than going somewhere,
   *  such as Copy: a chevron promises a page. */
  chevron?: boolean;
  /** 031. A row that acts in place (End, Withdraw, Copy) draws its verb as an
   *  outline pill, in place of a value and a chevron. */
  pill?: string | undefined;
  /** 031. A glyph inside the pill, `copy` on Copy. */
  pillIcon?: string | undefined;
  /** 031. A state that is simply true (This device, Connected, On): the moss
   *  pill with its dot. */
  status?: string | undefined;
  /** 031. It leaves the app, so `arrow-up-right` rather than a chevron. */
  external?: boolean;
  /** 031. An action rather than a place, End all other sessions and Sign out:
   *  the title at medium weight and no chevron. */
  action?: boolean;
  /** 031. The picker's current row: a check where *Now* was. */
  checked?: boolean;
  busy?: boolean;
  /** 035. The one row that cannot be undone, Delete account: its title in
   *  `--text-danger`, as the kits draw it. */
  danger?: boolean;
}

/** 031. The outline pill on a row that acts in place. */
export function RowPill({ label, icon }: { label: string; icon?: string | undefined }) {
  const COLOR = useColors();
  return (
    <View
      className={`flex-row items-center justify-center rounded-pill border ${
        // `--border-strong`, the one value that says an outlined control is
        // there; the Android scope's `a-outline` is the hairline (1.29:1).
        isAndroid ? "border-border-strong" : "border-border-hairline bg-surface-raised"
      }`}
      style={isAndroid ? { minHeight: 40, paddingHorizontal: 18, gap: 6 } : { minHeight: 32, paddingHorizontal: 14, gap: 6 }}
    >
      {icon ? <Glyph name={icon} size={14} color={COLOR.ink} /> : null}
      <Text className={`font-core font-medium ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 14 }}>
        {label}
      </Text>
    </View>
  );
}

/** 031. A state that is simply true, in moss with its dot. Colour is never the
 *  whole message, so the word is always there. `--text-accent` rather than the
 *  handoff's `--moss-700`, which is 3.81:1 on the soft moss in dark. */
export function StatusPill({ label, tone = "on" }: { label: string; tone?: "on" | "neutral" }) {
  const COLOR = useColors();
  const on = tone === "on";
  return (
    <View
      className={`flex-row items-center rounded-pill ${on ? "bg-surface-accent-soft" : "bg-surface-fill-strong"}`}
      style={{ minHeight: 24, paddingHorizontal: 9, gap: 5 }}
    >
      {on ? <View className="rounded-pill" style={{ width: 6, height: 6, backgroundColor: COLOR.accent }} /> : null}
      <Text
        className={`font-core font-medium ${on ? "text-text-accent" : isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
        style={{ fontSize: 12 }}
      >
        {label}
      </Text>
    </View>
  );
}

export function Row({
  title,
  note,
  value,
  icon,
  onPress,
  last,
  badge,
  chevron = true,
  pill,
  pillIcon,
  status,
  external,
  action,
  checked,
  busy,
  danger,
}: RowProps) {
  const COLOR = useColors();
  const edge = useRowEdge(last);

  const body = (
    <>
      {icon ? (
        <View
          className={`items-center justify-center ${
            isAndroid ? "rounded-pill bg-a-c-high" : "rounded-sm bg-paper"
          }`}
          // Material gives it a 40px circle, iOS a 30px rounded square. The
          // kits differ here on purpose and so does this.
          style={isAndroid ? { width: 40, height: 40 } : { width: 30, height: 30 }}
        >
          <Glyph name={icon} size={isAndroid ? 18 : 15} color={COLOR.iconOnWell} />
          {badge ? (
            <View
              className="absolute rounded-pill border-paper bg-clay-600"
              style={{ top: -2, right: -2, width: 11, height: 11, borderWidth: 1.5 }}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          ) : null}
        </View>
      ) : null}

      <View className="flex-1">
        {/* The value shares a wrapping line with the title. Side by side while
            both fit, which is every row at the default size; under the title
            when they do not, which is an email at 200% type, or at 100% on a
            360dp phone. Before this the value sat beside the column and could
            not shrink, so an email wide enough took the whole row, the title
            was measured at zero width and wrapped one letter per line, and a
            one-row card stood 350dp tall. */}
        <View className="flex-row flex-wrap items-center justify-between gap-x-space-4 gap-y-space-1">
          <Text
            className={`font-core ${action ? "font-medium" : ""} ${
              danger ? "text-text-danger" : isAndroid ? "text-a-on" : "text-text-primary"
            }`}
            style={{ fontSize: 15, lineHeight: 20 }}
          >
            {title}
          </Text>
          {value ? (
            <Text
              className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
              style={{ fontSize: 15, fontVariant: ["tabular-nums"] }}
              numberOfLines={1}
            >
              {value}
            </Text>
          ) : null}
        </View>
        {note ? (
          <Text
            className={`mt-space-1 font-core ${
              isAndroid ? "text-a-on-var" : "text-text-secondary"
            }`}
            style={{ fontSize: 12.5, lineHeight: 17.5 }}
          >
            {note}
          </Text>
        ) : null}
      </View>

      {status ? <StatusPill label={status} /> : null}
      {busy ? <ActivityIndicator size="small" color={COLOR.iconOnWell} /> : pill ? <RowPill label={pill} icon={pillIcon} /> : null}
      {checked ? <Glyph name="check" size={16} color={COLOR.ink} /> : null}
      {onPress && chevron && !pill && !action && !checked ? (
        <Glyph name={external ? "arrow-up-right" : "chevron-right"} size={15} color={COLOR.iconOnWell} />
      ) : null}
    </>
  );

  // A minimum, never a height. A row with a note is taller, and one at 200%
  // type is taller again; a fixed height clips both. In a headed section on
  // Android the row carries its own gutter and parts from the next with the
  // page's colour, since the card has no padding for a hairline to sit in.
  const shape = `flex-row items-center gap-space-4 py-space-4 ${edge}`;
  const height = { minHeight: isAndroid ? 58 : 50 };
  const a11y = checked ? { accessibilityState: { selected: true } } : {};

  if (!onPress) {
    return (
      <View className={shape} style={height}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      className={shape}
      style={height}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={pill ? `${pill}, ${title}` : undefined}
      {...a11y}
    >
      {body}
    </Pressable>
  );
}

/** A row whose value you can change, in place. 011.
 *
 *  **In place, not a sixth route.** The kit draws a tappable Name row and does
 *  not say what tapping it opens. A pushed screen or a modal is more screen
 *  than one field needs, and the row already has somewhere to put it.
 *
 *  The empty case is caught here so the message is the specific one (AC-6)
 *  rather than a generic failure. Anything else gets the house failure line:
 *  one short clause and the control that retries it, never a diagnosis. */
export function EditableRow({
  title,
  value,
  onSave,
  last,
}: {
  title: string;
  value: string | null;
  onSave: (next: string) => Promise<boolean>;
  last?: boolean;
}) {
  const COLOR = useColors();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const next = draft.trim();
    if (next.length === 0) {
      setError("A name cannot be empty.");
      return;
    }
    if (next === value) {
      setEditing(false);
      setError(null);
      return;
    }

    setSaving(true);
    const saved = await onSave(next);
    setSaving(false);
    if (saved) {
      setEditing(false);
      setError(null);
    } else {
      setError("That did not go through. Try again.");
    }
  }

  // A last row has no divider whether it is editing or not. It used to keep one
  // while open, which drew a hairline across the group's rounded bottom corner.
  const edge = useRowEdge(last);

  if (!editing) {
    return (
      <Row
        title={title}
        value={value ?? "Not set"}
        onPress={() => {
          setDraft(value ?? "");
          setError(null);
          setEditing(true);
        }}
        {...(last ? { last: true } : {})}
      />
    );
  }

  return (
    <View className={`py-space-4 ${edge}`}>
      <Text
        className={`font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`}
        style={{ fontSize: 15, lineHeight: 20 }}
      >
        {title}
      </Text>

      <View className="mt-space-3">
        <NameField
          tone={isAndroid ? "android" : "ios"}
          value={draft}
          onChange={(next) => {
            setDraft(next);
            setError(null);
          }}
          onSubmit={() => void save()}
          autoFocus
        />
      </View>

      {error ? (
        <Text
          className="mt-space-3 font-core text-text-danger"
          style={{ fontSize: 12.5, lineHeight: 17.5 }}
          accessibilityRole="alert"
        >
          {error}
        </Text>
      ) : null}

      <View className="mt-space-4 flex-row items-center justify-end gap-space-5">
        <Pressable
          onPress={() => {
            setEditing(false);
            setError(null);
          }}
          disabled={saving}
          className="min-h-tap-min justify-center"
          accessibilityRole="button"
        >
          <Text
            className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
            style={{ fontSize: 15 }}
          >
            Cancel
          </Text>
        </Pressable>

        <Pressable
          onPress={() => void save()}
          disabled={saving}
          // **Two fills, and they need two foregrounds.** Android's is blue, a
          // brand colour that is the same in both themes, so what sits on it has
          // to be too: `--text-on-solid`. iOS draws the inverse surface, which
          // does flip, so its foreground flips with it.
          //
          // Written as one pair for both, the Android control put near-black on
          // blue in dark, label and spinner together. This is 8a's ramp-value
          // defect, in the twin the answering pass named and left alone.
          className={`min-h-tap-min items-center justify-center rounded-pill px-space-6 ${
            isAndroid ? "bg-blue-600" : "bg-surface-inverse"
          }`}
          accessibilityRole="button"
        >
          {saving ? (
            <ActivityIndicator color={isAndroid ? COLOR.onBrand : COLOR.onSolid} />
          ) : (
            <Text
              className={`font-core font-medium ${
                isAndroid ? "text-text-on-solid" : "text-text-inverse"
              }`}
              style={{ fontSize: 15 }}
            >
              Save
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
