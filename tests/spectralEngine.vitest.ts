import { beforeEach, describe, expect, test } from 'vitest'
import {
  buildPanelPayload,
  calculatePanelComplexity,
  calculateSimilarityMatrix,
  parseCsv,
  resolveConfiguration,
  resolveCytometer,
} from '../src/spectralEngine'
import { mockBundledData } from './helpers'

beforeEach(mockBundledData)

describe('browser spectral engine parity', () => {
  test.each([
    {
      cytometer: 'aurora',
      configuration: '5l_uv_v_b_yg_r',
      selected: ['Alexa Fluor 488', 'Alexa Fluor 647'],
      detectorCount: 64,
      fluorophoreCount: 92,
      complexity: 1.02,
      peaks: ['B2-A', 'R2-A'],
      similarity: 0.000416241590217311,
      sampleDetector: 'B1-A',
      sampleValue: 0.823603,
    },
    {
      cytometer: 'discover',
      configuration: 'discover_s8',
      selected: ['Alexa Fluor 488', 'Alexa Fluor 647'],
      detectorCount: 78,
      fluorophoreCount: 68,
      complexity: 1.08,
      peaks: ['B2 (515)-A', 'R2 (675)-A'],
      similarity: 0.00281170215563086,
      sampleDetector: 'B1 (500)-A',
      sampleValue: 0.37054,
    },
    {
      cytometer: 'id7000',
      configuration: 'id7000_4l',
      selected: ['Alexa Fluor 488', 'Alexa Fluor 647'],
      detectorCount: 112,
      fluorophoreCount: 64,
      complexity: 1.07,
      peaks: ['488CH6-A', '637CH19-A'],
      similarity: 0,
      sampleDetector: '488CH4-A',
      sampleValue: 0.53,
    },
    {
      cytometer: 'xenith',
      configuration: 'full',
      selected: ['Alexa Fluor 350', 'Alexa Fluor 488'],
      detectorCount: 51,
      fluorophoreCount: 63,
      complexity: 1.6,
      peaks: ['FL09-A', 'FL37-A'],
      similarity: 0.00720632886966126,
      sampleDetector: 'FL08-A',
      sampleValue: 0.621333,
    },
  ])('matches the former R payload for $cytometer', async (fixture) => {
    const payload = await buildPanelPayload(fixture.cytometer, fixture.configuration, fixture.selected)
    expect(payload.cytometer).toBe(fixture.cytometer)
    expect(payload.configuration).toBe(fixture.configuration)
    expect(payload.detectors).toHaveLength(fixture.detectorCount)
    expect(payload.fluorophores).toHaveLength(fixture.fluorophoreCount)
    expect(payload.selected).toEqual(fixture.selected)
    expect(payload.complexity_index).toBe(fixture.complexity)
    expect(payload.peak_detectors).toEqual(fixture.peaks)
    expect(Number(payload.similarity[0][fixture.selected[1]])).toBeCloseTo(fixture.similarity, 12)
    expect(Number(payload.spectra[0][fixture.sampleDetector])).toBeCloseTo(fixture.sampleValue, 12)
  })

  test('retains the complete instrument/configuration catalog and aliases', async () => {
    const payloads = await Promise.all([
      buildPanelPayload('aurora'),
      buildPanelPayload('discover'),
      buildPanelPayload('id7000'),
      buildPanelPayload('xenith'),
    ])
    expect(payloads.map((payload) => payload.configurations.length)).toEqual([4, 2, 3, 1])
    expect(payloads[0].libraries.map((library) => library.id)).toEqual(['aurora', 'discover', 'id7000', 'xenith'])
    expect(resolveCytometer('BD FACSDiscover')).toBe('discover')
    expect(resolveCytometer('Thermo Fisher Attune Xenith')).toBe('xenith')
    expect(resolveConfiguration('aurora', '4L UV')).toBe('4l_uv_v_b_r')
    expect(resolveConfiguration('id7000', 'ID7000 3 laser')).toBe('id7000_3l')
  })

  test('matches cosine and condition-number edge behavior', () => {
    expect(calculateSimilarityMatrix([[0.2, 1], [1, 0.1]])).toEqual([
      [1, expect.any(Number)],
      [expect.any(Number), 1],
    ])
    expect(calculatePanelComplexity([[0.2, 1]])).toBe(1)
    expect(calculatePanelComplexity([[0, 0], [0, 0]])).toBeNull()
    expect(calculatePanelComplexity([[0.2, 1], [1, 0.1]])).toBe(1.35)
  })

  test('parses quoted bundled CSV syntax without changing values', () => {
    expect(parseCsv('"fluorophore","B1-A"\r\n"A ""quoted"" dye",1e-3\r\n')).toEqual([
      ['fluorophore', 'B1-A'],
      ['A "quoted" dye', '1e-3'],
    ])
  })
})
