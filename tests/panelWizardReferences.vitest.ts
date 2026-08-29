// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  antigenDensityKey,
  fluorophoreBrightnessKey,
  loadPanelWizardReferences,
  resetPanelWizardReferencesForTests,
} from '../src/panelWizardReferences'

afterEach(() => {
  vi.unstubAllGlobals()
  resetPanelWizardReferencesForTests()
})

describe('panel wizard reference loading in a browser origin', () => {
  test('normalizes context keys and loads relative data URLs', async () => {
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      requests.push(String(input))
      const source = String(input)
      if (source.includes('brightness')) {
        return new Response('cytometer,configuration,fluorophore,brightness_score,source\n*,*,PE,5,test', { status: 200 })
      }
      if (source.includes('antigen_density')) {
        return new Response('cell_type,antigen,molecules_per_cell,source\nT cells,CD3,123,test', { status: 200 })
      }
      return new Response('marker,aliases\nCD3,T cell', { status: 200 })
    }))
    expect(antigenDensityKey('T cells', 'CD3')).toBe('tcells::cd3')
    expect(fluorophoreBrightnessKey('PE-Cy7')).toBe('pecy7')
    expect(fluorophoreBrightnessKey('LIVE/DEAD Fixable Near-IR')).toBe('livedeadnir')
    const references = await loadPanelWizardReferences('aurora', 'config')
    expect(references.brightnessByFluorophore).toEqual({ pe: 5 })
    expect(references.antigenDensityByContext).toEqual({ 'tcells::cd3': 123 })
    expect(requests.every((url) => url.startsWith('http://localhost'))).toBe(true)
  })

  test('trims reference cells before matching wildcard scopes', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const source = String(input)
      if (source.includes('brightness')) {
        return new Response('cytometer,configuration,fluorophore,brightness_score,source\n"* "," *",PE,5,test', { status: 200 })
      }
      if (source.includes('antigen_density')) {
        return new Response('cell_type,antigen,molecules_per_cell,source\n T cells , CD3 ,123,test', { status: 200 })
      }
      return new Response('marker,aliases\n CD3 , T cell ', { status: 200 })
    }))
    const references = await loadPanelWizardReferences('aurora', 'config')
    expect(references.brightnessByFluorophore).toEqual({ pe: 5 })
    expect(references.antigenDensityByContext).toEqual({ 'tcells::cd3': 123 })
  })

  test('adds the source filename to malformed CSV parser errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const source = String(input)
      if (source.includes('brightness')) {
        return new Response('cytometer,configuration,fluorophore,brightness_score,source\n*,*,PE,"5"oops,test', { status: 200 })
      }
      if (source.includes('antigen_density')) return new Response('cell_type,antigen,molecules_per_cell,source\n', { status: 200 })
      return new Response('marker,aliases\nCD3,T cell', { status: 200 })
    }))
    await expect(loadPanelWizardReferences('aurora', 'config')).rejects.toThrow('panel_wizard_brightness.csv: Malformed CSV')
  })

  test('fails closed with the source filename when a reference fetch is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const source = String(input)
      if (source.includes('brightness')) return new Response('missing', { status: 404 })
      if (source.includes('antigen_density')) return new Response('cell_type,antigen,molecules_per_cell,source\n', { status: 200 })
      return new Response('marker,aliases\nCD3,T cell', { status: 200 })
    }))
    await expect(loadPanelWizardReferences('aurora', 'config'))
      .rejects.toThrow('panel_wizard_brightness.csv: could not load bundled reference data (404).')

    resetPanelWizardReferencesForTests()
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const source = String(input)
      if (source.includes('marker_dictionary')) throw new Error('network down')
      if (source.includes('brightness')) return new Response('cytometer,configuration,fluorophore,brightness_score,source\n', { status: 200 })
      return new Response('cell_type,antigen,molecules_per_cell,source\n', { status: 200 })
    }))
    await expect(loadPanelWizardReferences('aurora', 'config'))
      .rejects.toThrow('marker_dictionary.csv: could not load bundled reference data: network down')
  })

  test('canonicalizes fluorophore aliases when validating brightness references', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const source = String(input)
      if (source.includes('brightness')) {
        return new Response(
          'cytometer,configuration,fluorophore,brightness_score,source\n'
          + '*,*,LIVE DEAD NIR,3,test\n'
          + '*,*,LIVE/DEAD Fixable Near-IR,5,test',
          { status: 200 },
        )
      }
      if (source.includes('antigen_density')) return new Response('cell_type,antigen,molecules_per_cell,source\n', { status: 200 })
      return new Response('marker,aliases\nCD3,T cell', { status: 200 })
    }))
    await expect(loadPanelWizardReferences('aurora', 'config')).rejects.toThrow('duplicates brightness reference')
  })
})
