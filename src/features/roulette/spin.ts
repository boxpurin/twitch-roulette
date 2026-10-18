import type { RouletteItem } from './items'

export function selectWinner(
  items: readonly RouletteItem[],
  random: () => number = Math.random,
): RouletteItem | undefined {
  if (items.length === 0) return undefined
  return items[Math.floor(random() * items.length)]
}

export function getStopAngle(index: number, count: number, currentAngle: number): number {
  const turn = Math.PI * 2
  const target = turn - (index + 0.5) * turn / count
  const remaining = ((target - currentAngle % turn) + turn) % turn
  return currentAngle + 5 * turn + remaining
}
