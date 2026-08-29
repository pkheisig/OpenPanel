import { beforeEach, describe, expect, test, vi } from 'vitest'
import { buildPanelPayload } from '../src/spectralEngine'
import {
  antigenDensityScore,
  coexpressionKey,
  fluorophoreBrightnessLevel,
  fluorophoreAvailability,
  generateWizardResults,
  isFluorescentProtein,
  isViabilityDye,
  isViabilityMarkerName,
  isWizardFluorophoreAllowed,
  markerFluorophoreBrightnessScore,
  recommendationScore,
} from '../src/panelWizardEngine'
import { loadPanelWizardReferences } from '../src/panelWizardReferences'
import {
  FLOW_OMIP_IMPORT_MANIFEST,
  inferOmipCellTypes,
  flowOmipTemplateRowsForNumber,
  markerOptionsForPanel,
  OMIP_CATALOG,
  omipTemplateAssignmentsForPanel,
  omipTemplateAssignmentsForPanelBestEffort,
  validateOmipFlowTemplateImport,
  validateOmipFlowTemplateImportData,
} from '../src/panelWizardKnowledge'
import type { CoexpressionLevel, WizardMarker } from '../src/panelWizardEngine'
import { mockBundledData } from './helpers'
import { resetPanelWizardReferencesForTests } from '../src/panelWizardReferences'

beforeEach(mockBundledData)

describe('panel wizard recommendation engine', () => {
  test('falls back cleanly when reference files are unavailable or malformed', async () => {
    resetPanelWizardReferencesForTests()
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const source = String(input)
      if (source.includes('brightness')) {
        return new Response('cytometer,configuration,fluorophore,brightness_score,source\n*,*,FITC,3,test\n', { status: 200 })
      }
      if (source.includes('antigen_density')) return new Response('unavailable', { status: 404 })
      throw new Error('network down')
    })
    const references = await loadPanelWizardReferences('aurora', 'config')
    expect(references.brightnessByFluorophore).toEqual({ fitc: 3 })
    expect(references.antigenDensityByContext).toEqual({})
    expect(references.markerOptions.length).toBeGreaterThan(0)
    vi.unstubAllGlobals()
  })

  test('filters reference rows by cytometer and configuration', async () => {
    resetPanelWizardReferencesForTests()
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const source = String(input)
      if (source.includes('brightness')) {
        return new Response(
          'cytometer,configuration,fluorophore,brightness_score,source\n'
          + 'other,*,FITC,1,test\n'
          + 'aurora,other,PE,3,test\n'
          + '*,5l_uv_v_b_yg_r,APC,3,test\n'
          + '*,*,BV421,4,test\n',
          { status: 200 },
        )
      }
      if (source.includes('antigen_density')) return new Response(
        'cell_type,antigen,molecules_per_cell,source\nT cells,CD3,100,test\nB cells,CD19,50,test',
        { status: 200 },
      )
      return new Response('marker,aliases\nCD3,T-cell\nCD4,', { status: 200 })
    })
    const references = await loadPanelWizardReferences('aurora', '5l_uv_v_b_yg_r')
    expect(references.brightnessByFluorophore).toEqual({ apc: 3, bv421: 4 })
    expect(references.antigenDensityByContext['tcells::cd3']).toBe(100)
    expect(references.antigenDensityByContext['bcells::cd19']).toBe(50)
    expect((await loadPanelWizardReferences('aurora', '5l_uv_v_b_yg_r')).markerOptions.length).toBeGreaterThan(0)
    vi.unstubAllGlobals()
  })

  test('builds reference URLs without a browser window', async () => {
    resetPanelWizardReferencesForTests()
    vi.stubGlobal('window', undefined)
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const source = String(input)
      if (source.includes('brightness')) return new Response('cytometer,configuration,fluorophore,brightness_score,source\n', { status: 200 })
      if (source.includes('antigen_density')) return new Response('cell_type,antigen,molecules_per_cell,source\n', { status: 200 })
      return new Response('marker,aliases\nCD3,T-cell', { status: 200 })
    })
    await expect(loadPanelWizardReferences('aurora', 'config')).resolves.toMatchObject({
      brightnessByFluorophore: {}, antigenDensityByContext: {},
    })
    vi.unstubAllGlobals()
  })

  test('fails closed when a reference row contains an invalid value', async () => {
    resetPanelWizardReferencesForTests()
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const source = String(input)
      if (source.includes('brightness')) {
        return new Response('cytometer,configuration,fluorophore,brightness_score,source\n*,*,FITC,not-a-number,test', { status: 200 })
      }
      if (source.includes('antigen_density')) {
        return new Response('cell_type,antigen,molecules_per_cell,source\nT cells,CD3,100,test', { status: 200 })
      }
      return new Response('marker,aliases\nCD3,T-cell', { status: 200 })
    })
    await expect(loadPanelWizardReferences('aurora', 'config')).rejects.toThrow('brightness_score')
    vi.unstubAllGlobals()
  })

  test('bundles every published flow OMIP as an editable template', () => {
    expect(flowOmipTemplateRowsForNumber(999, {})).toEqual([])
    expect(flowOmipTemplateRowsForNumber(1).length).toBeGreaterThan(0)
    expect(OMIP_CATALOG).toHaveLength(113)
    expect(new Set(OMIP_CATALOG.map((entry) => entry.id)).size).toBe(113)
    expect(OMIP_CATALOG[0]).toMatchObject({ name: 'OMIP-120', year: '2026' })
    expect(OMIP_CATALOG.at(-1)).toMatchObject({ name: 'OMIP-001', year: '2010' })
    expect(OMIP_CATALOG.every((entry) => ['spectral', 'conventional'].includes(entry.method))).toBe(true)
    expect(OMIP_CATALOG.some((entry) => entry.method === 'conventional')).toBe(true)
    expect(OMIP_CATALOG.some((entry) => entry.id === 'omip-121')).toBe(false)
    expect(OMIP_CATALOG.some((entry) => entry.id === 'omip-103')).toBe(false)
    expect(OMIP_CATALOG.filter((entry) => entry.template)).toHaveLength(113)
    expect(OMIP_CATALOG.filter((entry) => !entry.template)).toHaveLength(0)
    expect(OMIP_CATALOG.every((entry) => entry.cytometers.length > 0)).toBe(true)
    expect(OMIP_CATALOG.every((entry) => entry.template?.markers.length)).toBeTruthy()
    expect(OMIP_CATALOG.every((entry) => (
      entry.template?.markers.every((marker) => marker.name.trim())
    ))).toBe(true)
    expect(FLOW_OMIP_IMPORT_MANIFEST).toMatchObject({
      flowOmipCount: 113,
      markerRowCount: 2372,
    })
    expect(() => validateOmipFlowTemplateImport()).not.toThrow()
    expect(OMIP_CATALOG.find((entry) => entry.name === 'OMIP-051')?.template?.markers).toHaveLength(28)
    expect(OMIP_CATALOG.find((entry) => entry.name === 'OMIP-084')?.template?.markers).toHaveLength(28)
    expect(OMIP_CATALOG.find((entry) => entry.name === 'OMIP-091')?.template?.markers).toHaveLength(27)
    expect(OMIP_CATALOG.find((entry) => entry.name === 'OMIP-084')?.template?.tableSourceUrl).toBe(
      'https://onlinelibrary.wiley.com/doi/10.1002/cyto.a.24564',
    )
    expect(OMIP_CATALOG.find((entry) => entry.name === 'OMIP-091')?.template?.tableSourceUrl).toBe(
      'https://onlinelibrary.wiley.com/doi/10.1002/cyto.a.24738',
    )
    expect(OMIP_CATALOG.find((entry) => entry.name === 'OMIP-120')).toMatchObject({
      species: 'mouse',
      method: 'spectral',
      cytometers: ['Cytek Aurora 4L: UV/V/B/R'],
    })
    expect(OMIP_CATALOG.find((entry) => entry.name === 'OMIP-102')?.cytometers).toEqual([
      'Sony ID7000 7L',
      'BD FACSDiscover S8 (5L)',
    ])
    expect(OMIP_CATALOG.find((entry) => entry.name === 'OMIP-105')?.cytometers).toEqual([
      'BD FACSymphony A5 SE',
    ])
    expect(inferOmipCellTypes('T cells and dendritic cells')).toEqual([
      'T cells',
      'Dendritic cells',
    ])
    expect(OMIP_CATALOG.find((entry) => entry.name === 'OMIP-102')?.cellTypes).toEqual(
      expect.arrayContaining(['T cells', 'Dendritic cells']),
    )
  })

  test('reports each imported-flow integrity failure with actionable diagnostics', () => {
    const valid = {
      flowRecords: [[1, 'pmid', '2020', 'title']] as const,
      importedMarkerRowCount: 1,
      flowNumberCount: 1,
      rowsByNumber: { 1: [['CD3', 'FITC']] },
      sourceUrlsByNumber: { 1: 'https://example.test/table' },
      cytometersByNumber: { 1: ['Aurora'] },
      templatesById: new Map([['omip-001', { tableSourceUrl: 'https://example.test/table', allowDuplicateFluorophores: true }]]),
      manifest: { flowOmipCount: 1, markerRowCount: 1 },
    }
    expect(() => validateOmipFlowTemplateImportData(valid)).not.toThrow()
    expect(() => validateOmipFlowTemplateImportData({ ...valid, flowRecords: [] })).toThrow('record count')
    expect(() => validateOmipFlowTemplateImportData({ ...valid, flowNumberCount: 0 })).toThrow('template count')
    expect(() => validateOmipFlowTemplateImportData({ ...valid, importedMarkerRowCount: 0 })).toThrow('marker row count')
    const incomplete = (change: Partial<typeof valid>) => expect(() => validateOmipFlowTemplateImportData({ ...valid, ...change })).toThrow('Incomplete')
    incomplete({ rowsByNumber: { 1: [] } })
    incomplete({ rowsByNumber: { 1: [['', 'FITC']] } })
    incomplete({ sourceUrlsByNumber: {} })
    incomplete({ cytometersByNumber: { 1: [] } })
    incomplete({ templatesById: new Map([['omip-001', { allowDuplicateFluorophores: true }]]) })
    incomplete({ templatesById: new Map([['omip-001', { tableSourceUrl: 'https://example.test/table' }]]) })
  })

  test('matches OMIP templates to the active cytometer configuration', async () => {
    const auroraFiveLaser = await buildPanelPayload('aurora', '5l_uv_v_b_yg_r')
    const auroraColors = auroraFiveLaser.fluorophores.map((item) => item.fluorophore)
    const compatibleNames = OMIP_CATALOG.filter((entry) => (
      entry.template
      && omipTemplateAssignmentsForPanel(entry.template, auroraColors, auroraFiveLaser.detectors.length)
    )).map((entry) => entry.name)

    expect(compatibleNames).toContain('OMIP-097')
    expect(compatibleNames).toContain('OMIP-111')
    const omip97 = OMIP_CATALOG.find((entry) => entry.name === 'OMIP-097')?.template
    expect(omip97).toBeDefined()
    expect(omipTemplateAssignmentsForPanel(omip97!, auroraColors)?.[0]).toEqual({
      marker: 'Platelet GPVI',
      fluorophore: 'BV711',
    })
    expect(omipTemplateAssignmentsForPanel({
      ...omip97!,
      allowDuplicateFluorophores: false,
      markers: [
        { name: 'Marker A', fluorophore: 'BV711' },
        { name: 'Marker B', fluorophore: 'BV711' },
      ],
    }, auroraColors)).toBeNull()
    expect(omipTemplateAssignmentsForPanelBestEffort({
      ...omip97!,
      allowDuplicateFluorophores: false,
      markers: [
        { name: 'Marker A', fluorophore: 'BV711' },
        { name: 'Marker B', fluorophore: 'Unsupported dye' },
      ],
    }, auroraColors)).toEqual([
      { marker: 'Marker A', fluorophore: 'BV711' },
      { marker: 'Marker B', fluorophore: '' },
    ])
  })

  test('distinguishes common dyes from estimated limited dyes', () => {
    expect(fluorophoreAvailability('FITC')).toMatchObject({
      score: 100,
      tier: 'Very common',
      confidence: 'Curated',
    })
    expect(fluorophoreAvailability('mFluor Vio610').score).toBeLessThan(
      fluorophoreAvailability('FITC').score,
    )
    expect(recommendationScore(80, 88, null)).toBeGreaterThan(
      recommendationScore(100, 38, null),
    )
  })

  test('restricts wizard colors to antibody dyes and marker-appropriate viability dyes', () => {
    expect(isFluorescentProtein('EGFP')).toBe(true)
    expect(isFluorescentProtein('mCherry')).toBe(true)
    expect(isFluorescentProtein('mFluor Vio610')).toBe(false)
    expect(isViabilityMarkerName('Live/Dead')).toBe(true)
    expect(isViabilityMarkerName('Viability')).toBe(true)
    expect(isViabilityMarkerName('Via')).toBe(true)
    expect(isViabilityMarkerName('CD3')).toBe(false)
    expect(isViabilityMarkerName('Liver cells')).toBe(false)
    expect(isViabilityDye('Zombie NIR')).toBe(true)
    expect(isWizardFluorophoreAllowed('EGFP', 'CD3')).toBe(false)
    expect(isWizardFluorophoreAllowed('CellTrace Violet', 'CD3')).toBe(false)
    expect(isWizardFluorophoreAllowed('Zombie NIR', 'CD3')).toBe(false)
    expect(isWizardFluorophoreAllowed('Zombie NIR', 'Viability')).toBe(true)
    expect(isWizardFluorophoreAllowed('FITC', 'CD3')).toBe(true)
    expect(isWizardFluorophoreAllowed('FITC', 'Viability')).toBe(false)
    expect(isWizardFluorophoreAllowed('PE', 'Live/Dead')).toBe(false)
  })

  test('completes the requested panel while preserving locked colors', async () => {
    const catalog = await buildPanelPayload('aurora', '5l_uv_v_b_yg_r')
    const payload = await buildPanelPayload(
      'aurora',
      '5l_uv_v_b_yg_r',
      catalog.fluorophores.map((item) => item.fluorophore),
    )
    const markers: WizardMarker[] = Array.from({ length: 6 }, (_, index) => ({
      id: `marker-${index}`,
      slotIndex: index,
      name: `Marker ${index + 1}`,
      antigenDensity: index < 2 ? 'low' : index < 4 ? 'medium' : 'high',
      currentFluorophore: index === 0 ? 'FITC' : index === 1 ? 'PE' : '',
    }))
    const coexpression: Record<string, CoexpressionLevel> = {
      [coexpressionKey('marker-2', 'marker-3')]: 2,
      [coexpressionKey('marker-4', 'marker-5')]: 0,
    }

    const results = generateWizardResults(payload, markers, coexpression, 6)

    expect(results.recommended.rows).toHaveLength(6)
    expect(results.bestFit.rows).toHaveLength(6)
    expect(results.recommended.rows.slice(0, 2).map((row) => row.fluorophore)).toEqual(['FITC', 'PE'])
    expect(results.recommended.rows.slice(0, 2).every((row) => row.isExisting)).toBe(true)
    const proposedRows = results.recommended.rows.filter((row) => !row.isExisting)
    expect(new Set(proposedRows.map((row) => row.fluorophore)).size).toBe(4)
    expect(proposedRows.map((row) => row.fluorophore)).not.toContain('FITC')
    expect(proposedRows.map((row) => row.fluorophore)).not.toContain('PE')
    expect(results.recommended.rows.every((row) => (
      isWizardFluorophoreAllowed(row.fluorophore, row.markerName)
    ))).toBe(true)
    expect(proposedRows.map((row) => row.markerName).sort()).toEqual([
      'Marker 3',
      'Marker 4',
      'Marker 5',
      'Marker 6',
    ])
    expect(results.recommended.complexity).toBeLessThanOrEqual(
      Math.max(
        results.bestFit.complexity + 0.35,
        results.bestFit.complexity * 1.25,
      ) + 1e-8,
    )
    expect(results.recommended.maxSimilarity).toBeLessThanOrEqual(
      Math.min(
        0.9,
        Math.max(
          results.bestFit.maxSimilarity + 0.15,
          results.bestFit.maxSimilarity * 1.5,
        ),
      ) + 1e-8,
    )
    expect(results.recommended.averageAvailability).toBeGreaterThanOrEqual(
      results.bestFit.averageAvailability,
    )
    expect(results.recommended.alternatives.length).toBeGreaterThan(20)
  })

  test('only assigns viability dyes to viability markers and never recommends proteins', async () => {
    const catalog = await buildPanelPayload('aurora', '5l_uv_v_b_yg_r')
    const payload = await buildPanelPayload(
      'aurora',
      '5l_uv_v_b_yg_r',
      catalog.fluorophores.map((item) => item.fluorophore),
    )
    const markers: WizardMarker[] = [
      {
        id: 'antibody',
        slotIndex: 0,
        name: 'CD3',
        antigenDensity: 'high',
        currentFluorophore: '',
      },
      {
        id: 'viability',
        slotIndex: 1,
        name: 'Live/Dead',
        antigenDensity: 'low',
        currentFluorophore: '',
      },
    ]

    const results = generateWizardResults(payload, markers, {}, 2)
    for (const result of [results.recommended, results.bestFit]) {
      expect(result.rows.some((row) => isFluorescentProtein(row.fluorophore))).toBe(false)
      expect(result.rows
        .filter((row) => isViabilityDye(row.fluorophore))
        .every((row) => row.markerName === 'Live/Dead')).toBe(true)
      expect(result.rows
        .filter((row) => row.markerName === 'Live/Dead')
        .every((row) => isViabilityDye(row.fluorophore))).toBe(true)
      expect(result.alternatives.some((row) => isFluorescentProtein(row.fluorophore))).toBe(false)
    }

    const invalidExistingColor = generateWizardResults(payload, [{
      id: 'invalid-live-color',
      slotIndex: 0,
      name: 'Viability',
      antigenDensity: 'medium',
      currentFluorophore: 'FITC',
    }], {}, 1)
    expect(invalidExistingColor.recommended.rows[0].fluorophore).not.toBe('FITC')
    expect(isViabilityDye(invalidExistingColor.recommended.rows[0].fluorophore)).toBe(true)
    expect(invalidExistingColor.recommended.rows[0].isExisting).toBe(false)
  })

  test('uses explicit antigen density with bundled fluorophore brightness', async () => {
    const references = await loadPanelWizardReferences('aurora', '5l_uv_v_b_yg_r')
    expect(fluorophoreBrightnessLevel('BUV395', references)).toBe(3)
    expect(fluorophoreBrightnessLevel('BUV805', references)).toBe(1)
    expect(fluorophoreBrightnessLevel('FITC', references)).toBe(3)
    expect(fluorophoreBrightnessLevel('PE', references)).toBe(5)
    expect(fluorophoreBrightnessLevel('Unknown fluorophore', references)).toBeNull()
    const lowDensityMarker: WizardMarker = {
      id: 'cd40',
      slotIndex: 0,
      name: 'CD40',
      antigenDensity: 'low',
      currentFluorophore: '',
    }
    expect(markerFluorophoreBrightnessScore(lowDensityMarker, 'PE', references)).toBe(100)
    expect(markerFluorophoreBrightnessScore(lowDensityMarker, 'FITC', references)).toBe(12)
    expect(markerFluorophoreBrightnessScore({ ...lowDensityMarker, antigenDensity: 'medium' }, 'FITC', references)).toBe(100)
    expect(markerFluorophoreBrightnessScore(lowDensityMarker, 'PE')).toBeNull()
    expect(markerFluorophoreBrightnessScore(
      { ...lowDensityMarker, name: 'Unknown antigen' },
      'PE',
      references,
    )).toBe(100)
    expect(markerFluorophoreBrightnessScore(
      lowDensityMarker,
      'Unknown fluorophore',
      references,
    )).toBeNull()

    const payload = await buildPanelPayload(
      'aurora',
      '5l_uv_v_b_yg_r',
      ['FITC', 'PE'],
    )
    const results = generateWizardResults(payload, [lowDensityMarker], {}, 1, references)
    expect(results.bestFit.rows[0].fluorophore).toBe('PE')
    expect(results.bestFit.rows[0].brightnessLevel).toBe(5)
  })

  test('loads the expanded marker dictionary and aliases for autocomplete', async () => {
    const references = await loadPanelWizardReferences('aurora', '5l_uv_v_b_yg_r')
    expect(references.markerOptions.length).toBeGreaterThanOrEqual(878)
    expect(references.markerOptions.find((option) => option.value === 'TIM-4')).toBeDefined()
    expect(references.markerOptions.find((option) => option.value === 'CD49b')?.searchText).toContain('DX5')
    expect(references.markerOptions.find((option) => option.value === 'Live/Dead')?.searchText).toContain('Viability')

    const contextual = markerOptionsForPanel(
      'nk-cells',
      [],
      'human',
      references.markerOptions,
    )
    expect(contextual.findIndex((option) => option.value === 'CD56')).toBeLessThan(
      contextual.findIndex((option) => option.value === 'TIM-4'),
    )
  })

  test('keeps rare colors out of recommended panels when a complete practical pool exists', async () => {
    const catalog = await buildPanelPayload('aurora', '5l_uv_v_b_yg_r')
    const payload = await buildPanelPayload(
      'aurora',
      '5l_uv_v_b_yg_r',
      catalog.fluorophores.map((item) => item.fluorophore),
    )
    const markers: WizardMarker[] = Array.from({ length: 8 }, (_, index) => ({
      id: `marker-${index}`,
      slotIndex: index,
      name: `CD${index + 3}`,
      antigenDensity: 'medium',
      currentFluorophore: '',
    }))

    const results = generateWizardResults(payload, markers, {}, 8)
    expect(results.recommended.rows).toHaveLength(8)
    expect(results.recommended.rows.every((row) => row.availabilityTier !== 'Rare')).toBe(true)
    expect(results.recommended.rows.some((row) => /^Qdot\b/i.test(row.fluorophore))).toBe(false)
  })

  test('uses a symmetric co-expression key', () => {
    expect(coexpressionKey('CD3', 'CD4')).toBe(coexpressionKey('CD4', 'CD3'))
  })

  test('returns stable empty results when no candidates or spectra exist', () => {
    const emptyPayload = {
      cytometer: 'aurora', configuration: '5l_uv_v_b_yg_r', measurement_mode: 'spectral',
      libraries: [], configurations: [], detectors: [], fluorophores: [], selected: [], spectra: [],
      similarity: [], complexity_index: null, peak_detectors: [], max_panel_size: 18,
    } as never
    const results = generateWizardResults(emptyPayload, [], {}, 0)
    expect(results.recommended.rows).toEqual([])
    expect(results.recommended.alternatives).toEqual([])
    expect(results.recommended.averageAvailability).toBe(0)
    expect(results.bestFit.spectralRisk).toBe(1000)
  })

  test('prioritizes high-density markers when assigning spectrally clean colors', async () => {
    expect(antigenDensityScore('low')).toBeLessThan(antigenDensityScore('medium'))
    expect(antigenDensityScore('medium')).toBeLessThan(antigenDensityScore('high'))

    const catalog = await buildPanelPayload('aurora', '5l_uv_v_b_yg_r')
    const payload = await buildPanelPayload(
      'aurora',
      '5l_uv_v_b_yg_r',
      catalog.fluorophores.map((item) => item.fluorophore),
    )
    const markers: WizardMarker[] = [
      {
        id: 'low-marker',
        slotIndex: 0,
        name: 'Low density',
        antigenDensity: 'low',
        currentFluorophore: '',
      },
      {
        id: 'high-marker',
        slotIndex: 1,
        name: 'High density',
        antigenDensity: 'high',
        currentFluorophore: '',
      },
    ]

    const results = generateWizardResults(payload, markers, {}, 2)

    expect(results.recommended.rows.map((row) => row.markerName)).toEqual([
      'High density',
      'Low density',
    ])
  })
})
