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

const fortessa4DetectorNames = [
  '450/50-V-A', '525/50-V-A', '610/20-V-A', '670/30-V-A', '710/50-V-A', '780/60-V-A',
  '529/24-B-A', '695/40-B-A',
  '582/15-YG-A', '610/20-YG-A', '670/14-YG-A', '710/50-YG-A', '780/60-YG-A',
  '670/30-R-A', '730/45-R-A', '780/60-R-A',
]

function csv(rows: string[][]): string {
  return rows.map((row) => row.join(',')).join('\n')
}

function customFetch() {
  const conventionalRows = [
    ['cytometer', 'configuration', 'detector', 'laser', 'description', 'is_scatter', 'common_fluorophores'],
    ...detectorNames.map((detector) => {
      const laser = detector.endsWith('-V-A') ? 'Violet' : detector.endsWith('-R-A') ? 'Red' : 'Blue'
      const description = detector.replace(/-[A-Z]+-A$/, '')
      const commonFluorophores = detector === '450/50-V-A' ? 'PE' : detector === '525/50-V-A' ? 'FITC;SSC' : 'FITC'
      return ['fortessa', 'fortessa_3l', detector, laser, description, 'false', commonFluorophores]
    }),
    ['fortessa', 'fortessa_3l', 'SSC-A', 'Blue', '500/50', ' TRUE ', 'FITC'],
    ...fortessa4DetectorNames.map((detector) => {
      const laser = detector.endsWith('-V-A') ? 'Violet' : detector.endsWith('-YG-A') ? 'YellowGreen' : detector.endsWith('-R-A') ? 'Red' : 'Blue'
      const description = detector.replace(/-[A-Z]+-A$/, '')
      return ['fortessa', 'fortessa_4l', detector, laser, description, 'false', 'FITC']
    }),
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
  ]
  return vi.fn(async (input: string | URL | Request) => {
    const source = input instanceof Request ? input.url : String(input)
    const filename = new URL(source).pathname.split('/').at(-1)
    const bodies: Record<string, string> = {
      'cytometer_dictionary.csv': 'cytometer,detector,laser,description\naurora,UV1-A,UV,\n',
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
  ]
  return vi.fn(async (input: string | URL | Request) => {
    const source = input instanceof Request ? input.url : String(input)
    const filename = new URL(source).pathname.split('/').at(-1)
    const bodies: Record<string, string> = {
      'cytometer_dictionary.csv': 'cytometer,detector,laser,description\naurora,UV1-A,UV,\n',
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
    expect(() => validateBundledDataRows('conventional_detector_dictionary.csv', [
      headers,
      ['fortessa', 'fortessa_3l', '999/10-B-A', 'Blue', '999/10', 'FALSE', 'FITC'],
    ])).toThrow('implausible conventional filter wavelength')
    expect(() => validateBundledDataRows('conventional_detector_dictionary.csv', [
      headers,
      ['fortessa', 'fortessa_3l', '500-999-B-A', 'Blue', '500-999', 'FALSE', 'FITC'],
    ])).toThrow('implausible conventional filter wavelength range')
    expect(() => validateBundledDataRows('conventional_detector_dictionary.csv', [
      headers,
      ['fortessa', 'fortessa_3l', '999 LP-B-A', 'Blue', '999 LP', 'FALSE', 'FITC'],
    ])).toThrow('implausible conventional filter wavelength')
  })

  test('fails closed for malformed conventional identities and brightness levels', () => {
    expect(() => validateBundledDataRows('conventional_detector_dictionary.csv', [
      ['cytometer', 'configuration', 'detector', 'laser', 'description', 'is_scatter', 'common_fluorophores'],
      ['fortessa', 'fortessa_3l', '---', 'Blue', '530/30', 'FALSE', 'FITC'],
    ])).toThrow('empty canonical identity')
    expect(() => validateBundledDataRows('conventional_detector_dictionary.csv', [
      ['cytometer ', 'configuration', 'detector', 'laser', 'description', 'is_scatter', 'common_fluorophores'],
      ['fortessa', 'fortessa_3l', '530/30-B-A', 'Blue', '530/30', 'FALSE', 'FITC'],
    ])).toThrow('surrounding whitespace')
    expect(() => validateBundledDataRows('panel_wizard_brightness.csv', [
      ['cytometer', 'configuration', 'fluorophore', 'brightness_score', 'source'],
      ['*', '*', 'FITC', '2', 'test'],
    ])).toThrow('one of 1, 3, 4, or 5')
    expect(() => validateBundledDataRows('panel_wizard_brightness.csv', [
      ['cytometer', 'configuration', 'fluorophore', 'brightness_score', 'source'],
      ['*', '*', 'Unknown dye', '3', 'test'],
    ])).toThrow('does not match a supported fluorophore')
  })

  test('fails closed for malformed spectral detector descriptions', () => {
    expect(() => validateBundledDataRows('cytometer_dictionary.csv', [
      ['cytometer', 'detector', 'laser', 'description'],
      ['xenith', 'FL00-A', 'UV', '349nm - 999/10-A'],
    ])).toThrow('implausible spectral detector wavelength')
  })

  test('fails closed for implausible fluorophore nominal wavelengths', () => {
    expect(() => validateBundledDataRows('fluorophore_dictionary.csv', [
      ['fluorophore', 'aliases', 'excitation_laser', 'nominal_wavelength', 'is_viability'],
      ['FITC', '', 'Blue', '901', 'FALSE'],
    ])).toThrow("column 'nominal_wavelength' has value '901' above 900")
  })

  test('validates and canonicalizes panel wizard instrument scopes', () => {
    const headers = ['cytometer', 'configuration', 'fluorophore', 'brightness_score', 'source']
    expect(() => validateBundledDataRows('panel_wizard_brightness.csv', [
      headers,
      ['Thermo Fisher Attune Xenith', 'Full', 'FITC', '3', 'test'],
    ])).not.toThrow()
    expect(() => validateBundledDataRows('panel_wizard_brightness.csv', [
      headers,
      ['not-a-cytometer', '*', 'FITC', '3', 'test'],
    ])).toThrow("column 'cytometer' has unsupported value 'not-a-cytometer'")
    expect(() => validateBundledDataRows('panel_wizard_brightness.csv', [
      headers,
      ['fortessa', 'not-a-configuration', 'FITC', '3', 'test'],
    ])).toThrow("column 'configuration' has unsupported value 'not-a-configuration'")
  })

  test('pins detector membership in shared conventional reference tables', () => {
    expect(() => validateBundledDataRows('conventional_detector_dictionary.csv', [
      ['cytometer', 'configuration', 'detector', 'laser', 'description', 'is_scatter', 'common_fluorophores'],
      ['facsverse', 'facsverse_reference', 'NotPinned', 'Blue', '530/30', 'FALSE', 'FITC'],
    ])).toThrow('pinned detector set')
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

  test('rejects non-positive antigen-density references', () => {
    const headers = ['cell_type', 'antigen', 'molecules_per_cell', 'source']
    expect(() => validateBundledDataRows('panel_wizard_antigen_density.csv', [
      headers,
      ['T cells', 'CD3', '0', 'test'],
    ])).toThrow("column 'molecules_per_cell' must be greater than zero")
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
    expect(result.spectra[1]['450/50-V-A']).toBeGreaterThan(0)
  })

  test('matches pinned detectors when a bundled detector omits the acquisition suffix', async () => {
    const bundledFetch = customFetch()
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const response = await bundledFetch(input)
      const source = input instanceof Request ? input.url : String(input)
      if (!source.endsWith('/conventional_detector_dictionary.csv')) return response
      return new Response((await response.text()).replaceAll('450/50-V-A', '450/50-V'), { status: 200 })
    }))
    const result = await buildPanelPayload('fortessa', 'fortessa_3l', ['FITC'])
    expect(result.detectors).toHaveLength(detectorNames.length)
    expect(result.detectors.find((detector) => detector.detector === '450/50-V')?.laser).toBe('Violet')
  })

  test('deduplicates equivalent detector aliases across conventional configurations', async () => {
    const bundledFetch = customFetch()
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const response = await bundledFetch(input)
      const source = input instanceof Request ? input.url : String(input)
      if (!source.endsWith('/conventional_detector_dictionary.csv')) return response
      const body = (await response.text()).replace(
        'fortessa,fortessa_3l,450/50-V-A,',
        'fortessa,fortessa_3l,450/50-V,',
      )
      return new Response(body, { status: 200 })
    }))
    const result = await buildPanelPayload('fortessa', 'fortessa_3l', ['FITC'])
    expect(result.detectors).toHaveLength(detectorNames.length)
    expect(result.detectors.filter((detector) => detector.detector.startsWith('450/50-V'))).toHaveLength(1)
  })

  test('normalizes conventional cytometer scopes before constructing a library', async () => {
    const bundledFetch = customFetch()
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const response = await bundledFetch(input)
      const source = input instanceof Request ? input.url : String(input)
      if (!source.endsWith('/conventional_detector_dictionary.csv')) return response
      return new Response((await response.text()).replaceAll('fortessa,', 'FORTESSA,'), { status: 200 })
    }))
    const result = await buildPanelPayload('fortessa', 'fortessa_3l', ['FITC'])
    expect(result.detectors).toHaveLength(detectorNames.length)
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
    await expect(buildPanelPayload('fortessa', 'fortessa_3l')).rejects.toThrow('pinned detector coverage')

    resetSpectralEngineForTests()
    vi.stubGlobal('fetch', customFetch())
    await expect(buildPanelPayload('fortessa', 'fortessa_3l')).resolves.toBeDefined()
  })

  test('fails closed when a conventional configuration has incomplete coverage', async () => {
    vi.stubGlobal('fetch', gappedFetch())
    await expect(buildPanelPayload('fortessa', 'fortessa_3l', ['Estimate', 'OutOfConfig', 'Blank']))
      .rejects.toThrow('pinned detector set')
  })

  test('rejects common fluorophores that are absent from the canonical dictionary', async () => {
    const fetch = customFetch()
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const source = input instanceof Request ? input.url : String(input)
      const response = await fetch(input)
      if (!source.endsWith('/conventional_detector_dictionary.csv')) return response
      const body = (await response.text()).replace('FITC;SSC', 'Unknown dye;SSC')
      return new Response(body, { status: 200 })
    }))
    await expect(buildPanelPayload('fortessa', 'fortessa_3l')).rejects.toThrow('does not match a canonical fluorophore or alias')
  })

  test('rejects conventional estimates that are absent from the canonical dictionary', async () => {
    const fetch = customFetch()
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const response = await fetch(input)
      const source = input instanceof Request ? input.url : String(input)
      if (!source.endsWith('/conventional_fluorophore_estimates.csv')) return response
      return new Response((await response.text()).replace('NoLaser,', 'UnknownEstimate,'), { status: 200 })
    }))
    await expect(buildPanelPayload('fortessa', 'fortessa_3l')).rejects.toThrow(
      "conventional_fluorophore_estimates.csv: row 2 column 'fluorophore' value 'UnknownEstimate' does not match a canonical fluorophore or alias.",
    )
  })

  test('rejects conventional estimate aliases that resolve to the same canonical fluorophore', async () => {
    const bundledFetch = customFetch()
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const response = await bundledFetch(input)
      const source = input instanceof Request ? input.url : String(input)
      if (source.endsWith('/fluorophore_dictionary.csv')) {
        return new Response((await response.text()).replace('FITC,,', 'FITC,Fluorescein,'), { status: 200 })
      }
      if (source.endsWith('/conventional_fluorophore_estimates.csv')) {
        const body = (await response.text()).replace(
          'NoLaser,https://example.test/no-laser,reference mapping,estimated',
          'Fluorescein,https://example.test/fluorescein,reference mapping,estimated\nFITC,https://example.test/fitc,reference mapping,estimated',
        )
        return new Response(body, { status: 200 })
      }
      return response
    }))
    await expect(buildPanelPayload('fortessa', 'fortessa_3l')).rejects.toThrow(
      "fluorophore 'FITC' resolves to canonical fluorophore 'FITC' already defined on row 2",
    )
  })
})
