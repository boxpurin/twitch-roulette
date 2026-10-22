import type { RouletteItem } from "../participants/items";
import { isPositiveInteger, isRecord, isText } from "../../shared/validation";

export const WINNER_HISTORY_LIMIT = 20;

export interface WinnerEntry {
  itemId: string;
  name: string;
  spunAt: number;
  winNumber: number;
}
export interface WinnerHistory {
  entries: WinnerEntry[];
  counts: { itemId: string; count: number }[];
}

export function emptyWinnerHistory(): WinnerHistory {
  return { entries: [], counts: [] };
}

export function recordWinner(
  history: WinnerHistory,
  winner: RouletteItem,
  spunAt: number,
): WinnerHistory {
  const previous = history.counts.find(({ itemId }) => itemId === winner.id);
  const winNumber = (previous?.count ?? 0) + 1;
  return {
    entries: [
      ...history.entries,
      { itemId: winner.id, name: winner.name, spunAt, winNumber },
    ].slice(-WINNER_HISTORY_LIMIT),
    counts: previous
      ? history.counts.map((entry) =>
          entry.itemId === winner.id ? { ...entry, count: winNumber } : entry,
        )
      : [...history.counts, { itemId: winner.id, count: winNumber }],
  };
}

export function isWinnerHistory(value: unknown): value is WinnerHistory {
  if (
    !isRecord(value) ||
    !Array.isArray(value.entries) ||
    value.entries.length > WINNER_HISTORY_LIMIT ||
    !Array.isArray(value.counts) ||
    !value.counts.every(
      (entry) =>
        isRecord(entry) &&
        isText(entry.itemId) &&
        isPositiveInteger(entry.count),
    )
  )
    return false;
  const counts = new Map(
    value.counts.map((entry) => [entry.itemId, entry.count]),
  );
  return (
    counts.size === value.counts.length &&
    value.entries.every(
      (entry) =>
        isRecord(entry) &&
        isText(entry.itemId) &&
        isText(entry.name) &&
        typeof entry.spunAt === "number" &&
        Number.isFinite(entry.spunAt) &&
        entry.spunAt >= 0 &&
        entry.spunAt <= 8.64e15 &&
        isPositiveInteger(entry.winNumber) &&
        (counts.get(entry.itemId) ?? 0) >= entry.winNumber,
    )
  );
}
