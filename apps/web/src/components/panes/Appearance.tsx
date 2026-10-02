"use client";

// Settings, Appearance: the two preferences the nav foot also carries.
//
// The nav rows are the shortcut and this is where the choices are laid out. Both
// read the same stored value through `useAppearance`, so changing one moves the
// other while you are looking at it.
//
// **Three themes, not two.** `system` means follow the device, which is what an
// unset preference already did; naming it makes it somewhere you can go back to
// rather than a state you can only leave.
//
// `WSettings.jsx` draws an Appearance page and its Theme block is a radio list,
// `SPick`. The 5 September answer said `SegmentedControl` for these two; 031
// made them preview tiles, which show what each choice gives, and kept
// `Segmented` for switching views.

import {
  THEMES,
  THEME_LABEL,
  TYPE_SIZES,
  TYPE_SIZE_LABEL,
  useAppearance,
  type Theme,
  type TypeSize,
} from "../../lib/appearance";
import { ChoiceTiles, Group } from "./SettingsRows";
import { SizePreview, ThemePreview } from "./ChoicePreviews";
import pane from "../../app/(shell)/shell.module.css";
import { Icon } from "../Icon";

export function AppearancePane() {
  const { theme, size, setTheme, setSize } = useAppearance();

  return (
    <>
      <div className={pane.paneHead}>
        <div style={{ minWidth: 0 }}>
          <h1 className={`${pane.paneTitle} ${pane.paneTitleBig}`}>Appearance</h1>
          <p className={pane.paneSub}>On this device</p>
        </div>
      </div>

      <div className={pane.paneBody}>
        <Group label="Theme" icon="blend" caption="System follows whatever this device is set to.">
          <ChoiceTiles<Theme>
            label="Theme"
            options={THEMES.map((value) => ({ value, label: THEME_LABEL[value], preview: <ThemePreview theme={value} /> }))}
            value={theme}
            onChange={setTheme}
          />
        </Group>

        <Group
          label="Text size"
          icon="type"
          caption="Larger sets the text bigger and leaves everything else where it is."
        >
          <ChoiceTiles<TypeSize>
            label="Text size"
            options={TYPE_SIZES.map((value) => ({ value, label: TYPE_SIZE_LABEL[value], preview: <SizePreview size={value} /> }))}
            value={size}
            onChange={setSize}
          />
        </Group>
      </div>
    </>
  );
}

/** The `SegmentedControl` contract: two to four mutually exclusive views, one
 *  raised out of the track. offload's only tab-like control. Exported for a
 *  view switch; since 031 no settings choice uses it. */
export function Segmented<T extends string>({
  label,
  options,
  labelFor,
  iconFor,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  labelFor: (value: T) => string;
  /** 030. The icon variant, a thread's List | Map switch: each segment draws
   *  its icon and its label names it. */
  iconFor?: (value: T) => string;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className={pane.segmented} role="group" aria-label={label} data-icons={iconFor ? true : undefined}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={pane.segment}
          aria-pressed={option === value}
          aria-label={iconFor ? labelFor(option) : undefined}
          title={iconFor ? labelFor(option) : undefined}
          onClick={() => onChange(option)}
        >
          {iconFor ? <Icon name={iconFor(option)} size={16} /> : labelFor(option)}
        </button>
      ))}
    </div>
  );
}
