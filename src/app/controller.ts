import {
  emptyWinnerHistory,
  recordWinner,
} from "../features/roulette/winnerHistory";
import type { WinnerHistory } from "../features/roulette/winnerHistory";
import { connectRedemptions } from "../features/twitch-eventsub/client";
import type {
  ReceptionOptions,
  ReceptionStatus,
} from "../features/twitch-eventsub/client";
import { historyReducer, emptyHistory } from "../features/participants/history";
import type { Redemption } from "../features/participants/history";
import type { ItemsAction, RouletteItem } from "../features/participants/items";
import { loadHistory, saveHistory } from "../features/participants/storage";
import type { HistoryStorage } from "../features/participants/storage";
import { selectWinner } from "../features/roulette/spin";

interface Options {
  userId: string;
  storage: () => HistoryStorage;
  subscribe: ReceptionOptions["subscribe"];
  connect?: typeof connectRedemptions;
  now?: () => number;
}
interface Snapshot {
  rewardId: string;
  items: RouletteItem[];
  spinning: boolean;
  winner: RouletteItem | null;
  winnerHistory: WinnerHistory;
  accepting: boolean;
  pending: number;
  reception: ReceptionStatus;
  storageError: string | null;
}
const stopped: ReceptionStatus = {
  phase: "stopped",
  message: "参加受付を停止しています。",
};
const STORAGE_ERROR =
  "履歴を保存・復元できません。この画面での変更は保存されない場合があります。ブラウザの保存設定・空き容量を確認してください。";

export function createRouletteController(options: Options) {
  const selectionKey = `twitch-roulette.selected-reward.v1:${encodeURIComponent(options.userId)}`;
  let selectionError: string | null = null;
  let rewardId = "";
  try {
    rewardId = options.storage().getItem(selectionKey) ?? "";
  } catch {
    selectionError = STORAGE_ERROR;
  }
  let history = emptyHistory();
  let blocked = false;
  function read(reward: string) {
    try {
      return loadHistory(options.storage(), options.userId, reward);
    } catch {
      return { history: emptyHistory(), error: STORAGE_ERROR, blocked: true };
    }
  }
  const initial = read(rewardId);
  history = initial.history;
  blocked = initial.blocked;
  let state: Snapshot = {
    rewardId,
    items: history.items,
    spinning: false,
    winner: null,
    winnerHistory: emptyWinnerHistory(),
    accepting: false,
    pending: 0,
    reception: stopped,
    storageError: initial.error ?? selectionError,
  };
  const listeners = new Set<() => void>();
  let connection: ReturnType<typeof connectRedemptions> | undefined;
  let generation = 0;
  let activeSpin: { winner: RouletteItem; spunAt: number } | undefined;
  function publish(next: Partial<Snapshot>) {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  }
  function persist() {
    if (blocked) return state.storageError;
    try {
      return (
        saveHistory(
          options.storage(),
          options.userId,
          state.rewardId,
          history,
        ) ?? selectionError
      );
    } catch {
      return STORAGE_ERROR;
    }
  }
  function accept(event: Redemption) {
    const next = historyReducer(history, { type: "redeem", event });
    if (next === history) return;
    history = next;
    const storageError = persist();
    publish(
      state.spinning
        ? { pending: state.pending + 1, storageError }
        : { items: history.items, winner: null, storageError },
    );
  }
  function stop() {
    generation++;
    connection?.stop();
    connection = undefined;
    publish({ accepting: false, reception: stopped });
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    selectReward(value: string) {
      if (state.spinning) return false;
      const reward = value.trim();
      if (reward === state.rewardId) return true;
      stop();
      const loaded = read(reward);
      history = loaded.history;
      blocked = loaded.blocked;
      try {
        options.storage().setItem(selectionKey, reward);
        selectionError = null;
      } catch {
        selectionError = STORAGE_ERROR;
      }
      publish({
        rewardId: reward,
        items: history.items,
        winner: null,
        pending: 0,
        storageError: loaded.error ?? selectionError,
      });
      return true;
    },
    edit(action: ItemsAction) {
      if (state.spinning) return;
      history = historyReducer(history, action);
      publish({ items: history.items, winner: null, storageError: persist() });
    },
    start() {
      if (state.accepting || !state.rewardId) return;
      const id = ++generation;
      publish({ accepting: true });
      connection = (options.connect ?? connectRedemptions)({
        userId: options.userId,
        rewardId: state.rewardId,
        subscribe: options.subscribe,
        onEvent: (event) => {
          if (generation === id && state.accepting) accept(event);
        },
        onStatus: (reception) => {
          if (generation !== id) return;
          publish({ reception, accepting: reception.phase !== "error" });
        },
      });
    },
    stop,
    beginSpin(random?: () => number) {
      if (state.spinning) return undefined;
      const selected = selectWinner(state.items, random);
      if (selected) {
        activeSpin = {
          winner: { ...selected },
          spunAt: (options.now ?? Date.now)(),
        };
        publish({ spinning: true, pending: 0 });
      }
      return selected;
    },
    finishSpin(winner: RouletteItem | null) {
      if (!state.spinning) return;
      const completed =
        winner && activeSpin?.winner.id === winner.id ? activeSpin : undefined;
      activeSpin = undefined;
      publish({
        spinning: false,
        winner: completed?.winner ?? null,
        items: history.items,
        pending: 0,
        winnerHistory: completed
          ? recordWinner(
              state.winnerHistory,
              completed.winner,
              completed.spunAt,
            )
          : state.winnerHistory,
      });
    },
    clearWinnerHistory() {
      // Navigation must not allow a late animation callback to restore a cleared entry.
      activeSpin = undefined;
      publish({ winnerHistory: emptyWinnerHistory() });
    },
    reset() {
      if (state.spinning) return false;
      stop();
      history = historyReducer(history, {
        type: "reset",
        at: (options.now ?? Date.now)(),
      });
      blocked = false;
      publish({
        items: history.items,
        winner: null,
        pending: 0,
        storageError: persist(),
      });
      return true;
    },
  };
}
export type RouletteController = ReturnType<typeof createRouletteController>;
