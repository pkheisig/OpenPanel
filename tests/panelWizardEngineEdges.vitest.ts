import { describe, expect, test } from 'vitest'
import {
  alternatives,
  brightnessCoverageRisk,
  closestPair,
  generateWizardResults,
  fluorophoreAvailability,
  markerPriority,
  markerFluorophoreBrightnessScore,
  optimizeBestFit,
  panelMetrics,
  spectrumVector,
} from '../src/panelWizardEngine'
import type { WizardMarker } from '../src/panelWizardEngine'
import type { WizardReferenceData } from '../src/panelWizardReferences'
import { responseMatrixProvenance } from '../src/panelBuilderShared'

function payload() {
  const names = ['FITC', 'PE', 'APC', 'Zombie Aqua', 'mFluor Vio610', 'Another Dye']
  const values = [
    [1, 0], [0.8, 0.2], [0.2, 0.8], [0.1, 0.9], [0.6, 0.4], [0.5, 0.5],
  ]
  return {
    cytometer: 'aurora', configuration: 'config', measurement_mode: 'spectral',
    libraries: [], configurations: [],
    detectors: [{ detector: 'D1', label: 'D1' }, { detector: 'D2', label: 'D2' }],
    fluorophores: names.map((fluorophore) => ({ fluorophore, peak_laser: fluorophore === 'APC' ? 'Red' : 'Blue' })),
    selected: [],
    spectra: names.map((fluorophore, index) => ({ fluorophore, D1: values[index][0], D2: values[index][1] })),
    similarity: [], complexity_index: null, peak_detectors: [], max_panel_size: 8,
  } as never
}

const references: WizardReferenceData = {
  brightnessByFluorophore: { fitc: 3, pe: 5, apc: 2, 'zombieaqua': 1 },
  antigenDensityByContext: {}, markerOptions: [],
}

function marker(id: string, name: string, currentFluorophore = ''): WizardMarker {
  return { id, slotIndex: Number(id.replace(/\D/g, '')) || 0, name, antigenDensity: 'high', currentFluorophore }
}

describe('wizard engine edge paths', () => {
  test('covers high-density brightness demand and finite reference filtering', () => {
    expect(markerFluorophoreBrightnessScore(marker('m0', 'CD3'), 'FITC', references)).toBeGreaterThan(0)
    expect(markerFluorophoreBrightnessScore(marker('m0', 'CD3'), 'Unknown', {
      ...references, brightnessByFluorophore: { fitc: Number.NaN, unknown: Number.POSITIVE_INFINITY },
    })).toBeNull()
    expect(fluorophoreAvailability('BV999').confidence).toBe('Estimated')
    expect(fluorophoreAvailability('BUV999').confidence).toBe('Estimated')
    expect(fluorophoreAvailability('BB999').confidence).toBe('Estimated')
    expect(fluorophoreAvailability('Alexa Fluor 999').confidence).toBe('Estimated')
    expect(fluorophoreAvailability('PE-Fire 999').confidence).toBe('Estimated')
    expect(fluorophoreAvailability('PerCP-999').confidence).toBe('Estimated')
    expect(fluorophoreAvailability('Super Bright 999').confidence).toBe('Estimated')
    expect(fluorophoreAvailability('Spark 999').confidence).toBe('Estimated')
    expect(fluorophoreAvailability('RB999').confidence).toBe('Estimated')
  })

  test('adds a missing viability dye and fills a practical recommended pool', () => {
    const result = generateWizardResults(
      payload(),
      [marker('m0', 'CD3'), marker('m1', 'Live/Dead')],
      {},
      6,
      references,
    )
    expect(result.recommended.rows).toHaveLength(2)
    expect(result.recommended.rows.find((row) => row.markerName === 'Live/Dead')?.fluorophore)
      .toMatch(/Zombie|Live|DAPI|7-AAD|SYTOX/i)
  })

  test('handles unknown locked dyes and empty assignments conservatively', () => {
    const unknown = generateWizardResults(
      payload(),
      [marker('m0', 'CD3', 'Not in library'), marker('m1', 'CD4')],
      {},
      2,
      references,
    )
    expect(unknown.recommended.rows[0]).toMatchObject({ fluorophore: 'Not in library', peakLaser: '' })
    expect(unknown.recommended.rows.some((row) => row.markerName === 'CD4')).toBe(true)

    const empty = generateWizardResults(payload(), [marker('m0', 'CD3')], {}, 0, references)
    expect(empty.recommended.rows).toEqual([])
    expect(empty.bestFit.rows).toEqual([])
  })

  test('supports alternatives when all selected dyes are locked', () => {
    const result = generateWizardResults(payload(), [marker('m0', 'CD3', 'FITC')], {}, 1, references)
    expect(result.recommended.rows[0]).toMatchObject({ fluorophore: 'FITC', isExisting: true })
    expect(result.recommended.alternatives.length).toBeGreaterThan(0)
  })

  test('exercises deterministic engine fallbacks directly', () => {
    const spectra = new Map<string, number[]>([['FITC', [1, 0]]])
    expect(spectrumVector({ D1: 'not-a-number', D2: 2 } as never, ['D1', 'D2'])).toEqual([0, 2])
    expect(panelMetrics([], spectra, responseMatrixProvenance('measured_full_spectrum')).spectralRisk).toBe(1000)
    expect(panelMetrics(['FITC', 'PE'], new Map([
      ['FITC', [1, 0]], ['PE', [0.8, 0.2]],
    ]), responseMatrixProvenance('synthetic_filter_proxy')).maxSif).toBeNull()
    expect(panelMetrics(['FITC', 'PE'], new Map([
      ['FITC', [1, 0]], ['PE', [0.8, 0.2]],
    ]), responseMatrixProvenance('measured_detector_response')).maxSif).toBeGreaterThan(1)
    expect(closestPair('missing', ['missing'], spectra)).toEqual({ name: '', similarity: 0 })
    expect(markerPriority(marker('m0', 'CD3'), [marker('m0', 'CD3')], {})).toBe(90 * 0.45)
    expect(optimizeBestFit(
      ['FITC'], ['PE'], 1, spectra, () => false, [marker('m0', 'CD3')], [], references,
    )).toEqual(['FITC'])

    let reads = 0
    const dynamicReferences: WizardReferenceData = {
      ...references,
      brightnessByFluorophore: {},
      antigenDensityByContext: {}, markerOptions: [],
    }
    Object.defineProperty(dynamicReferences.brightnessByFluorophore, 'fitc', {
      get: () => { reads += 1; return reads === 1 ? 3 : Number.NaN },
    })
    expect(brightnessCoverageRisk(['FITC'], [], [marker('m0', 'CD3')], dynamicReferences)).toBe(0)
    expect(alternatives([], ['FITC'], [], new Map(), { fluorophores: [] } as never, references)[0])
      .toMatchObject({ fluorophore: 'FITC', peakLaser: '' })
  })
})
