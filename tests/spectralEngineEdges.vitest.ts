import { describe, expect, test, vi } from 'vitest'
import {
  approximateDetectorResponse,
  addCanonicalFluorophoreRow,
  addFluorophoreDictionaryRow,
  applyPreferredDetectorFallback,
  detectorEmission,
  detectorFilter,
  detectorLaser,
  dataUrl,
  dictionaryText,
  id7000Emission,
  normalizeLaserName,
  normalizeRow,
  ninePointBandpass,
  parseLibrary,
  requireSpectralLibrary,
  rowsToObjects,
  resolveConfiguration,
} from '../src/spectralEngine'

describe('spectral engine defensive and reference helpers', () => {
  test('fails closed for malformed spectral library rows and headers', () => {
    expect(() => parseLibrary([], 'bundled spectral library', 'spectral')).toThrow('no detector columns')
    expect(() => parseLibrary([['fluorophore', 'B1-A']], 'bundled spectral library', 'spectral')).toThrow('contains no fluorophore rows')
    const valid = [
      ['fluorophore', 'B1-A', 'V1-A'],
      ['FITC', '1', '0'],
    ]
    expect(parseLibrary(valid, 'fixture.csv', 'spectral')).toMatchObject({
      detectors: ['B1-A', 'V1-A'], fluorophores: ['FITC'], values: [[1, 0]],
    })
    const expectFailure = (rows: string[][], message: string) => {
      expect(() => parseLibrary(rows, 'fixture.csv', 'spectral')).toThrow(message)
    }
    expect(() => parseLibrary([
      ['fluorophore', 'B1-A', 'V1-A'],
      ['FITC', '1', 'not-a-number'],
    ], 'fixture.csv', 'spectral')).toThrow("fixture.csv: row 2 column 'V1-A' for fluorophore 'FITC' has non-finite value 'not-a-number'.")
    expectFailure([['fluorophore', 'B1-A', 'V1-A'], ['FITC', 'NaN', '1']], "column 'B1-A'")
    expectFailure([['fluorophore', 'B1-A', 'V1-A'], ['FITC', 'Infinity', '1']], "column 'B1-A'")
    expectFailure([['fluorophore', 'B1-A', 'V1-A'], ['FITC', '', '1']], "column 'B1-A'")
    expectFailure([['fluorophore', 'B1-A', 'V1-A'], ['FITC', '1']], 'expected 3')
    expectFailure([['fluorophore', 'B1-A', 'V1-A'], ['FITC', '1', '1'], ['FITC', '2', '2']], 'duplicates canonical fluorophore')
    expectFailure([['fluorophore', 'B1-A', 'B1'], ['FITC', '1', '1']], 'duplicates')
    expectFailure([['fluorophore', '', 'V1-A'], ['FITC', '1', '1']], 'blank detector header')
    expectFailure([['fluorophore', '---'], ['FITC', '1']], 'empty canonical identity')
    expectFailure([['fluorophore', 'B1-A', 'V1-A'], ['', '1', '1']], 'blank fluorophore identity')
    expectFailure([['fluorophore', 'B1-A', 'V1-A'], ['---', '1', '1']], 'empty canonical identity')
    expectFailure([['fluorophore', 'B1-A', 'V1-A'], ['FITC', '0', '0']], 'no meaningful nonzero')
    expectFailure([['fluorophore', 'B1-A', 'V1-A'], ['FITC', '-0.2', '-0.1']], 'no meaningful nonzero')
    expectFailure([['fluorophore', 'B1-A', 'V1-A'], ['FITC', '1.01', '0']], 'outside')
    expectFailure([['fluorophore', 'B1-A', 'V1-A'], ['FITC', '-1.01', '0']], 'outside')
    expectFailure([['fluorophore', 'fluorophore'], ['FITC', '1']], 'reserved')
    expectFailure([['name', 'B1-A', 'V1-A'], ['FITC', '1', '1']], 'identity column')
    expectFailure([['fluorophore ', 'B1-A'], ['FITC', '1']], 'surrounding whitespace')
    expect(rowsToObjects([])).toEqual([])
    expect(rowsToObjects([['name', 'value'], ['x']])).toEqual([{ name: 'x', value: '' }])
    expect(dictionaryText(undefined)).toBe('')
    expect(dictionaryText('known')).toBe('known')
    const rows = new Map<string, Record<string, string>>()
    addCanonicalFluorophoreRow(rows, undefined, { fluorophore: 'ignored' })
    addCanonicalFluorophoreRow(rows, 'FITC', { fluorophore: 'FITC' })
    expect(rows.get('FITC')?.fluorophore).toBe('FITC')
    const aliases = new Map<string, string>()
    addFluorophoreDictionaryRow(aliases, {})
    addFluorophoreDictionaryRow(aliases, { fluorophore: 'FITC', aliases: 'Fluorescein' })
    expect(aliases.get('fluorescein')).toBe('FITC')
    const fallbackRow = [0, 0]
    applyPreferredDetectorFallback(fallbackRow, ['V1-A'], 'missing')
    expect(fallbackRow).toEqual([0, 0])
    const populatedRow = [1, 0]
    applyPreferredDetectorFallback(populatedRow, ['V1-A'], 'V1-A')
    expect(populatedRow).toEqual([1, 0])
  })

  test('normalizes laser aliases and derives detector fallback metadata', () => {
    expect(['V', 'violet', 'B', 'blue', 'Y', 'YG', 'yellow-green', 'R', 'red', 'U', 'uv', 'DUV', 'deepuv', 'IR']
      .map((value) => normalizeLaserName(value))).toEqual([
      'Violet', 'Violet', 'Blue', 'Blue', 'YellowGreen', 'YellowGreen', 'YellowGreen', 'Red', 'Red', 'UV', 'UV', 'DeepUV', 'DeepUV', 'IR',
    ])
    expect(normalizeLaserName('Other laser')).toBe('Other laser')
    expect(normalizeLaserName(undefined)).toBe('')
    expect(detectorLaser('aurora', '320-A')).toBe('DeepUV')
    expect(detectorLaser('aurora', 'UV1-A')).toBe('UV')
    expect(detectorLaser('aurora', 'V1-A')).toBe('Violet')
    expect(detectorLaser('aurora', 'B1-A')).toBe('Blue')
    expect(detectorLaser('aurora', 'YG1-A')).toBe('YellowGreen')
    expect(detectorLaser('aurora', 'R1-A')).toBe('Red')
    expect(detectorLaser('aurora', 'IR1-A')).toBe('IR')
    expect(detectorLaser('aurora', 'mystery')).toBe('Other')
  })

  test('maps ID7000 channels and detector emission fallback patterns', () => {
    expect(id7000Emission('488CH4-A')).toBe(500)
    expect(id7000Emission('637CH19-A')).toBe(690)
    expect(id7000Emission('not-a-channel')).toBeNull()
    expect(detectorEmission('id7000', 'not-a-channel')).toBe(400)
    expect(detectorEmission('aurora', 'B1-A')).toBe(500)
    expect(detectorEmission('aurora', 'V2-A')).toBe(440)
    expect(detectorEmission('aurora', 'B1 (530)-A')).toBe(530)
    expect(detectorEmission('aurora', 'X530-A')).toBe(530)
    expect(detectorEmission('id7000', '405CH1-A')).toBe(420)
    expect(detectorEmission('aurora', 'mystery')).toBe(400)
  })

  test('recognizes detector filters, response curves, and normalization edges', () => {
    expect(detectorFilter('aurora', '530/30-B-A')).toEqual({ center: 530, width: 30, type: 'bandpass' })
    expect(detectorFilter('aurora', '500-550')).toEqual({ center: 525, width: 50, type: 'bandpass' })
    expect(detectorFilter('aurora', '700 LP')).toEqual({ center: 700, width: 0, type: 'longpass' })
    expect(detectorFilter('aurora', 'unknown')).toBeNull()
    expect(approximateDetectorResponse(700, { center: 650, width: 0, type: 'longpass' })).toBeGreaterThan(0.9)
    expect(approximateDetectorResponse(530, { center: 530, width: 30, type: 'bandpass' })).toBeGreaterThan(0.5)
    expect(ninePointBandpass(500, 90)).toHaveLength(9)
    expect(normalizeRow([0, -2, 1])).toEqual([0, -1, 0.5])
    expect(normalizeRow([0, 0])).toEqual([0, 0])
  })

  test('covers configuration aliases and the server-side data URL', () => {
    expect(resolveConfiguration('lsrii', '6b999v999uv999r')).toBe('lsrii_6b_0v_0uv_3r')
    expect(resolveConfiguration('lsrii', '6b')).toBe('lsrii_6b_0v_0uv_3r')
    expect(resolveConfiguration('dxflex', '13colour')).toBe('dxflex_b5_r3_v5')
    expect(() => requireSpectralLibrary(undefined, 'aurora')).toThrow('Spectral library file is missing')
    const originalWindow = globalThis.window
    vi.stubGlobal('window', undefined)
    expect(dataUrl('fixture.csv')).toBe('http://localhost/data/fixture.csv')
    vi.stubGlobal('window', { location: { origin: 'https://example.test' } })
    expect(dataUrl('fixture.csv')).toBe('https://example.test/data/fixture.csv')
    vi.stubGlobal('window', originalWindow)
  })
})
