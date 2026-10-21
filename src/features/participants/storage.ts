import { emptyHistory } from "./history";
import type { History } from "./history";
import type { RouletteItem } from "./items";
import { isRecord, isText, isPositiveInteger } from "../../shared/validation";

export type HistoryStorage = Pick<Storage, "getItem" | "setItem">;
const ERROR =
  "履歴を保存・復元できません。この画面での変更は保存されない場合があります。ブラウザの保存設定・空き容量を確認してください。";
function key(userId: string, rewardId: string) {
  return `twitch-roulette.history.v1:${encodeURIComponent(userId)}:${encodeURIComponent(rewardId)}`;
}
function isItem(value: unknown): value is RouletteItem {
  return (
    isRecord(value) &&
    isText(value.id) &&
    isText(value.name) &&
    (value.excluded === undefined || typeof value.excluded === "boolean") &&
    (value.weight === undefined || isPositiveInteger(value.weight)) &&
    (value.userId === undefined
      ? value.redemptions === undefined
      : isText(value.userId) &&
        value.id === `twitch:${value.userId}` &&
        isPositiveInteger(value.redemptions))
  );
}
function isHistory(value: unknown): value is History {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.items) ||
    !value.items.every(isItem) ||
    !Array.isArray(value.redemptionIds) ||
    !value.redemptionIds.every(isText) ||
    !Array.isArray(value.messageIds) ||
    !value.messageIds.every(isText) ||
    typeof value.resetAt !== "number" ||
    !Number.isFinite(value.resetAt) ||
    value.resetAt < 0
  )
    return false;
  const ids = value.items.map((item) => item.id);
  const userIds = value.items.flatMap((item) =>
    item.userId ? [item.userId] : [],
  );
  return (
    new Set(ids).size === ids.length &&
    new Set(userIds).size === userIds.length &&
    new Set(value.redemptionIds).size === value.redemptionIds.length &&
    new Set(value.messageIds).size === value.messageIds.length
  );
}
export function loadHistory(
  storage: HistoryStorage,
  userId: string,
  rewardId: string,
): { history: History; error: string | null; blocked: boolean } {
  try {
    const raw = storage.getItem(key(userId, rewardId));
    if (raw === null)
      return { history: emptyHistory(), error: null, blocked: false };
    const value: unknown = JSON.parse(raw);
    if (!isHistory(value))
      return {
        history: emptyHistory(),
        error:
          "保存履歴が破損しているか未対応の形式です。リセットするまで上書きしません。",
        blocked: true,
      };
    // Copy only known fields: never re-save unexpected properties from storage.
    const history: History = {
      version: 1,
      resetAt: value.resetAt,
      redemptionIds: value.redemptionIds,
      messageIds: value.messageIds,
      items: value.items.map((item) => ({
        id: item.id,
        name: item.name,
        weight: item.weight,
        userId: item.userId,
        redemptions: item.redemptions,
        excluded: item.excluded,
      })),
    };
    return { history, error: null, blocked: false };
  } catch {
    return { history: emptyHistory(), error: ERROR, blocked: true };
  }
}
export function saveHistory(
  storage: HistoryStorage,
  userId: string,
  rewardId: string,
  history: History,
): string | null {
  try {
    storage.setItem(key(userId, rewardId), JSON.stringify(history));
    return null;
  } catch {
    return ERROR;
  }
}
