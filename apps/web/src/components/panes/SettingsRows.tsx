"use client";

// The pieces every settings page is made of, on web.
//
// **The same vocabulary as the phones and deliberately not the same shape.**
// `SettingsDetail.jsx` draws boxed, fill-backed cards with inset dividers,
// which is what a phone list looks like; `WSettings.jsx` draws open blocks with
// a section label and no container at all, which is what the rest of this
// shell looks like. Forcing the phones' cards onto web would be a divergence
// from the kit dressed up as consistency.
//
// 031 made the label a heading. A section with a glyph opens with a tile, a
// 16px heading and an optional caption, a hairline under it, open rows below;
// a label with no glyph keeps the small label it always had, for the index,
// which is a navigation list, and the calendar page one level down. Rows
// gained an outline pill for a row that acts in place (End, Withdraw, Copy)
// and a moss status pill (This device, Connected). The combobox and the
// choice tiles are here too, because every settings page draws from this file
// and nothing outside Settings uses either.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "../Icon";
import { matchesFilter } from "../../lib/settings";
import styles from "../../app/(shell)/shell.module.css";

export function Group({
  label,
  icon,
  caption,
  count,
  children,
}: {
  label?: string;
  /** 031. The section's glyph. With it, the label is a heading; without it,
   *  the small label as before. */
  icon?: string | undefined;
  caption?: string | undefined;
  /** 019. A count in the label's trailing slot: `4 of 7 in use`. Under a
   *  heading, the pill beside it. */
  count?: string | undefined;
  children: React.ReactNode;
}) {
  if (label && icon) {
    return (
      <section className={styles.settingsSection}>
        <div className={styles.settingsHead}>
          <span className={styles.settingsTile} aria-hidden="true">
            <Icon name={icon} size={17} />
          </span>
          <div className={styles.settingsHeadText}>
            <h2 className={styles.settingsHeading}>
              {label}
              {count ? <span className={styles.settingsCount}>{count}</span> : null}
            </h2>
            {caption ? <p className={styles.settingsCaption}>{caption}</p> : null}
          </div>
        </div>
        <div>{children}</div>
      </section>
    );
  }
  return (
    <section className={styles.settingsBlock}>
      {label ? (
        <h2 className={styles.settingsLabel}>
          {count ? <span className={styles.settingsLabelText}>{label}</span> : label}
          {count ? <span className={styles.settingsLabelCount}>{count}</span> : null}
        </h2>
      ) : null}
      <div>{children}</div>
    </section>
  );
}

/** A state, not a control. `on` is the moss one with its dot (This device,
 *  Connected); `neutral` says something true that is not on (Ready,
 *  Unavailable). */
export function StatusPill({ children, tone = "on" }: { children: React.ReactNode; tone?: "on" | "neutral" }) {
  return (
    <span className={styles.settingsStatus} data-tone={tone}>
      {children}
    </span>
  );
}

interface RowProps {
  title: string;
  note?: string | undefined;
  /** The current state, on the right. Absent rather than invented. */
  value?: string | undefined;
  icon?: string | undefined;
  /** A row that goes somewhere. Omit for one that only states something. */
  href?: string | undefined;
  /** 031. Leaves the app: a new tab and `arrow-up-right` for the chevron. */
  external?: boolean;
  /** 031. A file handed over rather than a page: the contact card. */
  download?: string | undefined;
  last?: boolean;
  /** 022. The dot on the lead, for a request waiting on the viewer. */
  badge?: boolean;
  /** 031. A row that acts in place: the whole row is the button and the
   *  outline pill says what it does, where a value and a chevron would be. */
  pill?: string | undefined;
  pillIcon?: string | undefined;
  onClick?: (() => void) | undefined;
  /** The button's name when the pill's word alone would not say what it acts
   *  on: "End" is every row's. */
  actionLabel?: string | undefined;
  disabled?: boolean;
  /** 031. The moss status pill. */
  status?: string | undefined;
  /** 031. A row that is an action and has no pill: medium weight. */
  strong?: boolean;
  /** Figures in the title line up: the mail address. */
  tabular?: boolean;
}

export function Row({
  title,
  note,
  value,
  icon,
  href,
  external,
  download,
  last,
  badge,
  pill,
  pillIcon,
  onClick,
  actionLabel,
  disabled,
  status,
  strong,
  tabular,
}: RowProps) {
  const body = (
    <>
      {icon ? (
        <span className={styles.settingsIcon} aria-hidden="true">
          <Icon name={icon} size={15} />
          {badge ? <span className={styles.settingsDot} /> : null}
        </span>
      ) : null}

      <span className={styles.settingsText}>
        <span className={styles.settingsTitle} data-strong={strong || undefined} data-tabular={tabular || undefined}>
          {title}
        </span>
        {note ? <span className={styles.settingsNote}>{note}</span> : null}
      </span>

      {status ? <StatusPill>{status}</StatusPill> : null}
      {pill ? (
        <span className={styles.settingsPill}>
          {pillIcon ? <Icon name={pillIcon} size={14} /> : null}
          {pill}
        </span>
      ) : (
        <>
          {value ? <span className={styles.settingsValue}>{value}</span> : null}
          {href ? (
            <span className={styles.settingsChevron} aria-hidden="true">
              <Icon name={external || download ? "arrow-up-right" : "chevron-right"} size={15} />
            </span>
          ) : null}
        </>
      )}
    </>
  );

  const className = `${styles.settingsRow} ${last ? styles.settingsRowLast : ""}`;

  if (onClick) {
    return (
      <button
        type="button"
        className={`${styles.settingsRowButton} ${last ? styles.settingsRowLast : ""}`}
        onClick={onClick}
        disabled={disabled}
        aria-label={actionLabel}
      >
        {body}
      </button>
    );
  }

  if (!href) {
    return <div className={className}>{body}</div>;
  }

  if (download || external) {
    return (
      <a
        href={href}
        className={className}
        aria-label={actionLabel}
        {...(download ? { download } : { target: "_blank", rel: "noreferrer" })}
      >
        {body}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}

/** A row whose value you can change. 011.
 *
 *  **It edits in place.** The kit draws a tappable Name row and does not say
 *  what tapping it opens; a dialog or a sixth route would both be more screen
 *  than one field needs, and the row already has somewhere to put it.
 *
 *  The empty case is caught here rather than by the server, so the message is
 *  the specific one (`AC-6`) instead of a generic failure. Everything else the
 *  server refuses gets the house failure line: one short clause and a control
 *  that acts on it, never a diagnosis. */
export function EditableRow({
  title,
  value,
  placeholder,
  maxLength,
  label,
  onSave,
  last,
}: {
  title: string;
  value: string | null;
  placeholder: string;
  maxLength: number;
  label: string;
  onSave: (next: string) => Promise<boolean>;
  last?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);

  function open() {
    setDraft(value ?? "");
    setError(null);
    setEditing(true);
  }

  function close() {
    setEditing(false);
    setError(null);
  }

  async function save() {
    const next = draft.trim();
    if (next.length === 0) {
      setError("A name cannot be empty.");
      return;
    }
    if (next === value) {
      close();
      return;
    }

    setSaving(true);
    const saved = await onSave(next);
    setSaving(false);
    if (saved) close();
    else setError("That did not go through. Try again.");
  }

  const className = `${styles.settingsRow} ${last && !error ? styles.settingsRowLast : ""}`;

  if (!editing) {
    return (
      <div className={className}>
        <span className={styles.settingsText}>
          <span className={styles.settingsTitle}>{title}</span>
        </span>
        <span className={styles.settingsValue}>{value ?? "Not set"}</span>
        <button type="button" className={styles.settingsEditText} onClick={open}>
          {value ? "Change" : "Set"}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className={className}>
        <span className={styles.settingsText}>
          <span className={styles.settingsTitle}>{title}</span>
        </span>

        <span className={styles.settingsEdit}>
          <input
            ref={field}
            className={styles.settingsInput}
            type="text"
            value={draft}
            maxLength={maxLength}
            placeholder={placeholder}
            aria-label={label}
            disabled={saving}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
              if (event.key === "Escape") close();
            }}
          />
          <button
            type="button"
            className={styles.settingsEditButton}
            onClick={() => void save()}
            disabled={saving}
          >
            Save
          </button>
          <button type="button" className={styles.settingsEditText} onClick={close}>
            Cancel
          </button>
        </span>
      </div>

      {error ? (
        <p className={styles.settingsRowError} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

export interface ComboOption {
  value: string;
  label: string;
  /** Matched whole by the filter: a country's ISO code, a zone's name. */
  code?: string | undefined;
  /** A region heading over its run of options. Options of one group sit
   *  together, in the order given. */
  group?: string | undefined;
}

/** 031. Country and Time zone, which were native selects: in dark the closed
 *  control kept the browser's white field with light grey text. Drawn from
 *  tokens, so dark is not a special case.
 *
 *  The closed field is a plain button named for what it sets. It opens a
 *  popover whose filter is the combobox, the editable pattern: it holds focus
 *  while open and drives the list by `aria-activedescendant`. Arrows move,
 *  Enter picks, Escape closes with focus back on the field, and Tab or a
 *  click anywhere else closes it. */
export function Combobox({
  label,
  value,
  options,
  notSet,
  filterPlaceholder,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly ComboOption[];
  /** Offer Not set first, picked as the empty value. */
  notSet?: boolean;
  filterPlaceholder: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLSpanElement>(null);
  const field = useRef<HTMLButtonElement>(null);
  const filter = useRef<HTMLInputElement>(null);

  const lead: ComboOption[] = useMemo(() => (notSet ? [{ value: "", label: "Not set" }] : []), [notSet]);
  const shown = useMemo(() => [...lead, ...options.filter((o) => matchesFilter(o, query))], [lead, options, query]);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (open) filter.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${id}-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, id]);

  // Clicking anywhere else is a cancel, as the calendar's Disconnect does it.
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent): void => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away, true);
    return () => document.removeEventListener("mousedown", away, true);
  }, [open]);

  function show() {
    setQuery("");
    setActive(Math.max(0, [...lead, ...options].findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function close() {
    setOpen(false);
    field.current?.focus();
  }

  function pick(next: string) {
    close();
    if (next !== value) onChange(next);
  }

  function onFilterKey(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((at) => Math.min(shown.length - 1, Math.max(0, at + step)));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = shown[active];
      if (option) pick(option.value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      // Focus goes on to wherever Tab takes it; a list left open behind it
      // would answer arrows nobody is pressing.
      setOpen(false);
    }
  }

  // The list in render order, each option with its place for the arrows,
  // runs of one group under that group's heading.
  // Not set is a run of its own, with the rule under it.
  const runs: { group: string | undefined; items: { option: ComboOption; at: number }[]; lead?: boolean }[] = [];
  shown.forEach((option, at) => {
    if (notSet && at === 0) {
      runs.push({ group: undefined, items: [{ option, at }], lead: true });
      return;
    }
    const last = runs[runs.length - 1];
    if (last && !last.lead && last.group === option.group) last.items.push({ option, at });
    else runs.push({ group: option.group, items: [{ option, at }] });
  });

  const optionRow = ({ option, at }: { option: ComboOption; at: number }) => (
    <div
      key={`${option.value}:${at}`}
      id={`${id}-${at}`}
      role="option"
      aria-selected={option.value === value}
      className={styles.comboOption}
      data-active={at === active || undefined}
      data-quiet={(notSet && at === 0) || undefined}
      // Keep focus in the filter, so a click is a pick and not a blur.
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={() => setActive(at)}
      onClick={() => pick(option.value)}
    >
      <span className={styles.comboOptionLabel}>{option.label}</span>
      {option.value === value ? <Icon name="check" size={14} /> : null}
    </div>
  );

  return (
    <span ref={box} className={styles.combo}>
      <button
        ref={field}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        className={styles.comboField}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            show();
          }
        }}
      >
        <span className={styles.comboValue}>{current?.label ?? "Not set"}</span>
        <Icon name="chevron-down" size={14} />
      </button>

      {open ? (
        <span className={styles.comboPop}>
          <span className={styles.comboFilter}>
            <Icon name="search" size={15} />
            <input
              ref={filter}
              className={styles.comboFilterInput}
              value={query}
              placeholder={filterPlaceholder}
              role="combobox"
              aria-label={label}
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={shown[active] ? `${id}-${active}` : undefined}
              autoComplete="off"
              onChange={(event) => {
                setQuery(event.target.value);
                // The first real match, so Enter after a few letters picks
                // what was typed for rather than Not set.
                setActive(notSet && options.some((o) => matchesFilter(o, event.target.value)) ? 1 : 0);
              }}
              onKeyDown={onFilterKey}
            />
          </span>
          <div id={listId} role="listbox" aria-label={label} className={styles.comboList}>
            {runs.map((run, index) =>
              run.group ? (
                <div key={`${run.group}:${index}`} role="group" aria-label={run.group}>
                  <div className={styles.comboGroup} aria-hidden="true">
                    {run.group}
                  </div>
                  {run.items.map(optionRow)}
                </div>
              ) : (
                <div key={`run:${index}`} role="presentation">
                  {run.items.map(optionRow)}
                  {run.lead ? <hr className={styles.comboRule} /> : null}
                </div>
              ),
            )}
          </div>
        </span>
      ) : null}
    </span>
  );
}

/** 031. Choosing one of a few shows what you get: a light and a dark screen
 *  for Theme, the week with its first day filled, two sizes of Aa. A radio
 *  group named by its section's heading; one press writes, as the segmented
 *  control did, and the arrows move the choice as native radios do. */
export function ChoiceTiles<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string; preview: React.ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const group = useRef<HTMLDivElement>(null);
  const checked = Math.max(0, options.findIndex((o) => o.value === value));

  function move(event: React.KeyboardEvent, at: number) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (at + step + options.length) % options.length;
    onChange(options[next]!.value);
    group.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  }

  return (
    <div ref={group} role="radiogroup" aria-label={label} className={styles.tiles} data-n={options.length}>
      {options.map((option, at) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={at === checked ? 0 : -1}
          className={styles.tile}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => move(event, at)}
        >
          <span className={styles.tilePreview} aria-hidden="true">
            {option.preview}
          </span>
          <span className={styles.tileLabel}>
            <span className={styles.tileRadio} aria-hidden="true" />
            {option.label}
          </span>
        </button>
      ))}
    </div>
  );
}
