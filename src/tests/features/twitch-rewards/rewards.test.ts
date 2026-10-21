import { describe, expect, it } from "vitest";
import { parseRewards } from "../../../features/twitch-rewards/rewards";

const reward = { id: "r1", title: "ルーレット参加", cost: 500 };

describe("reward response mapping", () => {
  it("maps names and costs and discards unrelated properties", () => {
    expect(parseRewards({ data: [{ ...reward, prompt: "unused" }] })).toEqual([
      reward,
    ]);
    expect(parseRewards({ data: [] })).toEqual([]);
  });
  it.each([
    null,
    {},
    { data: null },
    { data: [{ ...reward, title: "" }] },
    { data: [{ ...reward, cost: 0 }] },
    { data: [{ ...reward, id: 1 }] },
    { data: [reward, reward] },
  ])("rejects invalid responses %j", (value) => {
    expect(() => parseRewards(value)).toThrow();
  });
});
