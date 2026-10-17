// @vitest-environment happy-dom
//
// 2026-10-17 (the owner). Archive is back as an action on your own rows, beside
// Delete: tidying away what is not in use any more without losing it. Somebody
// else's row still offers Archive alone, and an archived row Put back.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { RowTools } from "../src/components/panes/RowTools";

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function render(props: { archived: boolean; canDelete: boolean }, did: string[]) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.body.appendChild(document.createElement("div")));
  act(() =>
    root!.render(
      <RowTools title="Ferry" {...props} onEdit={() => did.push("edit")} onArchive={() => did.push("archive")} onDelete={() => did.push("delete")} />,
    ),
  );
}
const tools = () => [...document.querySelectorAll("button")].map((one) => one.getAttribute("aria-label"));

describe("a row's ways out", () => {
  it("offer Archive and Delete on your own row", () => {
    const did: string[] = [];
    render({ archived: false, canDelete: true }, did);
    expect(tools()).toEqual(["Edit Ferry", "Archive Ferry", "Delete Ferry"]);
    act(() => (document.querySelector('button[aria-label="Archive Ferry"]') as HTMLButtonElement).click());
    expect(did).toEqual(["archive"]);
  });

  it("offer Archive alone on somebody else's, and Put back on an archived one", () => {
    render({ archived: false, canDelete: false }, []);
    expect(tools()).toEqual(["Edit Ferry", "Archive Ferry"]);
    act(() => root?.unmount());
    render({ archived: true, canDelete: true }, []);
    expect(tools()).toEqual(["Edit Ferry", "Put Ferry back in the list"]);
  });
});
