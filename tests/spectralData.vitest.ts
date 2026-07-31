import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { parseCsv } from '../src/spectralEngine'

const auroraPath = fileURLToPath(new URL('../public/data/aurora_spectra.csv', import.meta.url))
const discoverPath = fileURLToPath(new URL('../public/data/discover_spectra.csv', import.meta.url))
const fluorophoreDictionaryPath = fileURLToPath(
  new URL('../public/data/fluorophore_dictionary.csv', import.meta.url),
)
const markerDictionaryPath = fileURLToPath(
  new URL('../public/data/marker_dictionary.csv', import.meta.url),
)

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
    expect(names).toHaveLength(395)
  })

  test('includes the complete imported Discover additions', () => {
    const rows = parseCsv(readFileSync(discoverPath, 'utf8'))
    const names = rows.slice(1).map((row) => row[0])
    expect(rows[0]).toHaveLength(79)
    expect(new Set(names.map((name) => name.toLocaleLowerCase())).size).toBe(names.length)
    expect(names).toHaveLength(78)
    expect(rows.slice(1).every((row) => row.length === 79)).toBe(true)
  })

  test('bundles expanded fluorophore and marker dictionaries without duplicate canonical names', () => {
    const fluorophoreRows = parseCsv(readFileSync(fluorophoreDictionaryPath, 'utf8'))
    const markerRows = parseCsv(readFileSync(markerDictionaryPath, 'utf8'))
    const normalized = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '')
    const fluorophores = fluorophoreRows.slice(1).map((row) => normalized(row[0]))
    const markers = markerRows.slice(1).map((row) => normalized(row[0]))

    expect(fluorophores).toHaveLength(446)
    expect(new Set(fluorophores).size).toBe(fluorophores.length)
    expect(markers).toHaveLength(878)
    expect(new Set(markers).size).toBe(markers.length)
  })
})
