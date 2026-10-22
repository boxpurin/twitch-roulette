// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import Roulette from "../../app/Roulette";
import type { AuthSession } from "../../features/twitch-auth/session";

vi.mock("../../features/roulette/wheel", () => ({
  WHEEL_SIZE: 640,
  createWheel: () => ({
    spin: (_index: number, complete: () => void) => {
      complete();
      return true;
    },
    dispose: () => {},
  }),
}));

it("keeps one history modal through participant changes and repeated spins, then clears it on reset", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const session = {
    listRewards: async () => [],
    subscribeRedemptions: async () => {},
  } as unknown as AuthSession;
  async function click(name: string) {
    const button = Array.from(host.querySelectorAll("button")).find(
      (element) => element.textContent === name,
    )!;
    await act(async () => {
      button.click();
    });
  }
  try {
    await act(async () => {
      root.render(<Roulette userId="ui-test" session={session} />);
    });
    const input = host.querySelector<HTMLInputElement>(
      ".manual-item-form input",
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "参加者");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("項目を追加");
    for (let index = 0; index < 3; index++) {
      await click("ルーレットを回す");
      expect(host.querySelectorAll(".winner-history")).toHaveLength(1);
      expect(host.querySelectorAll(".winner-history tbody tr")).toHaveLength(
        index + 1,
      );
    }
    await click("履歴をリセット");
    await click("削除してリセット");
    expect(host.querySelectorAll(".winner-history")).toHaveLength(1);
    expect(host.querySelectorAll(".winner-history tbody tr")).toHaveLength(0);
    expect(host.textContent).toContain("当選者履歴はまだありません");
  } finally {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    localStorage.clear();
  }
});
