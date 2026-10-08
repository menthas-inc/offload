// @vitest-environment happy-dom
//
// The composer at the wrap. Words that wrap beside the controls open the box
// to the full width, where the same words fit on one line again. Measured
// height alone closed it on the next character and wrapped it again on the
// one after, so the field jumped between one and two lines on every key
// (owner, 2026-10-07). The phones latched open on 2026-09-26; the web did not.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Composer } from "../src/components/shell/Composer";
import { ToastProvider } from "../src/components/shell/Toast";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ messages: [] }), { status: 200 }));

// One line is 24px. Beside the controls ten characters fill it; across the
// open box twenty do.
const LINE = 24;
beforeEach(() => {
  Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLTextAreaElement) {
      const open = this.closest("[data-expanded]") !== null;
      const perLine = open ? 20 : 10;
      return Math.max(1, Math.ceil(this.value.length / perLine)) * LINE;
    },
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});

function type(field: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("the composer at the wrap", () => {
  it("stays open once the words wrap, until the draft is empty", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.body.appendChild(document.createElement("div"));
    await act(async () => createRoot(host).render(
        <ToastProvider>
          <Composer onFiled={() => {}} />
        </ToastProvider>,
      ));
    const field = host.querySelector("textarea")!;
    const box = () => host.querySelector("[data-expanded]");

    await act(async () => type(field, "a"));
    expect(box()).toBeNull();

    for (const length of [11, 12, 13, 14]) {
      await act(async () => type(field, "a".repeat(length)));
      expect(box(), `${length} characters`).not.toBeNull();
      // Measured at the open width, on the key that opened it too: a field
      // two lines high there dropped to one on the next key.
      expect(field.style.height, `${length} characters`).toBe(`${LINE}px`);
    }

    await act(async () => type(field, ""));
    expect(box()).toBeNull();
  });
});
