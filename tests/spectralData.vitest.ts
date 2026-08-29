import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import {
  BUNDLED_DATA_FILES,
  parseCsv,
  validateBundledDataRows,
} from '../src/spectralEngine'

const auroraPath = fileURLToPath(new URL('../public/data/aurora_spectra.csv', import.meta.url))
const discoverPath = fileURLToPath(new URL('../public/data/discover_spectra.csv', import.meta.url))
const conventionalDetectorPath = fileURLToPath(
  new URL('../public/data/conventional_detector_dictionary.csv', import.meta.url),
)
const fluorophoreDictionaryPath = fileURLToPath(
  new URL('../public/data/fluorophore_dictionary.csv', import.meta.url),
)
const conventionalEstimatePath = fileURLToPath(
  new URL('../public/data/conventional_fluorophore_estimates.csv', import.meta.url),
)
const markerDictionaryPath = fileURLToPath(
  new URL('../public/data/marker_dictionary.csv', import.meta.url),
)
const panelWizardBrightnessPath = fileURLToPath(
  new URL('../public/data/panel_wizard_brightness.csv', import.meta.url),
)

describe('bundled spectral data', () => {
  test('validates every bundled CSV before use', () => {
    BUNDLED_DATA_FILES.forEach((filename) => {
      const path = fileURLToPath(new URL(`../public/data/${filename}`, import.meta.url))
      const rows = parseCsv(readFileSync(path, 'utf8'))
      expect(() => validateBundledDataRows(filename, rows, { requireComplete: true }), filename).not.toThrow()
    })
  })

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

  test('rejects a full-scale conventional dictionary with a missing cytometer scope', () => {
    const rows = parseCsv(readFileSync(conventionalDetectorPath, 'utf8'))
    const withoutFortessa = [rows[0]!, ...rows.slice(1).filter((row) => row[0] !== 'fortessa')]
    expect(() => validateBundledDataRows('conventional_detector_dictionary.csv', withoutFortessa))
      .toThrow('pinned complete conventional detector bundle')
  })

  test('rejects partial or substituted complete-reference assets', () => {
    const conventionalRows = parseCsv(readFileSync(conventionalDetectorPath, 'utf8'))
    expect(() => validateBundledDataRows(
      'conventional_detector_dictionary.csv',
      [conventionalRows[0]!, ...conventionalRows.slice(1, 79)],
      { requireComplete: true },
    )).toThrow('expected 506 rows')

    const markerRows = parseCsv(readFileSync(markerDictionaryPath, 'utf8'))
    expect(() => validateBundledDataRows(
      'marker_dictionary.csv',
      [markerRows[0]!, ...markerRows.slice(1, 11)],
      { requireComplete: true },
    )).toThrow('expected 878 rows')
    const substitutedMarkers = [
      markerRows[0]!,
      ['not-a-pinned-marker', markerRows[1]![1] ?? ''],
      ...markerRows.slice(2),
    ]
    expect(() => validateBundledDataRows('marker_dictionary.csv', substitutedMarkers, { requireComplete: true }))
      .toThrow("marker 'not-a-pinned-marker' is not in pinned marker coverage")

    const estimateRows = parseCsv(readFileSync(conventionalEstimatePath, 'utf8'))
    const substitutedEstimates = [
      estimateRows[0]!,
      ['not-a-pinned-fluorophore', ...estimateRows[1]!.slice(1)],
      ...estimateRows.slice(2),
    ]
    expect(() => validateBundledDataRows(
      'conventional_fluorophore_estimates.csv',
      substitutedEstimates,
      { requireComplete: true },
    )).toThrow("fluorophore 'not-a-pinned-fluorophore' is not in pinned conventional estimate coverage")

    const fluorophoreRows = parseCsv(readFileSync(fluorophoreDictionaryPath, 'utf8'))
    const withoutAf532 = fluorophoreRows.map((row) => [...row])
    const aliasesColumn = fluorophoreRows[0]!.indexOf('aliases')
    const alexaFluor532 = withoutAf532.find((row) => row[0] === 'Alexa Fluor 532')!
    alexaFluor532[aliasesColumn] = alexaFluor532[aliasesColumn]!
      .split(';')
      .filter((alias) => alias !== 'AF532')
      .join(';')
    expect(() => validateBundledDataRows('fluorophore_dictionary.csv', withoutAf532, { requireComplete: true }))
      .toThrow('pinned fluorophore alias coverage is missing or mismatched [af532]')

    const brightnessRows = parseCsv(readFileSync(panelWizardBrightnessPath, 'utf8'))
    expect(() => validateBundledDataRows(
      'panel_wizard_brightness.csv',
      [brightnessRows[0]!],
      { requireComplete: true },
    )).toThrow('expected 34 rows')
    const substitutedBrightness = brightnessRows.map((row) => [...row])
    substitutedBrightness[1]![2] = 'Alexa Fluor 532'
    expect(() => validateBundledDataRows(
      'panel_wizard_brightness.csv',
      substitutedBrightness,
      { requireComplete: true },
    )).toThrow('is not in pinned panel wizard brightness coverage')
    const substitutedBrightnessScore = brightnessRows.map((row) => [...row])
    substitutedBrightnessScore[1]![3] = '1'
    expect(() => validateBundledDataRows(
      'panel_wizard_brightness.csv',
      substitutedBrightnessScore,
      { requireComplete: true },
    )).toThrow("has score 1, expected pinned score 4")

    const substitutedDetectorMetadata = conventionalRows.slice(1).map((row) => [...row])
    const detectorMetadataIndex = substitutedDetectorMetadata.findIndex((row) => row[0] === 'attune_nxt' && row[5] === 'FALSE')
    substitutedDetectorMetadata[detectorMetadataIndex]![4] = '600/20'
    expect(() => validateBundledDataRows(
      'conventional_detector_dictionary.csv',
      [conventionalRows[0]!, ...substitutedDetectorMetadata],
      { requireComplete: true },
    )).toThrow('does not match pinned detector metadata')

    const markerAliasRows = markerRows.slice(1).map((row) => [...row])
    const markerAliasIndex = markerAliasRows.findIndex((row) => row[1])
    markerAliasRows[markerAliasIndex]![1] = markerAliasRows[markerAliasIndex]![1]!
      .split(';')
      .slice(1)
      .join(';')
    expect(() => validateBundledDataRows('marker_dictionary.csv', [markerRows[0]!, ...markerAliasRows], { requireComplete: true }))
      .toThrow('aliases do not match pinned marker alias coverage')
  })

  test('bundles expanded fluorophore and marker dictionaries without duplicate canonical names', () => {
    const fluorophoreRows = parseCsv(readFileSync(fluorophoreDictionaryPath, 'utf8'))
    const markerRows = parseCsv(readFileSync(markerDictionaryPath, 'utf8'))
    const normalized = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '')
    const fluorophores = fluorophoreRows.slice(1).map((row) => normalized(row[0]))
    const markers = markerRows.slice(1).map((row) => normalized(row[0]))

    expect(fluorophores).toHaveLength(445)
    expect(new Set(fluorophores).size).toBe(fluorophores.length)
    expect(markers).toHaveLength(878)
    expect(new Set(markers).size).toBe(markers.length)
  })

  test('bundles source-linked conventional fluorophore estimates', () => {
    const rows = parseCsv(readFileSync(conventionalEstimatePath, 'utf8'))
    const records = rows.slice(1).map((row) => Object.fromEntries(rows[0].map((header, index) => [header, row[index] ?? ''])))
    expect(records.map((row) => row.fluorophore)).toEqual([
      'Super Bright 600',
      'Super Bright 645',
      'Super Bright 702',
      'Zombie Aqua',
      'BV785',
    ])
    expect(records.every((row) => row.mapping_confidence === 'estimated')).toBe(true)
    expect(records.every((row) => row.source_url.startsWith('https://'))).toBe(true)
    expect(records.every((row) => row.source_note.length > 0)).toBe(true)
  })
})
