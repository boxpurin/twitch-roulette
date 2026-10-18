import { describe, expect, it, vi } from 'vitest'
import { getStopAngle, selectWinner } from './spin'

const items = [{ id: 'a', name: 'A賞' }, { id: 'b', name: 'B賞' }]

describe('winner selection', () => {
  it('does not draw from an empty wheel', () => {
    const random = vi.fn(() => 0)
    expect(selectWinner([], random)).toBeUndefined()
    expect(random).not.toHaveBeenCalled()
  })

  it.each([0, 0.499, 0.999])('selects the only item with random %s', value => {
    expect(selectWinner(items.slice(0, 1), () => value)).toEqual(items[0])
  })

  it.each([[0, 'a'], [0.499, 'a'], [0.5, 'b'], [0.999, 'b']] as const)(
    'selects the correct equal slice for random %s', (value, id) => {
      expect(selectWinner(items, () => value)?.id).toBe(id)
    },
  )
})

describe('stopping under the top pointer', () => {
  it.each([[0, 2, 1.5], [1, 2, 0.5], [0, 1, 1], [0, 4, 1.75], [3, 4, 0.25]])(
    'aligns item %s of %s at %sπ', (index, count, multiplier) => {
      const angle = getStopAngle(index, count, 0)
      expect(angle % (Math.PI * 2)).toBeCloseTo(multiplier * Math.PI)
      expect(angle).toBeGreaterThanOrEqual(Math.PI * 10)
    },
  )

  it('moves forward by at least five turns when spinning again', () => {
    const current = 19 * Math.PI
    const stop = getStopAngle(1, 2, current)
    expect(stop - current).toBeGreaterThanOrEqual(10 * Math.PI)
    expect(stop % (2 * Math.PI)).toBeCloseTo(Math.PI / 2)
  })
})
