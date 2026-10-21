import { itemsReducer } from "./items";
import type { ItemsAction, RouletteItem } from "./items";
import { isPositiveInteger, isText } from "../../shared/validation";

export interface Redemption {
  userId: string;
  name: string;
  redemptionId: string;
  messageId: string;
  redeemedAt: number;
}
export interface History {
  version: 1;
  items: RouletteItem[];
  redemptionIds: string[];
  messageIds: string[];
  resetAt: number;
}
export type HistoryAction =
  | ItemsAction
  | { type: "redeem"; event: Redemption }
  | { type: "reset"; at: number };
export function emptyHistory(): History {
  return {
    version: 1,
    items: [],
    redemptionIds: [],
    messageIds: [],
    resetAt: 0,
  };
}
export function historyReducer(state: History, action: HistoryAction): History {
  if (action.type === "reset")
    return { ...emptyHistory(), resetAt: Math.max(state.resetAt, action.at) };
  if (action.type !== "redeem") {
    if (action.type === "weight" && !isPositiveInteger(action.weight))
      return state;
    const items = itemsReducer(state.items, action);
    return items === state.items ? state : { ...state, items };
  }
  const event = action.event;
  if (
    ![event.userId, event.name, event.redemptionId, event.messageId].every(
      isText,
    ) ||
    !Number.isFinite(event.redeemedAt) ||
    event.redeemedAt <= state.resetAt ||
    state.redemptionIds.includes(event.redemptionId) ||
    state.messageIds.includes(event.messageId)
  )
    return state;
  const previous = state.items.find((item) => item.userId === event.userId);
  // Refuse overflow rather than silently biasing a very large manually set weight.
  if (
    previous &&
    (!isPositiveInteger((previous.weight ?? 1) + 1) ||
      !isPositiveInteger((previous.redemptions ?? 0) + 1))
  )
    return state;
  const items = previous
    ? state.items.map((item) =>
        item === previous
          ? {
              ...item,
              name: event.name.trim(),
              weight: (item.weight ?? 1) + 1,
              redemptions: (item.redemptions ?? 0) + 1,
            }
          : item,
      )
    : [
        ...state.items,
        {
          id: `twitch:${event.userId}`,
          userId: event.userId,
          name: event.name.trim(),
          weight: 1,
          redemptions: 1,
        },
      ];
  return {
    ...state,
    items,
    redemptionIds: [...state.redemptionIds, event.redemptionId],
    messageIds: [...state.messageIds, event.messageId],
  };
}
