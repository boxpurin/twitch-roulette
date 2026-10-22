// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { itemsReducer } from "../../../features/participants/items";
import type { RouletteItem } from "../../../features/participants/items";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RouletteItems from "../../../features/participants/RouletteItems";

const items = [
  { id: "m", name: "手動", weight: 99, excluded: true },
  { id: "twitch:42", name: "視聴者", userId: "42", redemptions: 2, weight: 1 },
  { id: "n", name: "別の項目", weight: 3, excluded: false },
];

describe("exclusion controls", () => {
  it("offers optional account lookup and identifies linked participants", () => {
    const html = renderToStaticMarkup(
      <RouletteItems
        items={items}
        dispatch={() => {}}
        lookupUser={async () => ({
          id: "42",
          login: "viewer",
          displayName: "視聴者",
          profileImageUrl: "",
        })}
      />,
    );
    expect(html).toContain("Twitch ログイン名（任意）");
    expect(html).toContain("ユーザーを確認");
    expect(html).toContain("Twitch ID: 42");
  });
  it("keeps excluded rows and assigns probabilities by ID rather than row index", () => {
    const html = renderToStaticMarkup(
      <RouletteItems items={items} dispatch={() => {}} />,
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(
      Array.from(
        document.querySelectorAll("thead th"),
        (cell) => cell.textContent,
      ),
    ).toEqual(["抽選から除外", "名前", "倍率", "当選確率", "編集", "削除"]);
    const rows = Array.from(
      document.querySelectorAll("tbody tr"),
      (row) => row.outerHTML,
    );
    expect(
      Array.from(
        document.querySelectorAll("tbody tr"),
        (row) => row.children.length,
      ),
    ).toEqual([6, 6, 6]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('type="checkbox"');
    expect(rows[0]).toContain('checked=""');
    expect(rows[0]).toContain('aria-label="項目 1（手動）を抽選から除外"');
    expect(rows[0]).toContain(">0%</td>");
    expect(rows[0]).toContain("抽選対象外");
    expect(rows[0]).toContain(">99 倍</td>");
    expect(rows[1]).toContain('type="checkbox"');
    expect(rows[1]).not.toContain('checked=""');
    expect(rows[1]).toContain(">25%</td>");
    expect(rows[1]).toContain("交換 2 回");
    expect(rows[2]).toContain(">75%</td>");
    expect(html).toContain("抽選対象 2 件 / 全 3 件");
  });
  it("disables exclusion controls during spins using the containing fieldset", () => {
    const html = renderToStaticMarkup(
      <RouletteItems items={items} dispatch={() => {}} disabled />,
    );
    expect(html).toMatch(
      /<fieldset[^>]*disabled="">[\s\S]*type="checkbox"[\s\S]*<\/fieldset>/,
    );
  });
});

describe("table interactions", () => {
  it("toggles exclusion, edits with save/cancel, deletes and disables controls during spins", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let current: RouletteItem[] = items.map((item) => ({ ...item }));
    let disabled = false;
    const render = () =>
      root.render(
        <RouletteItems
          items={current}
          disabled={disabled}
          dispatch={(action) => {
            current = itemsReducer(current, action);
            render();
          }}
        />,
      );
    const click = async (selector: string) => {
      await act(async () => {
        host.querySelector<HTMLElement>(selector)!.click();
      });
    };
    const input = async (selector: string, value: string) => {
      await act(async () => {
        const element = host.querySelector<HTMLInputElement>(selector)!;
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )!.set!.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    try {
      await act(async () => {
        render();
      });
      await click('tbody input[type="checkbox"]');
      expect(current[0].excluded).toBe(false);
      expect(host.querySelector("tbody tr")!.children[3].textContent).toBe(
        "96.12%",
      );
      await click('tbody input[type="checkbox"]');
      expect(current[0].excluded).toBe(true);
      expect(host.querySelector("tbody tr")!.children[3].textContent).toBe(
        "0%",
      );
      await click('[aria-label="項目 1 を編集"]');
      const editRow = host.querySelector("tbody tr")!.nextElementSibling!;
      expect(editRow.querySelector("td")!.colSpan).toBe(6);
      expect(editRow.querySelector("form")).not.toBeNull();
      await input(".item-edit input:not([type])", "変更後");
      await input('.item-edit input[type="number"]', "5");
      await act(async () => {
        host
          .querySelector(".item-edit")!
          .dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          );
      });
      expect(current[0]).toMatchObject({ name: "変更後", weight: 5 });
      expect(host.querySelector(".item-edit")).toBeNull();
      await click('[aria-label="項目 1 を編集"]');
      await input(".item-edit input:not([type])", "キャンセルする名前");
      await click('.item-edit button[type="button"]');
      expect(current[0].name).toBe("変更後");
      await click('[aria-label="項目 1 を削除"]');
      expect(current.map((item) => item.id)).toEqual(["twitch:42", "n"]);
      disabled = true;
      await act(async () => {
        render();
      });
      expect(
        Array.from(host.querySelectorAll("tbody input, tbody button")).every(
          (element) => element.matches(":disabled"),
        ),
      ).toBe(true);
      await click('tbody input[type="checkbox"]');
      await click('[aria-label="項目 1 を削除"]');
      expect(current).toHaveLength(2);
      expect(current[0].excluded).not.toBe(true);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
  it("shows the empty message without a table", () => {
    const html = renderToStaticMarkup(
      <RouletteItems items={[]} dispatch={() => {}} />,
    );
    expect(html).toContain("まだ項目がありません");
    expect(html).not.toContain("<table");
  });
});
