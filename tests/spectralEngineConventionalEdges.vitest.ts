import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  buildPanelPayload,
  resetSpectralEngineForTests,
  validateBundledDataRows,
} from '../src/spectralEngine'

const detectorNames = [
  '450/50-V-A', '525/50-V-A', '610/20-V-A', '670/30-V-A', '710/50-V-A', '780/60-V-A',
  '525/50-B-A', '575/26-B-A', '610/20-B-A', '695/40-B-A', '780/60-B-A',
  '670/30-R-A', '730/45-R-A', '780/60-R-A',
]

function csv(rows: string[][]): string {
  return rows.map((row) => row.join(',')).join('\n')
}

function customFetch() {
  const conventionalRows = [
    ['cytometer', 'configuration', 'detector', 'laser', 'description', 'is_scatter', 'common_fluorophores'],
    ['fortessa', 'fortessa_3l', '450/50-V-A', 'Other', 'unfiltered reference', 'false', 'PE'],
    ['fortessa', 'fortessa_3l', '525/50-V-A', 'Blue', '530/30', 'false', 'FITC;SSC'],
    ...detectorNames.slice(2).map((detector) => ['fortessa', 'fortessa_3l', detector, 'Blue', '530/30', 'false', 'FITC']),
    ['fortessa', 'fortessa_3l', 'SSC-A', 'Blue', '500/50', ' TRUE ', 'FITC'],
  ]
  const fluorophoreRows = [
    ['fluorophore', 'aliases', 'excitation_laser', 'nominal_wavelength', 'is_viability'],
    ['FITC', '', 'Blue', '520', 'FALSE'],
    ['PE', '', 'Blue', '575', 'FALSE'],
    ['NoLaser', '', 'Red', '620', 'FALSE'],
  ]
  const estimateRows = [
    ['fluorophore', 'source_url', 'source_note', 'mapping_confidence'],
    ['NoLaser', 'https://example.test/no-laser', 'reference mapping', 'estimated'],
    ['Unknown', 'https://example.test/unknown', 'missing dictionary row', 'estimated'],
  ]
  return vi.fn(async (input: string | URL | Request) => {
    const source = input instanceof Request ? input.url : String(input)
    const filename = new URL(source).pathname.split('/').at(-1)
    const bodies: Record<string, string> = {
      'cytometer_dictionary.csv': 'cytometer,detector,laser,description\naurora,UV1-A,UV,UV detector\n',
      'fluorophore_dictionary.csv': csv(fluorophoreRows),
      'conventional_detector_dictionary.csv': csv(conventionalRows),
      'conventional_fluorophore_estimates.csv': csv(estimateRows),
    }
    return new Response(bodies[filename ?? ''] ?? '', { status: 200 })
  })
}

function gappedFetch() {
  const conventionalRows = [
    ['cytometer', 'configuration', 'detector', 'laser', 'description', 'is_scatter', 'common_fluorophores'],
    ['fortessa', 'fortessa_3l', 'MissingDetector', 'Other', '500/50', 'false', ''],
    ['fortessa', 'fortessa_3l', '450/50-V-A', 'Blue', '500/50', 'false', 'Preferred'],
    ['fortessa', 'fortessa_3l', '525/50-B-A', 'Blue', '500/50', 'false', 'Preferred'],
    ['fortessa', 'fortessa_3l', 'NotInConfig', 'Other', '500/50', 'false', 'OutOfConfig'],
    ['fortessa', 'fortessa_3l', 'SSC-A', 'Blue', '500/50', 'TRUE', 'Scatter'],
  ]
  const fluorophoreRows = [
    ['fluorophore', 'aliases', 'excitation_laser', 'nominal_wavelength', 'is_viability'],
    ['Blank', '', 'Blue', '500', 'FALSE'],
    ['Estimate', '', 'Blue', '500', 'FALSE'],
    ['NoFilter', '', 'Blue', '600', 'FALSE'],
    ['OutOfConfig', '', 'Blue', '610', 'FALSE'],
    ['Preferred', '', 'Blue', '520', 'FALSE'],
  ]
  const estimateRows = [
    ['fluorophore', 'source_url', 'source_note', 'mapping_confidence'],
    ['Estimate', 'https://example.test/estimate', 'estimated response', 'estimated'],
    ['UnknownEstimate', 'https://example.test/unknown', 'missing dictionary row', 'estimated'],
  ]
  return vi.fn(async (input: string | URL | Request) => {
    const source = input instanceof Request ? input.url : String(input)
    const filename = new URL(source).pathname.split('/').at(-1)
    const bodies: Record<string, string> = {
      'cytometer_dictionary.csv': 'cytometer,detector,laser,description\naurora,UV1-A,UV,UV detector\n',
      'fluorophore_dictionary.csv': csv(fluorophoreRows),
      'conventional_detector_dictionary.csv': csv(conventionalRows),
      'conventional_fluorophore_estimates.csv': csv(estimateRows),
    }
    return new Response(bodies[filename ?? ''] ?? '', { status: 200 })
  })
}

beforeEach(() => {
  resetSpectralEngineForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('conventional spectral engine defensive paths', () => {
  test('fails closed for malformed conventional filter geometry', () => {
    const headers = ['cytometer', 'configuration', 'detector', 'laser', 'description', 'is_scatter', 'common_fluorophores']
    expect(() => validateBundledDataRows('conventional_detector_dictionary.csv', [
      headers,
      ['fortessa', 'fortessa_3l', '530/0-B-A', 'Blue', '530/0', 'FALSE', 'FITC'],
    ])).toThrow('non-positive bandpass width')
    expect(() => validateBundledDataRows('conventional_detector_dictionary.csv', [
      headers,
      ['fortessa', 'fortessa_3l', '600-500-B-A', 'Blue', '600-500', 'FALSE', 'FITC'],
    ])).toThrow('non-increasing filter range')
    expect(() => validateBundledDataRows('conventional_detector_dictionary.csv', [
      headers,
      ['fortessa', 'fortessa_3l', '530/30-B-A', 'Blue', 'not a filter', 'FALSE', 'FITC'],
    ])).toThrow('must be a positive bandpass')
  })

  test('rejects conflicting detector metadata in a shared runtime scope', () => {
    expect(() => validateBundledDataRows('cytometer_dictionary.csv', [
      ['cytometer', 'detector', 'laser', 'description'],
      ['discover_s8', 'V1 (420)-A', 'Violet', ''],
      ['discover_a8', 'V1 (420)-A', 'Blue', ''],
    ])).toThrow('shared runtime cytometer scope')

    expect(() => validateBundledDataRows('conventional_detector_dictionary.csv', [
      ['cytometer', 'configuration', 'detector', 'laser', 'description', 'is_scatter', 'common_fluorophores'],
      ['fortessa', 'fortessa_3l', '530/30-B-A', 'Blue', '530/30', 'FALSE', 'FITC'],
      ['fortessa', 'fortessa_4l', '530/30-B', 'Red', '600/20', 'FALSE', 'FITC'],
    ])).toThrow('shared runtime cytometer scope')
  })

  test('builds a minimal conventional library from public reference tables', async () => {
    vi.stubGlobal('fetch', customFetch())
    const result = await buildPanelPayload('fortessa', 'fortessa_3l', ['FITC', 'PE'])
    expect(result.measurement_mode).toBe('conventional')
    expect(result.detectors).toHaveLength(detectorNames.length)
    expect(result.selected).toEqual(['FITC', 'PE'])
    expect(result.fluorophores.find((item) => item.fluorophore === 'PE')).toMatchObject({
      mapping_confidence: 'curated',
    })
    expect(result.spectra[1]['450/50-V-A']).toBe(1)
  })

  test('reports missing conventional detector data and unmatched configurations', async () => {
    const fetch = customFetch()
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const source = input instanceof Request ? input.url : String(input)
      if (source.endsWith('/conventional_detector_dictionary.csv')) {
        return new Response(
          'cytometer,configuration,detector,laser,description,is_scatter,common_fluorophores\n'
          + 'celesta,celesta_bv,530/30-B-A,Blue,530/30,FALSE,FITC\n',
          { status: 200 },
        )
      }
      return fetch(input)
    }))
    await expect(buildPanelPayload('fortessa', 'fortessa_3l')).rejects.toThrow('No conventional detector reference data')

    resetSpectralEngineForTests()
    vi.stubGlobal('fetch', customFetch())
    await expect(buildPanelPayload('fortessa', 'fortessa_3l')).resolves.toBeDefined()
  })

  test('handles missing reference fields, estimates, and detectors outside a configuration', async () => {
    vi.stubGlobal('fetch', gappedFetch())
    const result = await buildPanelPayload('fortessa', 'fortessa_3l', ['Estimate', 'OutOfConfig', 'Blank'])
    expect(result.measurement_mode).toBe('conventional')
    expect(result.detectors.map((detector) => detector.detector)).toEqual(['450/50-V-A', '525/50-B-A'])
    expect(result.fluorophores.map((item) => item.fluorophore)).toEqual(expect.arrayContaining(['Estimate', 'Preferred']))
    expect(result.fluorophores.find((item) => item.fluorophore === 'Estimate')).toMatchObject({ mapping_confidence: 'estimated' })
  })
})
