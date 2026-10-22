// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WinnerHistoryModal from "../../app/WinnerHistoryModal";
import type { WinnerEntry } from "../../features/roulette/winnerHistory";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const early = new Date(2026, 0, 2, 3, 4).getTime();
const entries: WinnerEntry[] = [
  { itemId: "a", name: "古い名前", spunAt: early, winNumber: 1 },
  { itemId: "a", name: "新しい名前", spunAt: early + 60_000, winNumber: 2 },
];

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});
async function render(value = entries) {
  await act(async () => {
    root.render(<WinnerHistoryModal entries={value} />);
  });
}
async function click(text: string) {
  const button = Array.from(host.querySelectorAll("button")).find(
    (element) => element.textContent === text,
  )!;
  await act(async () => {
    button.click();
  });
}
function names() {
  return Array.from(
    host.querySelectorAll("tbody tr"),
    (row) => row.children[1].textContent,
  );
}

describe("winner history modal", () => {
  it("opens a labelled native modal, formats local timestamps, switches chronological order and closes", async () => {
    await render();
    const dialog = host.querySelector("dialog")!;
    expect(dialog.open).toBe(false);
    await click("当選者履歴");
    expect(dialog.open).toBe(true);
    expect(
      host.querySelector(`#${dialog.getAttribute("aria-labelledby")}`)
        ?.textContent,
    ).toBe("当選者履歴");
    expect(
      Array.from(host.querySelectorAll("th"), (cell) => cell.textContent),
    ).toEqual(["回した日時", "名前", "当選回数"]);
    expect(names()).toEqual(["新しい名前", "古い名前"]);
    expect(host.querySelector("tbody tr")!.children[2].textContent).toBe(
      "2回目",
    );
    expect(host.textContent).toContain("2026/01/02 03:04");
    const select = host.querySelector("select")!;
    await act(async () => {
      select.value = "asc";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(names()).toEqual(["古い名前", "新しい名前"]);
    await act(async () => {
      select.value = "desc";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(names()).toEqual(["新しい名前", "古い名前"]);
    await click("閉じる");
    expect(dialog.open).toBe(false);
  });
  it("reflects reset while open and keeps equal-time entries deterministic", async () => {
    await render(entries.map((entry) => ({ ...entry, spunAt: early })));
    await click("当選者履歴");
    expect(names()).toEqual(["新しい名前", "古い名前"]);
    await render([]);
    expect(host.querySelector("dialog")!.open).toBe(true);
    expect(host.querySelector("dialog")!.textContent).toContain(
      "当選者履歴はまだありません",
    );
    expect(host.querySelector("table")).toBeNull();
    expect(host.querySelector("select")!.disabled).toBe(true);
  });
});
