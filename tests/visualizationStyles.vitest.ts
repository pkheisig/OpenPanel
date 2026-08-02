import { describe, expect, test } from 'vitest'
import { getSimilarityStyle } from '../src/panelBuilderShared'

function hslComponents(background: unknown): number[] {
  return String(background).match(/-?[\d.]+/g)?.map(Number) ?? []
}

describe('visualization color scales', () => {
  test.each([
    ['light', 95],
    ['dark', 27],
  ] as const)('keeps low similarity indices lighter and delays red in %s mode', (theme, lowLightness) => {
    const low = hslComponents(getSimilarityStyle(0.1, false, theme).background)
    const middle = hslComponents(getSimilarityStyle(0.5, false, theme).background)
    const high = hslComponents(getSimilarityStyle(0.8, false, theme).background)

    expect(low[0]).toBeGreaterThan(38)
    expect(low[2]).toBeGreaterThanOrEqual(lowLightness)
    expect(middle[0]).toBeGreaterThan(15)
    expect(high[0]).toBeLessThan(0)
  })
})
