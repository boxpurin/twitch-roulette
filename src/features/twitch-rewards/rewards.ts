import { isRecord, isText, isPositiveInteger } from "../../shared/validation";

export interface Reward {
  id: string;
  title: string;
  cost: number;
}
export function parseRewards(body: unknown): Reward[] {
  const error = () =>
    new Error("Twitch の報酬一覧の応答が不正です。もう一度取得してください。");
  if (!isRecord(body) || !Array.isArray(body.data)) throw error();
  const rewards: Reward[] = [];
  const ids = new Set<string>();
  for (const value of body.data) {
    if (
      !isRecord(value) ||
      !isText(value.id) ||
      !isText(value.title) ||
      !isPositiveInteger(value.cost) ||
      ids.has(value.id)
    )
      throw error();
    ids.add(value.id);
    rewards.push({ id: value.id, title: value.title, cost: value.cost });
  }
  return rewards;
}
