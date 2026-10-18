import type { RouletteItem } from "./items";
import { isPositiveInteger } from "../../shared/validation";

export function getSectors(items: readonly RouletteItem[]) {
  if (items.length === 0) return [];
  let max = 1;
  for (const item of items) {
    if (!isPositiveInteger(item.weight ?? 1))
      throw new Error("倍率が不正です。");
    max = Math.max(max, item.weight ?? 1);
  }
  const scaled = items.map((item) => (item.weight ?? 1) / max);
  const total = scaled.reduce((sum, weight) => sum + weight, 0);
  let start = 0;
  return items.map((item, index) => {
    const end = index === items.length - 1 ? 1 : start + scaled[index]! / total;
    const sector = { item, start, end, probability: end - start };
    start = end;
    return sector;
  });
}

export function selectWinner(
  items: readonly RouletteItem[],
  random: () => number = Math.random,
): RouletteItem | undefined {
  if (items.length === 0) return undefined;
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1)
    throw new Error("乱数は 0 以上 1 未満で指定してください。");
  return getSectors(items).find((sector) => value < sector.end)?.item;
}

export function getStopAngle(
  index: number,
  source: number | readonly RouletteItem[],
  currentAngle: number,
): number {
  const turn = Math.PI * 2;
  const sector =
    typeof source === "number" ? undefined : getSectors(source)[index];
  const midpoint =
    typeof source === "number"
      ? (index + 0.5) / source
      : sector
        ? (sector.start + sector.end) / 2
        : NaN;
  const target = turn * (1 - midpoint);
  const remaining = (target - (currentAngle % turn) + turn) % turn;
  return currentAngle + 5 * turn + remaining;
}
