import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RouletteItems from "./RouletteItems";

const items = [
  { id: "m", name: "手動", weight: 99, excluded: true },
  { id: "twitch:42", name: "視聴者", userId: "42", redemptions: 2, weight: 1 },
  { id: "n", name: "別の項目", weight: 3, excluded: false },
];

describe("exclusion controls", () => {
  it("keeps excluded rows and assigns probabilities by ID rather than row index", () => {
    const html = renderToStaticMarkup(
      <RouletteItems items={items} dispatch={() => {}} />,
    );
    const rows = html.match(/<li[\s\S]*?<\/li>/g) ?? [];
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('type="checkbox"');
    expect(rows[0]).toContain('checked=""');
    expect(rows[0]).toContain('aria-label="項目 1（手動）を抽選から除外"');
    expect(rows[0]).toContain("当選確率 0%");
    expect(rows[0]).toContain("抽選対象外");
    expect(rows[0]).toContain("倍率 99 倍");
    expect(rows[1]).toContain('type="checkbox"');
    expect(rows[1]).not.toContain('checked=""');
    expect(rows[1]).toContain("当選確率 25%");
    expect(rows[1]).toContain("交換 2 回");
    expect(rows[2]).toContain("当選確率 75%");
    expect(html).toContain("抽選対象 2 件 / 全 3 件");
  });
  it("disables exclusion controls during spins using the containing fieldset", () => {
    const html = renderToStaticMarkup(
      <RouletteItems items={items} dispatch={() => {}} disabled />,
    );
    expect(html).toMatch(
      /<fieldset disabled="">[\s\S]*type="checkbox"[\s\S]*<\/fieldset>/,
    );
  });
});
