import { describe, expect, test } from 'vitest'
import {
  PROJECT_FILE_KIND,
  PROJECT_FILE_VERSION,
  parseProject,
  serializeProject,
} from '../src/projectStore'
import type { ProjectState } from '../src/projectStore'
import type { WizardProjectState } from '../src/panelWizardEngine'

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
    expect(() => parseProject('{"kind":"Elsewhere","version":1}')).toThrow('different application')
    expect(() => parseProject(`{"kind":"${PROJECT_FILE_KIND}","version":99}`)).toThrow('not supported')
  })
})
