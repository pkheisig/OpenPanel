import { describe, expect, test } from 'vitest'
import { getSimilarityStyle } from '../src/panelBuilderShared'

function hslComponents(background: unknown): number[] {
  return String(background).match(/-?[\d.]+/g)?.map(Number) ?? []
}

describe('visualization color scales', () => {
  test.each(['light', 'dark'] as const)('keeps low similarity indices lighter and delays red in %s mode', (theme) => {
    const low = hslComponents(getSimilarityStyle(0.1, false, theme).background)
    const middle = hslComponents(getSimilarityStyle(0.5, false, theme).background)
    const high = hslComponents(getSimilarityStyle(0.8, false, theme).background)

    expect(low[0]).toBeGreaterThan(38)
    expect(low[2]).toBeGreaterThanOrEqual(95)
    expect(middle[0]).toBeGreaterThan(15)
    expect(high[0]).toBeLessThan(0)
  })

  test('uses the identical sunset palette in light and dark mode', () => {
    for (const value of [0, 0.1, 0.3, 0.5, 0.7, 1]) {
      expect(getSimilarityStyle(value, false, 'dark')).toEqual(
        getSimilarityStyle(value, false, 'light'),
      )
    }
  })
})
