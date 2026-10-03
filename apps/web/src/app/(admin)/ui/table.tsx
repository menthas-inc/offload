// One table shape for every admin page, from the kit's `ATable` and `ARow`:
// hairlines only, no zebra, numbers right and tabular. A page states its
// columns once and hands the same list to the header and to every row.

import Link from "next/link";
import styles from "../admin.module.css";

export interface Col {
  label: string;
  /** A fixed width in px. The one column without one takes the rest. */
  w?: number;
  right?: boolean;
}

function cellStyle(col: Col): React.CSSProperties {
  return {
    width: col.w,
    flex: col.w ? "0 0 auto" : 1,
    minWidth: 0,
    textAlign: col.right ? "right" : "left",
  };
}

export function Table({ cols, children }: { cols: Col[]; children: React.ReactNode }) {
  return (
    <div className={styles.table} role="table">
      <div className={styles.thead} role="row">
        {cols.map((col, index) => (
          <span key={index} role="columnheader" style={cellStyle(col)}>
            {col.label}
          </span>
        ))}
      </div>
      {children}
    </div>
  );
}

interface RowProps {
  cols: Col[];
  cells: React.ReactNode[];
  last?: boolean;
  /** Recedes rather than disappears: a disabled account, someone already in. */
  muted?: boolean;
}

function cellsOf(cols: Col[], cells: React.ReactNode[], first?: (cell: React.ReactNode) => React.ReactNode) {
  return cells.map((cell, index) => (
    <span key={index} role="cell" className={styles.cell} style={cellStyle(cols[index] ?? { label: "" })}>
      {index === 0 && first ? first(cell) : cell}
    </span>
  ));
}

function rowClass(last?: boolean, muted?: boolean, link?: boolean): string {
  return [styles.row, last ? styles.rowLast : "", muted ? styles.rowMuted : "", link ? styles.rowLink : ""].filter(Boolean).join(" ");
}

export function Row({ cols, cells, last, muted }: RowProps) {
  return (
    <div className={rowClass(last, muted)} role="row">
      {cellsOf(cols, cells)}
    </div>
  );
}

/** A row that opens a page. The first cell is the link and it stretches over
 *  the row, so the whole row is the target while its buttons stay buttons:
 *  they sit above the link and act without opening it. */
export function RowLink({ cols, cells, last, muted, href, label }: RowProps & { href: string; label: string }) {
  return (
    <div className={rowClass(last, muted, true)} role="row">
      {cellsOf(cols, cells, (cell) => (
        <Link href={href} className={styles.rowAnchor} aria-label={label}>
          {cell}
        </Link>
      ))}
    </div>
  );
}

/** A name over a quiet second line, which is how the kit writes a person. */
export function Lines({ main, sub }: { main: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <span>
      <b className={styles.email}>{main}</b>
      {sub ? <span className={styles.note}>{sub}</span> : null}
    </span>
  );
}
