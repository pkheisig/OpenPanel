import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  buildPanelPayload,
  resetSpectralEngineForTests,
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
    ['cytometer', 'detector', 'laser', 'description', 'is_scatter', 'common_fluorophores'],
    ['', '', 'Other', '', 'false', 'PE'],
    ['fortessa', '450/50-V-A', 'Other', '', 'false', 'PE'],
    ['fortessa', '525/50-V-A', 'Blue', '530/30', 'false', 'FITC;SSC'],
    ...detectorNames.slice(2).map((detector) => ['fortessa', detector, 'Blue', '530/30', 'false', 'FITC']),
    ['fortessa', 'SSC-A', 'Blue', '500/50', 'TRUE', 'FITC'],
  ]
  const fluorophoreRows = [
    ['fluorophore', 'aliases', 'nominal_wavelength', 'excitation_laser'],
    ['FITC', '', '520', 'Blue'],
    ['PE', '', '575', 'Blue'],
    ['NoLaser', '', '620', ''],
    ['', '', '', ''],
  ]
  const estimateRows = [
    ['fluorophore', 'source_url', 'source_note'],
    ['NoLaser', 'https://example.test/no-laser', 'missing excitation'],
    ['Unknown', 'https://example.test/unknown', 'missing dictionary row'],
  ]
  return vi.fn(async (input: string | URL | Request) => {
    const source = input instanceof Request ? input.url : String(input)
    const filename = new URL(source).pathname.split('/').at(-1)
    const bodies: Record<string, string> = {
      'cytometer_dictionary.csv': 'cytometer,detector,laser,description\n',
      'fluorophore_dictionary.csv': csv(fluorophoreRows),
      'conventional_detector_dictionary.csv': csv(conventionalRows),
      'conventional_fluorophore_estimates.csv': csv(estimateRows),
    }
    return new Response(bodies[filename ?? ''] ?? '', { status: 200 })
  })
}

function gappedFetch() {
  const conventionalRows = [
    ['cytometer', 'detector', 'laser', 'description', 'is_scatter', 'common_fluorophores'],
    ['fortessa', 'MissingDetector', 'Mystery'],
    ['fortessa', '', 'Blue', '530/30', 'false', 'Blank;NoFilter'],
    ['fortessa', '450/50-V-A', 'Blue', '500/50', 'false', 'Preferred'],
    ['fortessa', '525/50-B-A', 'Blue', '500/50', 'false', 'Preferred'],
    ['fortessa', 'NotInConfig', 'Mystery', '', 'false', 'OutOfConfig'],
    ['fortessa', 'SSC-A', 'Blue', '500/50', 'TRUE', 'Scatter'],
  ]
  const fluorophoreRows = [
    ['fluorophore', 'nominal_wavelength', 'excitation_laser'],
    ['Blank', '', ''],
    ['Estimate', '500', 'Blue'],
    ['NoFilter', '', 'Blue'],
    ['OutOfConfig', '610', 'Blue'],
    ['Preferred', '520', 'Blue'],
  ]
  const estimateRows = [
    ['fluorophore', 'source_url', 'source_note'],
    ['Estimate', 'https://example.test/estimate', 'estimated response'],
    ['UnknownEstimate', 'https://example.test/unknown', 'missing dictionary row'],
  ]
  return vi.fn(async (input: string | URL | Request) => {
    const source = input instanceof Request ? input.url : String(input)
    const filename = new URL(source).pathname.split('/').at(-1)
    const bodies: Record<string, string> = {
      'cytometer_dictionary.csv': 'cytometer,detector,laser,description\n',
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
        return new Response('cytometer,detector,laser,description,is_scatter,common_fluorophores\n', { status: 200 })
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
