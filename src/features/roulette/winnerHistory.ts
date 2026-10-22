import type { RouletteItem } from "../participants/items";

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
