// @vitest-environment happy-dom
//
// 031 Settings, tightened: the two new controls on the web.
//
// The combobox that replaces the native selects on Country and Time zone
// (AC-6): filter by name or code, Not set first, a check on the current one,
// arrows and Enter, Escape closing with focus back on the field. And the
// choice tiles on Theme, Week starts on and Text size (AC-3): a radio group
// named by its heading, and picking one writes.

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

const { Combobox } = await import("../src/components/panes/SettingsRows");
const { AppearancePane } = await import("../src/components/panes/Appearance");

afterEach(() => {
  document.body.innerHTML = "";
  window.localStorage.clear();
});

async function render(node: React.ReactNode) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => root.render(node));
  return { host, root };
}

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function key(target: Element, name: string) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
}

const COUNTRIES = [
  { value: "PL", label: "Poland", code: "PL" },
  { value: "PT", label: "Portugal", code: "PT" },
  { value: "QA", label: "Qatar", code: "QA" },
];

async function country(value = "PT") {
  const onChange = vi.fn();
  const { host } = await render(
    <Combobox label="Country" value={value} options={COUNTRIES} notSet filterPlaceholder="Find a country" onChange={onChange} />,
  );
  const field = host.querySelector<HTMLElement>('[role="combobox"]')!;
  return { host, field, onChange };
}

const options = () => [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent);

describe("the combobox (AC-6)", () => {
  it("shows the value closed, and opens on the filter with Not set first and a check on the current one", async () => {
    const { field } = await country();
    expect(field.textContent).toContain("Portugal");
    expect(field.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector('[role="listbox"]')).toBeNull();

    await act(async () => field.click());
    expect(field.getAttribute("aria-expanded")).toBe("true");
    const list = document.querySelector('[role="listbox"]')!;
    expect(field.getAttribute("aria-controls")).toBe(list.id);
    expect((document.activeElement as HTMLInputElement).placeholder).toBe("Find a country");
    expect(options()).toEqual(["Not set", "Poland", "Portugal", "Qatar"]);
    const current = document.querySelector('[role="option"][aria-selected="true"]')!;
    expect(current.textContent).toBe("Portugal");
  });

  it("says Not set closed when there is no value", async () => {
    const { field } = await country("");
    expect(field.textContent).toContain("Not set");
  });

  it("filters by a name that contains the text or a code that equals it", async () => {
    const { field } = await country();
    await act(async () => field.click());
    const filter = document.activeElement as HTMLInputElement;
    await act(async () => type(filter, "tug"));
    expect(options()).toEqual(["Not set", "Portugal"]);
    await act(async () => type(filter, "pl"));
    expect(options()).toEqual(["Not set", "Poland"]);
  });

  it("moves with the arrows and picks with Enter, then gives focus back to the field", async () => {
    const { field, onChange } = await country();
    await act(async () => field.click());
    const filter = document.activeElement as HTMLInputElement;
    // Opens on the current one; one down is the next.
    await act(async () => key(filter, "ArrowDown"));
    await act(async () => key(filter, "Enter"));
    expect(onChange).toHaveBeenCalledWith("QA");
    expect(field.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(field);
  });

  it("picks Not set as an empty value", async () => {
    const { field, onChange } = await country();
    await act(async () => field.click());
    const notSet = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent === "Not set")!;
    await act(async () => notSet.click());
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("closes on Escape without picking, focus back on the field", async () => {
    const { field, onChange } = await country();
    await act(async () => field.click());
    await act(async () => key(document.activeElement!, "Escape"));
    expect(field.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(field);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes on a click anywhere else", async () => {
    const { field } = await country();
    await act(async () => field.click());
    await act(async () => document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(field.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps region headings for a grouped list", async () => {
    const { host } = await render(
      <Combobox
        label="Time zone"
        value="Europe/Lisbon"
        options={[
          { value: "Europe/Lisbon", label: "Lisbon", code: "Europe/Lisbon", group: "Europe" },
          { value: "Asia/Tokyo", label: "Tokyo", code: "Asia/Tokyo", group: "Asia" },
        ]}
        filterPlaceholder="Find a city"
        onChange={() => undefined}
      />,
    );
    await act(async () => host.querySelector<HTMLElement>('[role="combobox"]')!.click());
    const groups = [...document.querySelectorAll('[role="group"]')].map((g) => g.getAttribute("aria-label"));
    expect(groups).toEqual(["Europe", "Asia"]);
    expect(options()).toEqual(["Lisbon", "Tokyo"]);
  });
});

describe("the choice tiles (AC-3)", () => {
  it("are radio groups named by their headings, and picking one writes", async () => {
    window.localStorage.setItem("offload:theme", "light");
    const { host } = await render(<AppearancePane />);
    const theme = host.querySelector('[role="radiogroup"][aria-label="Theme"]')!;
    const radios = [...theme.querySelectorAll<HTMLElement>('[role="radio"]')];
    expect(radios.map((r) => r.textContent)).toEqual(["Light", "Dark", "System"]);
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);

    await act(async () => radios[1]!.click());
    expect(window.localStorage.getItem("offload:theme")).toBe("dark");
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);

    const size = host.querySelector('[role="radiogroup"][aria-label="Text size"]')!;
    expect([...size.querySelectorAll('[role="radio"]')].map((r) => r.textContent)).toEqual(["AaDefault", "AaLarger"]);
  });
});
