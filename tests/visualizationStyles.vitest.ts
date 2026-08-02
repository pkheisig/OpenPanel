import { describe, expect, test } from 'vitest'
import { getSimilarityStyle } from '../src/panelBuilderShared'

function hslComponents(background: unknown): number[] {
  return String(background).match(/-?[\d.]+/g)?.map(Number) ?? []
}

describe('visualization color scales', () => {
  test('keeps low similarity indices pale and delays the red sunset range', () => {
    const low = hslComponents(getSimilarityStyle(0.1, false, 'light').background)
    const middle = hslComponents(getSimilarityStyle(0.5, false, 'light').background)
    const high = hslComponents(getSimilarityStyle(0.8, false, 'light').background)

    expect(low[0]).toBeGreaterThan(38)
    expect(low[2]).toBeGreaterThanOrEqual(95)
    expect(middle[0]).toBeGreaterThan(15)
    expect(high[0]).toBeLessThan(0)
  })
})
