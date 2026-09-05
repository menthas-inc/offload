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
// `SPick`. The 5 September answer says `SegmentedControl` for these two, and the
// same entry lists this page among the kit screens still to be drawn, so the
// component contract leads and the kit catches up. Logged as a divergence.

import {
  THEMES,
  THEME_LABEL,
  TYPE_SIZES,
  TYPE_SIZE_LABEL,
  useAppearance,
  type Theme,
  type TypeSize,
} from "../../lib/appearance";
import pane from "../../app/(shell)/shell.module.css";

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
        <section className={pane.settingsBlock}>
          <h2 className={pane.settingsBlockTitle}>Theme</h2>
          <p className={pane.settingsNote}>System follows whatever this device is set to.</p>
          <Segmented<Theme>
            label="Theme"
            options={THEMES}
            labelFor={(value) => THEME_LABEL[value]}
            value={theme}
            onChange={setTheme}
          />
        </section>

        <section className={pane.settingsBlock}>
          <h2 className={pane.settingsBlockTitle}>Text size</h2>
          <p className={pane.settingsNote}>
            Larger sets the text bigger and leaves everything else where it is.
          </p>
          <Segmented<TypeSize>
            label="Text size"
            options={TYPE_SIZES}
            labelFor={(value) => TYPE_SIZE_LABEL[value]}
            value={size}
            onChange={setSize}
          />
        </section>
      </div>
    </>
  );
}

/** The `SegmentedControl` contract: two to four mutually exclusive views, one
 *  raised out of the track. offload's only tab-like control. */
function Segmented<T extends string>({
  label,
  options,
  labelFor,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  labelFor: (value: T) => string;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className={pane.segmented} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={pane.segment}
          aria-pressed={option === value}
          onClick={() => onChange(option)}
        >
          {labelFor(option)}
        </button>
      ))}
    </div>
  );
}
