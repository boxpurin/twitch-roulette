// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ManualItemForm from "../../../features/participants/ManualItemForm";
import { itemsReducer } from "../../../features/participants/items";
import type {
  ItemsAction,
  RouletteItem,
} from "../../../features/participants/items";
import type { TwitchUser } from "../../../features/twitch-auth/session";

const viewer: TwitchUser = {
  id: "42",
  login: "viewer",
  displayName: "視聴者",
  profileImageUrl: "https://static-cdn.jtvnw.net/viewer.png",
};
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let items: RouletteItem[];
let disabled = false;
let lookup: ReturnType<
  typeof vi.fn<(login: string, signal: AbortSignal) => Promise<TwitchUser>>
>;

function render() {
  root.render(
    <ManualItemForm
      items={items}
      dispatch={(action: ItemsAction) => {
        items = itemsReducer(items, action);
        render();
      }}
      lookupUser={lookup}
      disabled={disabled}
    />,
  );
}
function field(label: string) {
  const input = Array.from(host.querySelectorAll("label")).find((element) =>
    element.textContent?.includes(label),
  )?.control;
  if (!(input instanceof HTMLInputElement))
    throw new Error(`Missing field: ${label}`);
  return input;
}
async function input(label: string, value: string) {
  await act(async () => {
    const element = field(label);
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function button(label: string) {
  const element = Array.from(host.querySelectorAll("button")).find(
    (element) => element.textContent === label,
  );
  if (!element) throw new Error(`Missing button: ${label}`);
  return element;
}
async function click(label: string) {
  await act(async () => {
    button(label).click();
  });
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  items = [];
  disabled = false;
  lookup = vi.fn(async () => viewer);
  await act(async () => {
    render();
  });
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
});

describe("manual Twitch linking", () => {
  it("supports plain manual items without looking up an account", async () => {
    await input("項目名", "手動");
    await click("項目を追加");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "手動" });
    expect(items[0]?.userId).toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  });
  it("requires account confirmation and explicit submission, then joins repeated manual additions", async () => {
    await input("項目名", "手動名");
    await input("Twitch ログイン名", "viewer");
    expect(button("項目を追加").disabled).toBe(true);
    await click("ユーザーを確認");
    expect(items).toEqual([]);
    expect(host.textContent).toContain("Twitch ID: 42");
    expect(host.querySelector("img")?.src).toBe(viewer.profileImageUrl);
    await click("項目を追加");
    expect(items).toEqual([
      {
        id: "twitch:42",
        name: "手動名",
        userId: "42",
        weight: 1,
        redemptions: 0,
      },
    ]);
    expect(field("Twitch ログイン名").value).toBe("");
    await input("Twitch ログイン名", "viewer");
    await click("ユーザーを確認");
    expect(field("項目名").value).toBe("視聴者");
    await click("倍率を +1");
    expect(items).toEqual([
      {
        id: "twitch:42",
        name: "手動名",
        userId: "42",
        weight: 2,
        redemptions: 0,
      },
    ]);
  });
  it("clears confirmed identities when the login changes", async () => {
    await input("Twitch ログイン名", "viewer");
    await click("ユーザーを確認");
    await input("Twitch ログイン名", "other");
    expect(host.textContent).not.toContain("Twitch ID: 42");
    expect(button("項目を追加").disabled).toBe(true);
    await input("Twitch ログイン名", "");
    expect(button("項目を追加").disabled).toBe(false);
  });
  it.each(["edit", "spin", "unmount"])(
    "ignores late lookup responses after %s",
    async (action) => {
      let finish: ((user: TwitchUser) => void) | undefined;
      let signal: AbortSignal | undefined;
      lookup.mockImplementation((_login, currentSignal) => {
        signal = currentSignal;
        return new Promise((resolve) => {
          finish = resolve;
        });
      });
      await input("Twitch ログイン名", "viewer");
      await click("ユーザーを確認");
      expect(button("確認中…").disabled).toBe(true);
      if (action === "edit") await input("Twitch ログイン名", "other");
      else
        await act(async () => {
          if (action === "spin") {
            disabled = true;
            render();
          } else root.render(<p>別の報酬</p>);
        });
      expect(signal?.aborted).toBe(true);
      await act(async () => {
        finish?.(viewer);
      });
      expect(host.textContent).not.toContain("Twitch ID: 42");
      expect(items).toEqual([]);
    },
  );
  it("shows failed lookups and permits retry without adding an unconfirmed user", async () => {
    lookup.mockRejectedValueOnce(new Error("ユーザーが見つかりません。"));
    await input("項目名", "手動名");
    await input("Twitch ログイン名", "viewer");
    await click("ユーザーを確認");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "見つかりません",
    );
    expect(button("項目を追加").disabled).toBe(true);
    await click("ユーザーを確認");
    expect(host.querySelector('[role="alert"]')).toBeNull();
    await click("項目を追加");
    expect(items[0]?.userId).toBe("42");
  });
  it("does not claim a weight was added when the existing weight cannot be incremented", async () => {
    items = [
      {
        id: "twitch:42",
        name: "視聴者",
        userId: "42",
        weight: Number.MAX_SAFE_INTEGER,
        redemptions: 0,
      },
    ];
    await act(async () => {
      render();
    });
    await input("Twitch ログイン名", "viewer");
    await click("ユーザーを確認");
    expect(button("倍率を +1").disabled).toBe(true);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("上限");
  });
});
