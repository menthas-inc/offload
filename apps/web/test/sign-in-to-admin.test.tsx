// @vitest-environment happy-dom
//
// 2026-10-04. The admin panel asks staff for a fresh sign-in. The gate says
// why they are here, and the sign-in comes back to the panel.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const social = vi.fn(async () => ({ error: null }));
vi.mock("better-auth/react", () => ({ createAuthClient: () => ({ signIn: { social } }) }));

const { default: SignInPage } = await import("../src/app/(app)/sign-in/page");

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  social.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  window.history.replaceState(null, "", "/sign-in");
});

async function open(search: string) {
  window.history.replaceState(null, "", `/sign-in${search}`);
  await act(async () => {
    root.render(<SignInPage />);
  });
  await act(async () => {});
}
const google = () => [...host.querySelectorAll("button")].find((one) => one.textContent?.includes("Google"))!;

describe("the gate, reached from the admin panel", () => {
  it("says to sign in again for the panel, and comes back to it", async () => {
    await open("?to=admin");
    expect(host.textContent).toContain("Sign in again to open the admin panel.");
    await act(async () => {
      google().click();
    });
    expect(social).toHaveBeenCalledWith(expect.objectContaining({ callbackURL: `${window.location.origin}/admin` }));
  });

  it("lands on first run from anywhere else, and takes no other destination from the address", async () => {
    await open("?to=https://evil.test");
    expect(host.textContent).toContain("Use the account your invite was sent to.");
    await act(async () => {
      google().click();
    });
    expect(social).toHaveBeenCalledWith(expect.objectContaining({ callbackURL: `${window.location.origin}/welcome` }));
  });
});
