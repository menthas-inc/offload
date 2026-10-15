// @vitest-environment happy-dom
//
// 027, 2026-10-15. Answer on a Today question card makes the conversation
// that asked the current one; the composer, which is nobody's child, hears
// it through an event and loads that conversation in place of its own, with
// the question's typed invitation in the field.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer } from "../src/components/shell/Composer";
import { ToastProvider } from "../src/components/shell/Toast";
import { RESUME_COMPOSER } from "../src/lib/dump";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const asked = {
  id: "m1",
  role: "person",
  text: "Fwd: your tickets",
  mail: { subject: "Your tickets", note: "" },
  state: "answered",
  turnId: "t1",
  found: [],
  waiting: null,
  threads: [],
  sources: [],
};
const reply = {
  ...asked,
  id: "m2",
  role: "offload",
  text: 'Filed "Odyssey 70mm". Which day and time?',
  mail: null,
  question: { id: "q1", field: "time", text: 'Filed "Odyssey 70mm". Which day and time?', options: [{ label: "Not that", kind: "plain" }], ordinal: 1 },
};

let current: unknown[] = [];
/** A read the test lets go of by hand, for the race with the mount's. */
let held: ((value: Response) => void) | null = null;
let holdNext = false;
const answer = () => new Response(JSON.stringify({ conversationId: current.length ? "v1" : null, messages: current }), { status: 200 });
vi.stubGlobal("fetch", async () => {
  if (holdNext) {
    holdNext = false;
    const body = answer();
    return new Promise<Response>((resolve) => {
      held = () => resolve(body);
    });
  }
  return answer();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the composer on Answer", () => {
  it("loads the conversation that asked and holds its invitation", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      createRoot(host).render(
        <ToastProvider>
          <Composer onFiled={() => {}} />
        </ToastProvider>,
      ),
    );
    const field = host.querySelector("textarea")!;
    expect(field.placeholder).toBe("Dump anything");

    current = [asked, reply];
    await act(async () => {
      window.dispatchEvent(new CustomEvent(RESUME_COMPOSER));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host.textContent).toContain("Which day and time?");
    expect(field.placeholder).toBe("Which day and time? e.g. Friday at 5pm");
    expect(document.activeElement).toBe(field);
  });

  it("keeps the conversation Answer loaded when the mount's slower read lands after it", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.body.appendChild(document.createElement("div"));
    current = [{ ...asked, id: "old", text: "an older dump", mail: null }];
    holdNext = true;
    await act(async () =>
      createRoot(host).render(
        <ToastProvider>
          <Composer onFiled={() => {}} />
        </ToastProvider>,
      ),
    );
    current = [asked, reply];
    await act(async () => {
      window.dispatchEvent(new CustomEvent(RESUME_COMPOSER));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      held!(new Response());
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host.textContent).toContain("Which day and time?");
    expect(host.textContent).not.toContain("an older dump");
  });
});
