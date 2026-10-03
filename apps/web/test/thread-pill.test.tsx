// @vitest-environment happy-dom
//
// 027 T3.2, AC-26. The thread pill is one component: the turn footer draws it
// at 30, Today at 24, a tap opens the thread, and inside a row it is a control
// of its own rather than part of the row's title.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { TurnFooter } = await import("../src/components/shell/TurnFooter");
const { ThreadPill } = await import("../src/components/shell/ThreadPill");
const { ContentRowView } = await import("../src/components/panes/ContentRowView");
type Row = import("../src/lib/threads").ContentRow;

afterEach(() => {
  document.body.innerHTML = "";
});

async function render(node: React.ReactNode): Promise<HTMLElement> {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () => createRoot(host).render(node));
  return host;
}

const row = {
  id: "c1",
  type: "task",
  title: "Renew the bike insurance",
  body: null,
  url: null,
  imageUrl: null,
  photo: null,
  createdAt: "2026-09-20T10:00:00Z",
  archivedAt: null,
  doneAt: null,
  dueAt: null,
  occursAt: null,
  occursEndAt: null,
  rrule: null,
  isReminder: false,
  onCalendar: false,
  priority: 0,
  priorityPinned: false,
  labels: [],
  place: null,
  location: null,
  placeId: null,
  seriesRef: null,
  allDay: false,
  author: { accountId: "a1", displayName: "Jo", isYou: true },
  canDelete: true,
  canMove: true,
  filingAt: null,
} as Row;

const handlers = {
  editing: null,
  draft: "",
  asking: null,
  arrived: new Set<string>(),
  onDraft: () => undefined,
  onEdit: () => undefined,
  onSaveTitle: () => undefined,
  onStopEditing: () => undefined,
  onArchive: () => undefined,
  onAsk: () => undefined,
  onDelete: () => undefined,
};

describe("027 AC-26 the thread pill", () => {
  it("is what the turn footer draws, at 30, opening the thread", async () => {
    const host = await render(<TurnFooter refs={[{ id: "t1", name: "Flat", icon: "house", hue: 2 }]} />);
    const pill = host.querySelector('a[href="/threads/t1"]')!;
    expect(pill).not.toBeNull();
    expect(pill.getAttribute("data-size")).toBe("30");
    expect(pill.textContent).toBe("Flat");
    // 037. The thread's own icon, on its hue, in place of the lasso.
    const mark = pill.firstElementChild as HTMLElement;
    expect(mark.style.getPropertyValue("--hue")).toBe("var(--label-2)");
    expect((mark.firstElementChild as HTMLElement).style.maskImage).toContain("/icons/house.svg");
  });

  it("is drawn at 24 for Today, and as plain ink when its card already opens the thread", async () => {
    const host = await render(
      <>
        <ThreadPill id="t1" name="Flat" icon="house" hue={2} size={24} />
        <ThreadPill id="t2" name="Work" icon="briefcase" hue={3} size={24} still />
      </>,
    );
    expect(host.querySelector('a[href="/threads/t1"]')!.getAttribute("data-size")).toBe("24");
    expect(host.querySelector('a[href="/threads/t2"]')).toBeNull();
    expect(host.textContent).toContain("Work");
  });

  it("sits on a row's marks line as its own control, apart from the row's title", async () => {
    const host = await render(
      <ContentRowView row={row} lead={null} meta={null} handlers={handlers} thread={{ id: "t1", name: "Flat", icon: "house", hue: 2 }} />,
    );
    const pill = host.querySelector('a[href="/threads/t1"]')!;
    expect(pill).not.toBeNull();
    expect(pill.getAttribute("data-size")).toBe("24");
    const title = host.querySelector('a[href="/content/c1?from=thread"]')!;
    expect(title).not.toBeNull();
    expect(title.contains(pill)).toBe(false);
    expect(pill.contains(title)).toBe(false);
  });
});
