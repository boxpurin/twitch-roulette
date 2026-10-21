import { isPositiveInteger } from "../../shared/validation";

export interface RouletteItem {
  id: string;
  name: string;
  weight?: number;
  userId?: string;
  redemptions?: number;
  excluded?: boolean;
}

export function getEligibleItems(
  items: readonly RouletteItem[],
): RouletteItem[] {
  return items.filter((item) => item.excluded !== true);
}

export type ItemsAction =
  | { type: "add"; id: string; name: string }
  | { type: "rename"; id: string; name: string }
  | { type: "remove"; id: string }
  | { type: "exclude"; id: string; excluded: boolean }
  | { type: "weight"; id: string; weight: number };

export function itemsReducer(
  items: RouletteItem[],
  action: ItemsAction,
): RouletteItem[] {
  if (action.type === "remove")
    return items.filter((item) => item.id !== action.id);

  if (action.type === "exclude") {
    return items.map((item) =>
      item.id === action.id ? { ...item, excluded: action.excluded } : item,
    );
  }

  if (action.type === "weight") {
    if (!isPositiveInteger(action.weight)) return items;
    return items.map((item) =>
      item.id === action.id ? { ...item, weight: action.weight } : item,
    );
  }

  const name = action.name.trim();
  if (!name) return items;

  if (action.type === "add") {
    if (items.some((item) => item.id === action.id)) return items;
    return [...items, { id: action.id, name }];
  }

  return items.map((item) =>
    item.id === action.id ? { ...item, name } : item,
  );
}
