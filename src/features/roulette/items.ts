export interface RouletteItem {
  id: string
  name: string
}

export type ItemsAction =
  | { type: 'add'; id: string; name: string }
  | { type: 'rename'; id: string; name: string }
  | { type: 'remove'; id: string }

export function itemsReducer(items: RouletteItem[], action: ItemsAction): RouletteItem[] {
  if (action.type === 'remove') return items.filter(item => item.id !== action.id)

  const name = action.name.trim()
  if (!name) return items

  if (action.type === 'add') {
    if (items.some(item => item.id === action.id)) return items
    return [...items, { id: action.id, name }]
  }

  return items.map(item => item.id === action.id ? { ...item, name } : item)
}
