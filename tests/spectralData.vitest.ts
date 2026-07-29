import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { parseCsv } from '../src/spectralEngine'

const auroraPath = fileURLToPath(new URL('../public/data/aurora_spectra.csv', import.meta.url))

describe('bundled spectral data', () => {
  test('includes the expanded official Aurora viability-dye signatures', () => {
    const rows = parseCsv(readFileSync(auroraPath, 'utf8'))
    const names = rows.slice(1).map((row) => row[0])
    const uniqueNames = new Set(names.map((name) => name.toLocaleLowerCase()))

    expect(rows[0]).toHaveLength(65)
    expect(uniqueNames.size).toBe(names.length)
    expect(names).toContain('LIVE DEAD NIR')
    expect(names.filter((name) => name.startsWith('Zombie ')).sort()).toEqual([
      'Zombie Aqua',
      'Zombie Green',
      'Zombie NIR',
      'Zombie Red',
      'Zombie UV',
      'Zombie Violet',
      'Zombie Yellow',
    ])
    expect(rows.slice(1).every((row) => row.length === 65)).toBe(true)
  })
})
