import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  buildPanelPayload,
  calculatePanelComplexity,
  calculateSimilarityMatrix,
  detectorKeys,
  getSpectralPanelLibraries,
  getSpectralPanelConfigurations,
  initializeSpectralEngine,
  normalizeDetectorToken,
  parseCsv,
  resetSpectralEngineForTests,
  resolveConfiguration,
  resolveCytometer,
  resolvePersistedConfiguration,
  resolvePersistedCytometer,
} from '../src/spectralEngine'
import { mockBundledData } from './helpers'

beforeEach(mockBundledData)

function declaredDetectorCount(description: string): number | null {
  const directCount = description.match(/^(\d+) fluorescence detectors$/)
  if (directCount) return Number(directCount[1])

  const laserCounts = [...description.matchAll(/(\d+)(UV|YG|V|B|R)(?=-|$)/g)]
  if (laserCounts.length === 0) return null
  return laserCounts.reduce((sum, match) => sum + Number(match[1]), 0)
}

describe('browser spectral engine parity', () => {
  test.each([
    {
      cytometer: 'aurora',
      configuration: '5l_uv_v_b_yg_r',
      selected: ['Alexa Fluor 488', 'Alexa Fluor 647'],
      detectorCount: 64,
      fluorophoreCount: 395,
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
      fluorophoreCount: 78,
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
    expect(payload.measurement_mode).toBe('spectral')
    expect(payload.max_panel_size).toBe(fixture.detectorCount)
    expect(payload.detectors).toHaveLength(fixture.detectorCount)
    expect(payload.fluorophores).toHaveLength(fixture.fluorophoreCount)
    expect(payload.selected).toEqual(fixture.selected)
    expect(payload.complexity_index).toBe(fixture.complexity)
    expect(payload.peak_detectors).toEqual(fixture.peaks)
    expect(Number(payload.similarity[0][fixture.selected[1]])).toBeCloseTo(fixture.similarity, 12)
    expect(Number(payload.spectra[0][fixture.sampleDetector])).toBeCloseTo(fixture.sampleValue, 12)
  })

  test('retries a bundled library after its first fetch fails', async () => {
    const bundledFetch = globalThis.fetch
    let failedAuroraRequest = false
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const source = input instanceof Request ? input.url : String(input)
      if (!failedAuroraRequest && source.endsWith('/aurora_spectra.csv')) {
        failedAuroraRequest = true
        return new Response('Unavailable', { status: 503 })
      }
      return bundledFetch(input)
    })

    await expect(buildPanelPayload('aurora', '5l_uv_v_b_yg_r', ['Alexa Fluor 488']))
      .rejects.toThrow('aurora_spectra.csv')

    const recovered = await buildPanelPayload('aurora', '5l_uv_v_b_yg_r', ['Alexa Fluor 488'])
    expect(recovered.selected).toEqual(['Alexa Fluor 488'])
    expect(failedAuroraRequest).toBe(true)
  })

  test('rejects a configuration whose library has no matching detectors', async () => {
    const bundledFetch = globalThis.fetch
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const source = input instanceof Request ? input.url : String(input)
      if (source.endsWith('/aurora_spectra.csv')) {
        return new Response('fluorophore,Unknown-A\nFITC,1\n', { status: 200 })
      }
      return bundledFetch(input)
    })
    await expect(buildPanelPayload('aurora', '5l_uv_v_b_yg_r')).rejects.toThrow('no matching detectors')
  })

  test('shares dictionary and library failures across concurrent initializers before retrying', async () => {
    const bundledFetch = globalThis.fetch
    let failedDictionaryRequest = false
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const source = input instanceof Request ? input.url : String(input)
      if (!failedDictionaryRequest && source.endsWith('/cytometer_dictionary.csv')) {
        failedDictionaryRequest = true
        return new Response('Unavailable', { status: 503 })
      }
      return bundledFetch(input)
    })

    const first = initializeSpectralEngine()
    const second = initializeSpectralEngine()
    await expect(first).rejects.toThrow('cytometer_dictionary.csv')
    await expect(second).rejects.toThrow('cytometer_dictionary.csv')
    expect(failedDictionaryRequest).toBe(true)

    vi.stubGlobal('fetch', bundledFetch)
    await expect(initializeSpectralEngine()).resolves.toBeUndefined()
  })

  test('retains the complete instrument/configuration catalog and aliases', async () => {
    const payloads = await Promise.all([
      buildPanelPayload('aurora'),
      buildPanelPayload('discover'),
      buildPanelPayload('id7000'),
      buildPanelPayload('xenith'),
    ])
    expect(payloads.map((payload) => payload.configurations.length)).toEqual([4, 2, 3, 1])
    expect(payloads[0].libraries.map((library) => library.id)).toEqual([
      'aurora', 'discover', 'id7000', 'xenith', 'symphony', 'fortessa', 'celesta', 'attune_nxt', 'accuri_c6_plus', 'facscalibur',
      'canto', 'lyric', 'ze5', 'cytpix', 'quanteon', 'macsquant', 'facsverse', 'lsrii', 'cytoflex_lx', 'navios', 'dxflex', 'facsaria_fusion',
    ])
    expect(resolveCytometer('BD FACSDiscover')).toBe('discover')
    expect(resolveCytometer('Thermo Fisher Attune Xenith')).toBe('xenith')
    expect(resolveCytometer('BD LSRFortessa')).toBe('fortessa')
    expect(resolveCytometer('BD FACSCelesta')).toBe('celesta')
    expect(resolveCytometer('Thermo Fisher Attune NxT')).toBe('attune_nxt')
    expect(resolveCytometer('BD Accuri C6 Plus')).toBe('accuri_c6_plus')
    expect(resolveCytometer('BD FACSCalibur')).toBe('facscalibur')
    expect(resolveConfiguration('aurora', '4L UV')).toBe('4l_uv_v_b_r')
    expect(resolveConfiguration('id7000', 'ID7000 3 laser')).toBe('id7000_3l')
    expect(resolveConfiguration('fortessa', '4L')).toBe('fortessa_4l')
    expect(resolveConfiguration('fortessa', '3L')).toBe('fortessa_3l')
    expect(resolveConfiguration('fortessa', 'fortessa3l')).toBe('fortessa_3l')
    expect(resolveConfiguration('celesta', 'BVUV')).toBe('celesta_bvuv')
    expect(resolveConfiguration('attune_nxt', '4L')).toBe('attune_nxt_4l')
    expect(resolveConfiguration('accuri_c6_plus', 'standard')).toBe('accuri_c6_plus_standard')
    expect(resolveConfiguration('facscalibur', '2-laser 4-color')).toBe('facscalibur_2l_4')
    expect(resolveCytometer('BD FACSCanto II')).toBe('canto')
    expect(resolveCytometer('BD FACSLyric')).toBe('lyric')
    expect(resolveCytometer('Bio-Rad ZE5')).toBe('ze5')
    expect(resolveCytometer('Thermo Fisher Attune CytPix')).toBe('cytpix')
    expect(resolveCytometer('Agilent NovoCyte Quanteon')).toBe('quanteon')
    expect(resolveCytometer('Miltenyi MACSQuant Analyzer 16')).toBe('macsquant')
    expect(resolveCytometer('BD FACSVerse')).toBe('facsverse')
    expect(resolveCytometer('BD LSR II')).toBe('lsrii')
    expect(resolveCytometer('Beckman Coulter CytoFLEX LX')).toBe('cytoflex_lx')
    expect(resolveCytometer('Beckman Coulter Navios')).toBe('navios')
    expect(resolveCytometer('Beckman Coulter DxFLEX')).toBe('dxflex')
    expect(resolveCytometer('BD FACSAria Fusion')).toBe('facsaria_fusion')
    expect(resolveConfiguration('canto', '3-laser 4-2-2')).toBe('canto_3l_4_2_2')
    expect(resolveConfiguration('lyric', '12-color')).toBe('lyric_3l_12')
    expect(resolveConfiguration('lyric', '3L 10-color')).toBe('lyric_3l_10')
    expect(resolveConfiguration('ze5', '5-laser')).toBe('ze5_5l_27')
    expect(resolveConfiguration('ze5', '3L 17')).toBe('ze5_3l_17')
    expect(resolveConfiguration('cytpix', 'BYRV6')).toBe('cytpix_byrv6')
    expect(resolveConfiguration('quanteon', '4025')).toBe('quanteon_4025')
    expect(resolveConfiguration('macsquant', 'Analyzer 16')).toBe('macsquant_analyzer16')
    expect(resolveConfiguration('facsverse', '3-laser 8-color')).toBe('facsverse_3l_8')
    expect(resolveConfiguration('lsrii', '6B-6V-2UV-4R')).toBe('lsrii_6b_6v_2uv_4r')
    expect(resolveConfiguration('cytoflex_lx', 'U3-V5-B3-Y5-R3-I0')).toBe('cytoflex_lx_u3_v5_b3_y5_r3_i0')
    expect(resolveConfiguration('navios', '2-laser 8-color')).toBe('navios_2l_8')
    expect(resolveConfiguration('dxflex', 'B5-R3-V5')).toBe('dxflex_b5_r3_v5')
    expect(resolveConfiguration('facsaria_fusion', 'BUV optimized')).toBe('facsaria_fusion_buv')
    expect(resolveCytometer()).toBe('aurora')
    expect(resolveCytometer(null)).toBe('aurora')
    expect(() => resolveCytometer('not an instrument')).toThrow('Panel builder supports')
    expect(resolvePersistedCytometer('BD FACSDiscover')).toBe('discover')
    expect(resolvePersistedConfiguration('fortessa', '4L')).toBe('fortessa_4l')
    expect(() => resolvePersistedCytometer('not an instrument')).toThrow(/Unsupported persisted cytometer/)
    expect(() => resolvePersistedConfiguration('aurora', 'unknown')).toThrow(/Unsupported persisted configuration/)
    expect(() => resolvePersistedConfiguration('aurora', 'fortessa_4l')).toThrow(/Unsupported persisted configuration/)
    const aliases: Array<[string, string, string]> = [
      ['fortessa', '3L', 'fortessa_3l'], ['attune_nxt', '4laser', 'attune_nxt_4l'],
      ['celesta', 'BVR', 'celesta_bvr'],
      ['accuri_c6_plus', '3blue1red', 'accuri_c6_plus_standard'],
      ['accuri_c6_plus', '3b1r', 'accuri_c6_plus_standard'],
      ['accuri_c6_plus', '4color', 'accuri_c6_plus_standard'],
      ['accuri_c6_plus', '4colour', 'accuri_c6_plus_standard'],
      ['facscalibur', '2l4', 'facscalibur_2l_4'],
      ['facscalibur', '4color', 'facscalibur_2l_4'],
      ['facscalibur', '4colour', 'facscalibur_2l_4'],
      ['lyric', '2L 4-color', 'lyric_2l_4'], ['lyric', '2L 6-color', 'lyric_2l_6'],
      ['lyric', '3L 8-color', 'lyric_3l_8'], ['lyric', '3L 10-color', 'lyric_3l_10'],
      ['ze5', '3L 17 option 2', 'ze5_3l_17_option2'], ['ze5', '3L 20', 'ze5_3l_20'],
      ['ze5', '4L 24', 'ze5_4l_24'], ['facsverse', '1-laser 4-color', 'facsverse_1l_4'],
      ['facsverse', '2-laser 6-color', 'facsverse_2l_6'], ['facsverse', '4-2-2', 'facsverse_3l_8'],
      ['facsverse', '422', 'facsverse_3l_8'], ['lsrii', '6B-2V-0UV-3R', 'lsrii_6b_2v_0uv_3r'],
      ['lsrii', '6B-0V-2UV-3R', 'lsrii_6b_0v_2uv_3r'], ['cytoflex_lx', '5L19', 'cytoflex_lx_u3_v5_b3_y5_r3_i0'],
      ['navios', '8-color', 'navios_2l_8'], ['dxflex', '13-color', 'dxflex_b5_r3_v5'],
      ['facsaria_fusion', 'BUV optimized facility configuration', 'facsaria_fusion_buv'],
      ['cytoflex_lx', '5L19', 'cytoflex_lx_u3_v5_b3_y5_r3_i0'],
      ['navios', '8-color', 'navios_2l_8'], ['navios', '2L8', 'navios_2l_8'],
    ]
    for (const [id, alias, expected] of aliases) expect(resolveConfiguration(id, alias)).toBe(expected)
    expect(resolveConfiguration('aurora', 'unknown')).toBe('5l_uv_v_b_yg_r')
  })

  test('validates every declared configuration has a complete detector mapping', async () => {
    const libraries = getSpectralPanelLibraries()

    for (const library of libraries) {
      const configurations = getSpectralPanelConfigurations(library.id)
      expect(configurations.length).toBeGreaterThan(0)

      for (const configuration of configurations) {
        const expectedCount = declaredDetectorCount(configuration.description)
        const payload = await buildPanelPayload(library.id, configuration.id)

        if (configuration.id === 'full') {
          expect(expectedCount).toBeNull()
        } else {
          expect(expectedCount).not.toBeNull()
          expect(payload.detectors).toHaveLength(expectedCount as number)
        }
        expect(payload.detectors.length).toBeGreaterThan(0)
        expect(payload.max_panel_size).toBe(payload.detectors.length)
        expect(new Set(payload.detectors.map((detector) => detector.detector)).size)
          .toBe(payload.detectors.length)
        expect(payload.measurement_mode).toBe(library.measurement_mode)
        expect(payload.fluorophores.length).toBeGreaterThan(0)

        if (library.measurement_mode === 'conventional') {
          expect(payload.detectors.some((detector) => /ssc/i.test(`${detector.detector} ${detector.label}`)))
            .toBe(false)
        }

        const sampleFluorophore = payload.fluorophores[0].fluorophore
        const sampledPayload = await buildPanelPayload(library.id, configuration.id, [sampleFluorophore])
        expect(sampledPayload.selected).toEqual([sampleFluorophore])
        expect(sampledPayload.spectra).toHaveLength(1)
        expect(sampledPayload.peak_detectors[0]).toBeTruthy()
        expect(sampledPayload.detectors.every((detector) => (
          typeof sampledPayload.spectra[0][detector.detector] === 'number'
        ))).toBe(true)
      }
    }
  })

  test('uses detector count as the physical panel-size ceiling', async () => {
    const aurora = await buildPanelPayload('aurora', '5l_uv_v_b_yg_r')
    const xenith = await buildPanelPayload('xenith', 'full')

    expect(aurora.max_panel_size).toBe(64)
    expect(xenith.max_panel_size).toBe(51)
    expect(aurora.fluorophores.length).toBeGreaterThan(aurora.max_panel_size)
    expect(xenith.fluorophores.length).toBeGreaterThan(xenith.max_panel_size)
  })

  test('loads the conventional FACSymphony response matrix', async () => {
    const payload = await buildPanelPayload('symphony', 'symphony_a5se', ['BUV395', 'PE'])

    expect(payload.measurement_mode).toBe('conventional')
    expect(payload.max_panel_size).toBe(48)
    expect(payload.detectors).toHaveLength(48)
    expect(payload.fluorophores).toHaveLength(24)
    expect(payload.selected).toEqual(['BUV395', 'PE'])
    expect(payload.peak_detectors).toEqual(['UV379-A', 'B576-A'])
  })

  test('loads the conventional Fortessa 3L and 4L detector configurations', async () => {
    const threeLaser = await buildPanelPayload('fortessa', 'fortessa_3l', ['FITC', 'PE', 'APC'])
    const fourLaser = await buildPanelPayload('BD LSRFortessa', '4L', ['FITC', 'PE', 'APC'])

    expect(threeLaser.measurement_mode).toBe('conventional')
    expect(threeLaser.max_panel_size).toBe(14)
    expect(threeLaser.detectors).toHaveLength(14)
    expect(threeLaser.detectors.some((detector) => detector.detector.startsWith('488/10'))).toBe(false)
    expect(threeLaser.peak_detectors).toEqual(['525/50-B-A', '575/26-B-A', '670/30-R-A'])

    expect(fourLaser.configuration).toBe('fortessa_4l')
    expect(fourLaser.max_panel_size).toBe(16)
    expect(fourLaser.detectors).toHaveLength(16)
    expect(fourLaser.peak_detectors).toEqual(['529/24-B-A', '582/15-YG-A', '670/30-R-A'])
  })

  test('maps public-data conventional fluorophore estimates on compatible detectors', async () => {
    const dyes = ['Super Bright 600', 'Super Bright 645', 'Super Bright 702', 'Zombie Aqua', 'BV785']
    const fortessa = await buildPanelPayload('fortessa', 'fortessa_3l', dyes)
    const fortessaFourLaser = await buildPanelPayload('fortessa', 'fortessa_4l', dyes)
    const celesta = await buildPanelPayload('celesta', 'BV', dyes)
    const navios = await buildPanelPayload('navios', '2-laser 8-color', dyes)

    for (const payload of [fortessa, fortessaFourLaser, celesta]) {
      expect(payload.selected).toEqual(dyes)
      expect(payload.fluorophores.filter((item) => dyes.includes(item.fluorophore))).toHaveLength(dyes.length)
      expect(payload.fluorophores.filter((item) => dyes.includes(item.fluorophore)).every((item) => (
        item.mapping_confidence === 'estimated'
        && item.mapping_source?.startsWith('https://')
        && item.mapping_note
      ))).toBe(true)
      expect(payload.peak_detectors.every((detector) => detector.includes('-V-A'))).toBe(true)
    }
    expect(navios.selected).toEqual([])
  })

  test('loads public FACSCelesta conventional filter configurations', async () => {
    const bv = await buildPanelPayload('celesta', 'BV', ['BV421', 'PE'])
    const bvr = await buildPanelPayload('celesta', 'BVR', ['BV421', 'APC'])
    const bvuv = await buildPanelPayload('celesta', 'BVUV', ['BUV395', 'PE'])
    const bvyg = await buildPanelPayload('celesta', 'BVYG', ['PE', 'PE-Cy7'])

    expect(bv.measurement_mode).toBe('conventional')
    expect(bv.max_panel_size).toBe(10)
    expect(bv.detectors).toHaveLength(10)
    expect(bv.peak_detectors).toEqual(['450/40-V-A', '575/25-B-A'])

    expect(bvr.max_panel_size).toBe(12)
    expect(bvr.detectors).toHaveLength(12)
    expect(bvr.peak_detectors).toEqual(['450/40-V-A', '670/30-R-A'])

    expect(bvuv.max_panel_size).toBe(12)
    expect(bvuv.detectors).toHaveLength(12)
    expect(bvuv.peak_detectors).toEqual(['379/28-UV-A', '575/25-B-A'])

    expect(bvyg.max_panel_size).toBe(12)
    expect(bvyg.detectors).toHaveLength(12)
    expect(bvyg.peak_detectors).toEqual(['586/15-YG-A', '780/60-YG-A'])
  })

  test('loads the documented 4-laser Attune NxT conventional configuration', async () => {
    const payload = await buildPanelPayload('Thermo Fisher Attune NxT', '4L', ['FITC', 'PE', 'APC'])

    expect(payload.measurement_mode).toBe('conventional')
    expect(payload.configuration).toBe('attune_nxt_4l')
    expect(payload.max_panel_size).toBe(14)
    expect(payload.detectors).toHaveLength(14)
    expect(payload.peak_detectors).toEqual(['530/30-B-A', '585/16-Y-A', '670/14-R-A'])
  })

  test('loads complete BD FACSCanto II and FACSLyric conventional configurations', async () => {
    const canto = await buildPanelPayload('canto', '2L 4-2', ['FITC', 'PE', 'APC'])
    const cantoThreeLaser = await buildPanelPayload('BD FACSCanto II', '3L 4-2-2', ['BV421', 'APC'])
    const lyric = await buildPanelPayload('lyric', '3L 12-color', ['BV421', 'PE-Cy7', 'APC-R700'])

    expect(canto.max_panel_size).toBe(6)
    expect(canto.detectors).toHaveLength(6)
    expect(canto.peak_detectors).toEqual([
      'canto_2l_4_2_530/30-B-A',
      'canto_2l_4_2_585/42-B-A',
      'canto_2l_4_2_660/20-R-A',
    ])
    expect(cantoThreeLaser.max_panel_size).toBe(8)
    expect(cantoThreeLaser.detectors).toHaveLength(8)
    expect(lyric.max_panel_size).toBe(12)
    expect(lyric.detectors).toHaveLength(12)
    expect(lyric.peak_detectors).toEqual([
      'lyric_3l_12_448/45-V-A',
      'lyric_3l_12_783/56-B-A',
      'lyric_3l_12_720/30-R-A',
    ])
  })

  test('loads complete Bio-Rad ZE5 detector configurations and long-pass filters', async () => {
    const threeLaser = await buildPanelPayload('ze5', '3L 17', ['BV421', 'FITC', 'APC'])
    const fiveLaser = await buildPanelPayload('Bio-Rad ZE5', '5L 27', ['BUV395', 'PE', 'APC'])

    expect(threeLaser.max_panel_size).toBe(17)
    expect(threeLaser.detectors).toHaveLength(17)
    expect(fiveLaser.max_panel_size).toBe(27)
    expect(fiveLaser.detectors).toHaveLength(27)
    expect(fiveLaser.detectors.some((detector) => detector.label === '700 LP')).toBe(true)
    expect(fiveLaser.peak_detectors).toHaveLength(3)
  })

  test('loads the nine CytPix defaults whose manual counts match their channels', async () => {
    const expectedCounts: Record<string, number> = {
      cytpix_byxx: 7,
      cytpix_brxx: 7,
      cytpix_bv4xx: 7,
      cytpix_bv6xx: 9,
      cytpix_byrx: 11,
      cytpix_byv4x: 11,
      cytpix_brv6x: 12,
      cytpix_byrv6: 14,
      cytpix_byrv4: 14,
    }

    for (const [configuration, detectorCount] of Object.entries(expectedCounts)) {
      const payload = await buildPanelPayload('cytpix', configuration, ['FITC', 'PE', 'APC'])
      expect(payload.measurement_mode).toBe('conventional')
      expect(payload.max_panel_size).toBe(detectorCount)
      expect(payload.detectors).toHaveLength(detectorCount)
    }
  })

  test('loads the public Quanteon 4025 and MACSQuant conventional configurations', async () => {
    const quanteon = await buildPanelPayload('quanteon', '4025', ['BV421', 'FITC', 'PE', 'APC'])
    const analyzer10 = await buildPanelPayload('macsquant', 'Analyzer 10', ['BV421', 'FITC', 'APC'])
    const analyzer16 = await buildPanelPayload('Miltenyi MACSQuant Analyzer 16', 'Analyzer 16', ['BV421', 'FITC', 'APC'])
    const vyb = await buildPanelPayload('MACSQuant', 'VYB', ['BV421', 'FITC', 'PE'])

    expect(quanteon.max_panel_size).toBe(25)
    expect(quanteon.detectors).toHaveLength(25)
    expect(analyzer10.max_panel_size).toBe(8)
    expect(analyzer10.detectors).toHaveLength(8)
    expect(analyzer16.max_panel_size).toBe(14)
    expect(analyzer16.detectors).toHaveLength(14)
    expect(vyb.max_panel_size).toBe(8)
    expect(vyb.detectors).toHaveLength(8)
    expect(analyzer10.detectors.some((detector) => detector.label === '655-730')).toBe(true)
    expect(analyzer10.detectors.some((detector) => detector.label === '750 LP')).toBe(true)
  })

  test('loads complete BD FACSVerse, LSR II, and CytoFLEX LX fixed layouts', async () => {
    const verse = await buildPanelPayload('facsverse', '3-laser 8-color', ['FITC', 'PE', 'APC'])
    const lsrii = await buildPanelPayload('lsrii', '6B-6V-2UV-4R', ['FITC', 'PE', 'APC'])
    const cytoflex = await buildPanelPayload('Beckman Coulter CytoFLEX LX', 'U3-V5-B3-Y5-R3-I0', ['FITC', 'PE', 'APC'])
    const navios = await buildPanelPayload('Beckman Coulter Navios', '2-laser 8-color', ['FITC', 'PE', 'APC'])
    const accuri = await buildPanelPayload('BD Accuri C6 Plus', 'standard', ['FITC', 'PE', 'APC'])
    const calibur = await buildPanelPayload('BD FACSCalibur', '2-laser 4-color', ['FITC', 'PE', 'APC'])
    const dxflex = await buildPanelPayload('Beckman Coulter DxFLEX', 'B5-R3-V5', ['BV421', 'FITC', 'APC'])
    const facsaria = await buildPanelPayload('BD FACSAria Fusion', 'BUV optimized', ['FITC', 'PE', 'APC'])

    expect(verse.measurement_mode).toBe('conventional')
    expect(verse.max_panel_size).toBe(8)
    expect(verse.detectors).toHaveLength(8)
    expect(lsrii.max_panel_size).toBe(18)
    expect(lsrii.detectors).toHaveLength(18)
    expect(lsrii.detectors.some((detector) => detector.label === '685/35')).toBe(true)
    expect(cytoflex.max_panel_size).toBe(19)
    expect(cytoflex.detectors).toHaveLength(19)
    expect(cytoflex.detectors.some((detector) => detector.label === '763/43')).toBe(true)
    expect(navios.max_panel_size).toBe(8)
    expect(navios.detectors).toHaveLength(8)
    expect(navios.detectors.some((detector) => detector.label === '755 LP')).toBe(true)
    expect(accuri.max_panel_size).toBe(4)
    expect(accuri.detectors).toHaveLength(4)
    expect(accuri.detectors.some((detector) => detector.label === '670 LP')).toBe(true)
    expect(calibur.max_panel_size).toBe(4)
    expect(calibur.detectors).toHaveLength(4)
    expect(calibur.detectors.some((detector) => detector.label === '661/16')).toBe(true)
    expect(dxflex.max_panel_size).toBe(13)
    expect(dxflex.detectors).toHaveLength(13)
    expect(dxflex.detectors.some((detector) => detector.label === '780/60')).toBe(true)
    expect(facsaria.max_panel_size).toBe(18)
    expect(facsaria.detectors).toHaveLength(18)
    expect(facsaria.detectors.some((detector) => detector.label === '800/50')).toBe(true)
  })

  test('loads only the active cytometer library and reuses identical panel calculations', async () => {
    const bundledFetch = globalThis.fetch
    const requestedFiles: string[] = []
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const source = input instanceof Request ? input.url : String(input)
      requestedFiles.push(new URL(source).pathname.split('/').at(-1) ?? '')
      return bundledFetch(input)
    })

    const first = await buildPanelPayload('aurora', '5l_uv_v_b_yg_r', ['PE', 'APC'])
    const requestCount = requestedFiles.length
    const second = await buildPanelPayload('aurora', '5l_uv_v_b_yg_r', ['PE', 'APC'])

    expect(second).toBe(first)
    expect(requestedFiles).toContain('aurora_spectra.csv')
    expect(requestedFiles).not.toContain('discover_spectra.csv')
    expect(requestedFiles).not.toContain('id7000_spectra.csv')
    expect(requestedFiles).not.toContain('xenith_spectra.csv')
    expect(requestedFiles).toHaveLength(requestCount)
  })

  test('matches cosine and condition-number edge behavior', () => {
    expect(calculateSimilarityMatrix([[0.2, 1], [1, 0.1]])).toEqual([
      [1, expect.any(Number)],
      [expect.any(Number), 1],
    ])
    expect(calculateSimilarityMatrix([[0, 0], [1, 0]])[0][0]).toBe(0)
    expect(calculatePanelComplexity([[0.2, 1]])).toBe(1)
    expect(calculatePanelComplexity([[0, 0], [0, 0]])).toBeNull()
    expect(calculatePanelComplexity([[0.2, 1], [1, 0.1]])).toBe(1.35)
    expect(calculatePanelComplexity([[Number.MAX_VALUE, 0], [0, Number.MIN_VALUE]])).toBeNull()
    expect(calculatePanelComplexity([[1, 0], [1, 0]])).toBeNull()
    expect(calculatePanelComplexity([[1, 2], [2, 4]])).toBeNull()
    expect(calculatePanelComplexity([[1, 0, 0], [0, 1, 0]])).toBe(1)
    expect(calculatePanelComplexity([[1, 0], [0, 1], [1, 1]])).toBeNull()
    expect(calculatePanelComplexity([[1, 0], [1, Number.EPSILON]])).toBeNull()
    expect(calculatePanelComplexity([[1, 0], [1, 1e-12]])).toBeGreaterThan(1)
    expect(calculatePanelComplexity([[1, Number.NaN]])).toBeNull()
  })

  test('parses quoted bundled CSV syntax without changing values', () => {
    expect(parseCsv('"fluorophore","B1-A"\r\n"A ""quoted"" dye",1e-3\r\n')).toEqual([
      ['fluorophore', 'B1-A'],
      ['A "quoted" dye', '1e-3'],
    ])
    expect(parseCsv('\n')).toEqual([])
    expect(normalizeDetectorToken(undefined)).toBe('')
    expect(detectorKeys('')).toEqual([])
  })

  test('retries dictionary initialization after a transient bundled-data failure', async () => {
    const bundledFetch = globalThis.fetch
    let failed = false
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const source = input instanceof Request ? input.url : String(input)
      if (!failed && source.endsWith('/cytometer_dictionary.csv')) {
        failed = true
        return new Response('Unavailable', { status: 503 })
      }
      return bundledFetch(input)
    })
    await expect(initializeSpectralEngine()).rejects.toThrow('cytometer_dictionary.csv')
    await expect(initializeSpectralEngine()).resolves.toBeUndefined()
    expect(failed).toBe(true)
  })

  test('does not let a stale initializer clear a newer retry', async () => {
    const bundledFetch = globalThis.fetch
    let dictionaryRequests = 0
    let rejectFirstDictionary: ((reason?: unknown) => void) | undefined
    const firstDictionary = new Promise<Response>((_resolve, reject) => {
      rejectFirstDictionary = reject
    })
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const source = input instanceof Request ? input.url : String(input)
      if (source.endsWith('/cytometer_dictionary.csv')) {
        dictionaryRequests += 1
        if (dictionaryRequests === 1) return firstDictionary
      }
      return bundledFetch(input)
    })

    const stale = initializeSpectralEngine()
    expect(dictionaryRequests).toBe(1)
    resetSpectralEngineForTests()
    await expect(initializeSpectralEngine()).resolves.toBeUndefined()
    rejectFirstDictionary?.(new Error('stale dictionary failure'))
    await expect(stale).rejects.toThrow('stale dictionary failure')

    const requestsAfterRetry = dictionaryRequests
    await expect(initializeSpectralEngine()).resolves.toBeUndefined()
    expect(dictionaryRequests).toBe(requestsAfterRetry)
  })
})
