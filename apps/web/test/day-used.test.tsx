// @vitest-environment happy-dom
//
// The day's limit, drawn in the composer's place. Once an account has spent
// the day's model budget or started the day's turns, a dump can only be
// refused, so the field is not offered: the line says so where the field was,
// and the rest of the app works as before.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { DAY_USED, DayUsed } from "../src/components/shell/DayUsed";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the composer at the day's limit", () => {
  it("says the day is used and when it comes back, and offers nothing to type into", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.body.appendChild(document.createElement("div"));
    await act(async () => createRoot(host).render(<DayUsed />));
    expect(DAY_USED).toBe("Enough for today. Back tomorrow.");
    const line = host.querySelector("[role=status]");
    expect(line?.textContent).toBe(DAY_USED);
    expect(host.querySelector("textarea, input")).toBeNull();
    // Offload's own words, no dash of either kind.
    expect(DAY_USED).not.toMatch(/[–—]/);
  });
});
