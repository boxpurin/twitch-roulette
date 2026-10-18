import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ReceptionControls from "./ReceptionControls";
import { createRouletteController } from "./controller";
import type { RewardListState } from "../twitch-rewards/list";

function render(rewards: RewardListState, selected = "") {
  const controller = createRouletteController({
    userId: "42",
    storage: () => ({ getItem: () => null, setItem: () => {} }),
    subscribe: async () => {},
  });
  controller.selectReward(selected);
  return renderToStaticMarkup(
    <ReceptionControls
      controller={controller}
      rewards={rewards}
      reload={() => {}}
    />,
  );
}
describe("reward dropdown", () => {
  it("renders names and point costs in a dropdown, retaining a saved selection", () => {
    const html = render(
      {
        status: "ready",
        rewards: [{ id: "r1", title: "ルーレット参加", cost: 500 }],
      },
      "r1",
    );
    expect(html).toContain("<select");
    expect(html).toContain("ルーレット参加（500 ポイント）");
    expect(html).toMatch(/<option value="r1" selected="">/);
    expect(html).not.toContain("<input");
    expect(html).toContain("現在の保存先: ルーレット参加");
    expect(html).toMatch(/<button type="button">受付を開始<\/button>/);
  });
  it("explains loading, failure and empty lists", () => {
    expect(render({ status: "loading", rewards: [] })).toContain(
      "報酬一覧を取得しています",
    );
    expect(
      render({ status: "error", rewards: [], message: "取得失敗" }),
    ).toContain("取得失敗");
    expect(render({ status: "ready", rewards: [] })).toContain(
      "カスタム報酬がありません",
    );
    expect(render({ status: "ready", rewards: [] })).toContain(
      "報酬一覧を再取得",
    );
  });
  it("preserves a missing saved reward but prevents starting its subscription", () => {
    const html = render({ status: "ready", rewards: [] }, "deleted");
    expect(html).toContain("以前選択した報酬（現在の一覧にありません）");
    expect(html).toMatch(
      /<button type="button" disabled="">受付を開始<\/button>/,
    );
    expect(html).toContain("履歴をリセット");
  });
});
