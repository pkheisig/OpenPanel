import { describe, expect, test } from 'vitest'
import {
  PROJECT_FILE_KIND,
  PROJECT_FILE_VERSION,
  parseProject,
  serializeProject,
} from '../src/projectStore'
import type { ProjectState } from '../src/projectStore'
import { WIZARD_SCORING_VERSION } from '../src/panelWizardEngine'
import type { WizardProjectState } from '../src/panelWizardEngine'
import { responseMatrixProvenance } from '../src/panelBuilderShared'

const wizard: WizardProjectState = {
  desiredSize: 2,
  markers: [
    { id: 'marker-0', slotIndex: 0, name: 'CD3', antigenDensity: 'high', currentFluorophore: 'Alexa Fluor 488' },
    { id: 'marker-1', slotIndex: 1, name: 'CD19', antigenDensity: 'low', currentFluorophore: 'Alexa Fluor 647' },
  ],
  coexpression: { 'marker-0::marker-1': 2 },
  coexpressionVisited: true,
  coexpressionCompleted: true,
  activeTab: 'recommendations',
  results: {
    scoring_version: WIZARD_SCORING_VERSION,
    response_provenance: responseMatrixProvenance('measured_full_spectrum', { source: 'aurora_spectra.csv' }),
    recommended: {
      kind: 'recommended',
      rows: [],
      alternatives: [],
      complexity: 1.02,
      previousComplexity: 1,
      maxSimilarity: 0.01,
      spectralRisk: 2,
      averageAvailability: 88,
    },
    bestFit: {
      kind: 'best-fit',
      rows: [],
      alternatives: [],
      complexity: 1.01,
      previousComplexity: 1,
      maxSimilarity: 0.005,
      spectralRisk: 1,
      averageAvailability: 72,
    },
  },
  resultMode: 'bestFit',
  resultSort: 'availability',
}

const project: ProjectState = {
  cytometer: 'aurora',
  configuration: '5l_uv_v_b_yg_r',
  slots: ['Alexa Fluor 488', 'Alexa Fluor 647', ''],
  markers: { 0: 'CD3', 1: 'CD19' },
  tab: 'similarity',
  theme: 'dark',
  sidebarWidth: 276,
  sidebarCollapsed: false,
  plotScale: 90,
  plotScaleMode: 'fit-width',
  wizard,
  cytometerPanels: {
    aurora: {
      configuration: '5l_uv_v_b_yg_r',
      slots: ['Alexa Fluor 488', 'Alexa Fluor 647', ''],
      markers: { 0: 'CD3', 1: 'CD19' },
      wizard,
    },
  },
}

describe('OpenPanel project files', () => {
  test('round-trips every persisted field through the versioned format', () => {
    const serialized = serializeProject(project)
    const file = JSON.parse(serialized) as Record<string, unknown>
    expect(file.kind).toBe(PROJECT_FILE_KIND)
    expect(file.version).toBe(PROJECT_FILE_VERSION)
    expect(file.savedAt).toEqual(expect.any(String))
    expect(file.wizard).toEqual(wizard)
    expect(parseProject(serialized)).toEqual(project)
  })

  test('loads the former R gui_state config envelope', () => {
    const legacy = JSON.stringify({
      module: 'panel_builder',
      config: {
        cytometer: 'discover',
        configuration: 'discover_s8',
        slots: ['Alexa Fluor 488', '', ''],
        markers: { 0: 'CD4' },
        tab: 'panel',
        theme: 'light',
        sidebarWidth: 999,
        sidebarCollapsed: true,
      },
    })
    expect(parseProject(legacy)).toEqual({
      cytometer: 'discover',
      configuration: 'discover_s8',
      slots: ['Alexa Fluor 488', '', ''],
      markers: { 0: 'CD4' },
      tab: 'panel',
      theme: 'light',
      sidebarWidth: 440,
      sidebarCollapsed: true,
      plotScale: 80,
      plotScaleMode: 'fit-width',
      wizard: null,
      cytometerPanels: {
        discover: {
          configuration: 'discover_s8',
          slots: ['Alexa Fluor 488', '', ''],
          markers: { 0: 'CD4' },
          wizard: null,
        },
      },
    })
  })

  test('migrates pre-fit plot scales to the fitted default', () => {
    const legacyScale = JSON.parse(serializeProject(project)) as Record<string, unknown>
    delete legacyScale.plotScaleMode
    legacyScale.plotScale = 40
    expect(parseProject(JSON.stringify(legacyScale)).plotScale).toBe(80)
    expect(parseProject(JSON.stringify(legacyScale)).plotScaleMode).toBe('fit-width')
  })

  test('migrates former LIVE/DEAD Near-IR names to LIVE DEAD NIR', () => {
    const legacyName = JSON.parse(serializeProject(project)) as Record<string, unknown>
    legacyName.slots = ['LIVE/DEAD Fixable Near-IR', '', '']
    legacyName.wizard = {
      ...wizard,
      markers: [{
        ...wizard.markers[0],
        currentFluorophore: 'Live Dead Near IR',
      }],
    }
    delete legacyName.cytometerPanels

    const migrated = parseProject(JSON.stringify(legacyName))
    expect(migrated.slots[0]).toBe('LIVE DEAD NIR')
    expect(migrated.wizard?.markers[0].currentFluorophore).toBe('LIVE DEAD NIR')
  })

  test('migrates former frequency and cell-type marker settings to antigen density', () => {
    const legacy = JSON.parse(serializeProject(project)) as Record<string, unknown>
    legacy.wizard = {
      ...wizard,
      markers: [{
        id: 'marker-0',
        slotIndex: 0,
        name: 'CD3',
        cellType: 'T cells',
        frequency: 'high',
        currentFluorophore: 'PE',
      }],
      desiredSize: 1,
    }
    delete legacy.cytometerPanels

    expect(parseProject(JSON.stringify(legacy)).wizard?.markers).toEqual([{
      id: 'marker-0',
      slotIndex: 0,
      name: 'CD3',
      antigenDensity: 'high',
      currentFluorophore: 'PE',
    }])
  })

  test('rejects unrelated and future project formats', () => {
    expect(() => parseProject('not json')).toThrow('valid JSON')
    expect(() => parseProject('null')).toThrow('does not contain')
    expect(() => parseProject('[]')).toThrow('does not contain')
    expect(() => parseProject('{"kind":"Elsewhere","version":1}')).toThrow('different application')
    expect(() => parseProject(`{"kind":"${PROJECT_FILE_KIND}","version":99}`)).toThrow('not supported')
  })

  test('drops malformed wizard and cytometer-panel records while preserving valid defaults', () => {
    const malformed = {
      cytometer: 'aurora', configuration: '5l_uv_v_b_yg_r', slots: [], markers: {},
      cytometerPanels: { broken: null, array: [], valid: { configuration: '', slots: [], markers: {}, wizard: null } },
      wizard: {
        desiredSize: 2,
        markers: [{ id: '', slotIndex: 'bad', name: 42, frequency: 'high', currentFluorophore: ['PE'] }],
        coexpression: { good: 2, bad: 8, fraction: 1.5 },
        coexpressionContext: { species: 'human', tissue: 'bad', population: 'all', condition: 'baseline' },
        activeTab: 'unknown', resultMode: 'unknown', resultSort: 'unknown',
        results: { recommended: { kind: 'bad', rows: [], alternatives: [] }, bestFit: null },
      },
    }
    const parsed = parseProject(JSON.stringify(malformed))
    expect(parsed.cytometerPanels).toHaveProperty('aurora')
    expect(parsed.cytometerPanels).toHaveProperty('valid')
    expect(parsed.wizard?.markers[0]).toMatchObject({ id: 'marker-0', name: '', antigenDensity: 'high', currentFluorophore: '' })
    expect(parsed.wizard?.coexpression).toEqual({ good: 2 })
    expect(parsed.wizard?.coexpressionContext).toBeUndefined()
    expect(parsed.wizard?.results).toBeNull()
  })

  test('normalizes legacy wizard result rows, scalar arrays, and bounded settings', () => {
    const legacy = {
      cytometer: ['discover'],
      configuration: ['discover_s8'],
      slots: [['LIVE/DEAD Near-IR'], ['PE']],
      markers: { 0: ['CD3'], 1: [''] },
      tab: 'signatures', theme: 'dark', sidebarWidth: 999,
      plotScale: 999, plotScaleMode: 'fit-width', sidebarCollapsed: 'true',
      wizard: {
        desiredSize: 0,
        markers: [null, [], { id: 'm', slotIndex: -2.4, name: 'CD3', antigenDensity: 'low', currentFluorophore: 'PE' }],
        coexpression: { valid: '4', invalid: 5, decimal: 1.5 },
        coexpressionContext: { species: 'mouse', tissue: 'pbmc', population: 'nk-cells', condition: 'tumor' },
        coexpressionScale: 5, coexpressionVisited: true, coexpressionCompleted: false, inputsChanged: false,
        activeTab: 'coexpression', resultMode: 'bestFit', resultSort: 'marker',
        results: {
          scoring_version: WIZARD_SCORING_VERSION,
          response_provenance: responseMatrixProvenance('measured_full_spectrum', { source: 'discover_spectra.csv' }),
          recommended: {
            kind: 'recommended',
            rows: [{ markerId: 'm', markerName: 'CD3', slotIndex: 0, frequency: 'high', fluorophore: 'PE' }],
            alternatives: [{ fluorophore: 'FITC' }],
          },
          bestFit: {
            kind: 'best-fit',
            rows: [{ markerId: 'm', markerName: 'CD3', slotIndex: 0, antigenDensity: 'medium', fluorophore: 'PE' }],
            alternatives: [{ fluorophore: 'APC' }],
          },
        },
      },
      cytometerPanels: {
        discover: { configuration: ['discover_s8'], slots: [['PE']], markers: { 0: ['CD3'] }, wizard: null },
        malformed: { configuration: 42, slots: 'bad', markers: [], wizard: [] },
      },
    }
    const parsed = parseProject(JSON.stringify(legacy))
    expect(parsed.cytometer).toBe('discover')
    expect(parsed.configuration).toBe('discover_s8')
    expect(parsed.slots).toEqual(['LIVE DEAD NIR', 'PE'])
    expect(parsed.markers).toEqual({ 0: 'CD3', 1: '' })
    expect(parsed.tab).toBe('signatures')
    expect(parsed.sidebarWidth).toBe(440)
    expect(parsed.plotScale).toBe(180)
    expect(parsed.wizard?.markers).toEqual([{ id: 'm', slotIndex: 0, name: 'CD3', antigenDensity: 'low', currentFluorophore: 'PE' }])
    expect(parsed.wizard?.coexpression).toEqual({ valid: 4 })
    expect(parsed.wizard?.coexpressionContext).toMatchObject({ species: 'mouse', population: 'nk-cells' })
    expect(parsed.wizard?.results?.recommended.rows[0]).toMatchObject({ antigenDensity: 'high' })
    expect(parsed.wizard?.results?.recommended.rows[0]).not.toHaveProperty('frequency')
    expect(parsed.wizard?.results?.bestFit.rows[0]).toMatchObject({ antigenDensity: 'medium' })
    expect(parsed.cytometerPanels).toHaveProperty('discover')
    expect(parsed.cytometerPanels.malformed).toMatchObject({ configuration: '' })
  })

  test('invalidates wizard results from an older scoring contract', () => {
    const stale = {
      ...project,
      wizard: project.wizard
        ? {
          ...project.wizard,
          results: project.wizard.results
            ? { ...project.wizard.results, scoring_version: 'wizard-response-provenance-v0' }
            : null,
        }
        : null,
    }
    expect(parseProject(serializeProject(stale)).wizard?.results).toBeNull()

    const staleProvenance = {
      ...project,
      wizard: project.wizard
        ? {
          ...project.wizard,
          results: project.wizard.results
            ? {
              ...project.wizard.results,
              response_provenance: responseMatrixProvenance('measured_full_spectrum', { version: 'response-provenance-v0' }),
            }
            : null,
        }
        : null,
    }
    expect(parseProject(serializeProject(staleProvenance)).wizard?.results).toBeNull()
  })

  test('uses defaults and legacy plot-height conversion for incomplete state', () => {
    const parsed = parseProject(JSON.stringify({
      cytometer: 42,
      configuration: null,
      slots: null,
      markers: [],
      tab: 'unknown',
      theme: 'light',
      sidebarWidth: 'not-a-number',
      plotHeight: 460,
      plotScaleMode: 'fit-width',
      wizard: { markers: [] },
    }))
    expect(parsed.cytometer).toBe('aurora')
    expect(parsed.configuration).toBe('5l_uv_v_b_yg_r')
    expect(parsed.slots).toHaveLength(18)
    expect(parsed.sidebarWidth).toBe(214)
    expect(parsed.plotScale).toBe(180)
    expect(parsed.wizard).toBeNull()
  })

  test('rejects malformed wizard result shapes and fills conservative defaults', () => {
    const base = {
      markers: [
        { id: 'm0', slotIndex: 0, name: 'CD3', antigenDensity: 'invalid', frequency: 'invalid', currentFluorophore: null },
        { id: 'm1', slotIndex: 1, name: 'CD4', antigenDensity: 'medium', currentFluorophore: 'FITC' },
      ],
      coexpression: null,
      results: {
        recommended: { kind: 'recommended', rows: 'bad', alternatives: [] },
        bestFit: { kind: 'best-fit', rows: [], alternatives: 'bad' },
      },
    }
    const parsed = parseProject(JSON.stringify({ cytometer: 'aurora', configuration: '', slots: [null], markers: { 0: null }, wizard: base }))
    expect(parsed.configuration).toBe('')
    expect(parsed.slots).toEqual([''])
    expect(parsed.markers).toEqual({ 0: '' })
    expect(parsed.wizard?.markers[0]).toMatchObject({ antigenDensity: 'medium', currentFluorophore: '' })
    expect(parsed.wizard?.coexpression).toEqual({})
    expect(parsed.wizard?.results).toBeNull()

    const invalidAlternatives = parseProject(JSON.stringify({ wizard: {
      markers: [{ id: 'm', slotIndex: 0, name: 'CD3', antigenDensity: 'medium', currentFluorophore: '' }],
      results: {
        recommended: { kind: 'recommended', rows: [], alternatives: [{ fluorophore: 42 }] },
        bestFit: { kind: 'best-fit', rows: [], alternatives: [] },
      },
    } }))
    expect(invalidAlternatives.wizard?.results).toBeNull()

    const noResults = parseProject(JSON.stringify({ wizard: { markers: [base.markers[1]], results: 'bad' } }))
    expect(noResults.wizard?.results).toBeNull()
  })
})
