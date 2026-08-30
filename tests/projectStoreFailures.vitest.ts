// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('idb', () => ({
  openDB: vi.fn(async () => { throw new Error('IndexedDB unavailable') }),
}))

import {
  archivePanelProject,
  createPanelProject,
  deletePanelProject,
  duplicatePanelProject,
  listPanelProjects,
  loadActiveProject,
  loadLastPanelProject,
  loadPanelProject,
  normalizeWizardPanelResult,
  normalizeWizardResults,
  parseProject,
  renamePanelProject,
  restorePanelProject,
  saveActiveProject,
  savePanelProject,
  setActivePanelProject,
} from '../src/projectStore'
import type { ProjectState } from '../src/projectStore'
import { responseMatrixProvenance } from '../src/panelBuilderShared'
import { WIZARD_SCORING_VERSION } from '../src/panelWizardEngine'

const state: ProjectState = {
  cytometer: 'aurora', configuration: '5l_uv_v_b_yg_r', slots: ['FITC'], markers: { 0: 'CD3' },
  tab: 'panel', theme: 'light', sidebarWidth: 214, sidebarCollapsed: false, plotScale: 80,
  plotScaleMode: 'fit-width', wizard: null, cytometerPanels: {},
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('crypto', undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('IndexedDB fallback error paths', () => {
  test('normalizes complete wizard results and empty panel names', async () => {
    const parsed = parseProject(JSON.stringify({
      ...state,
      wizard: {
        desiredSize: 1,
        markers: [{ id: 'm1', slotIndex: 0, name: 'CD3', antigenDensity: 'medium', currentFluorophore: 'FITC' }],
        coexpression: {},
        activeTab: 'recommendations',
        resultMode: 'bestFit',
        resultSort: 'spectral',
        results: {
          scoring_version: WIZARD_SCORING_VERSION,
          response_provenance: responseMatrixProvenance('measured_full_spectrum', { source: 'aurora_spectra.csv' }),
          response_context: { cytometer: 'aurora', configuration: '5l_uv_v_b_yg_r', measurement_mode: 'spectral' },
          recommended: {
            kind: 'recommended',
            rows: [{ markerId: 'm1', markerName: 'CD3', slotIndex: 0, antigenDensity: 'medium', fluorophore: 'FITC' }],
            alternatives: [{ fluorophore: 'PE' }],
          },
          bestFit: {
            kind: 'best-fit',
            rows: [{ markerId: 'm1', markerName: 'CD3', slotIndex: 0, antigenDensity: 'low', fluorophore: 'PE' }],
            alternatives: [{ fluorophore: 'FITC' }],
          },
        },
      },
    }))
    expect(parsed.wizard?.results?.recommended.rows[0].antigenDensity).toBe('medium')
    expect(parsed.wizard?.results?.bestFit.rows[0].fluorophore).toBe('PE')
    expect(normalizeWizardPanelResult({
      kind: 'recommended',
      rows: [{ markerId: 'm1', markerName: 'CD3', slotIndex: 0, antigenDensity: 'medium', fluorophore: 'FITC' }],
      alternatives: [{ fluorophore: 'PE' }],
    })?.rows).toHaveLength(1)
    expect(normalizeWizardResults(undefined)).toBeNull()
    expect(normalizeWizardResults({
      scoring_version: WIZARD_SCORING_VERSION,
      response_provenance: responseMatrixProvenance('measured_full_spectrum', { source: 'aurora_spectra.csv' }),
      response_context: { cytometer: 'aurora', configuration: '5l_uv_v_b_yg_r', measurement_mode: 'spectral' },
      recommended: { kind: 'recommended', rows: [], alternatives: [] },
      bestFit: { kind: 'best-fit', rows: [], alternatives: [] },
    })?.bestFit.kind).toBe('best-fit')
    expect(normalizeWizardResults({
      scoring_version: 'wizard-response-provenance-v0',
      response_provenance: responseMatrixProvenance('measured_full_spectrum'),
      response_context: { cytometer: 'aurora', configuration: '5l_uv_v_b_yg_r', measurement_mode: 'spectral' },
      recommended: { kind: 'recommended', rows: [], alternatives: [] },
      bestFit: { kind: 'best-fit', rows: [], alternatives: [] },
    })).toBeNull()

    localStorage.setItem('openpanel.panel-library.v1', JSON.stringify([{ id: 'existing', name: 'Existing', state }]))
    const unnamed = await createPanelProject('   ', state)
    expect(unnamed.name).toBe('Untitled panel')
  })

  test('persists the active state and recovers or rejects malformed legacy data', async () => {
    await saveActiveProject(state)
    expect(localStorage.getItem('openpanel.panel-builder.state.v1')).toContain('OpenPanel project')
    expect(await loadActiveProject()).toMatchObject({ cytometer: 'aurora', slots: ['FITC'] })

    localStorage.setItem('openpanel.panel-builder.state.v1', '{bad json')
    await expect(loadActiveProject()).resolves.toBeNull()
    localStorage.removeItem('openpanel.panel-builder.state.v1')
    await expect(loadActiveProject()).resolves.toBeNull()
  })

  test('uses the fallback library for the full panel lifecycle', async () => {
    const first = await createPanelProject('  First   panel  ', state)
    expect(first.id).toMatch(/^panel-/)
    expect(await loadPanelProject(first.id)).toMatchObject({ name: 'First panel' })
    expect(await listPanelProjects()).toHaveLength(1)

    const renamed = await renamePanelProject(first.id, ' Renamed ')
    expect(renamed?.name).toBe('Renamed')
    const duplicate = await duplicatePanelProject(first.id)
    expect(duplicate?.name).toBe('Renamed copy')
    expect(duplicate?.archivedAt).toBeUndefined()
    expect(await listPanelProjects()).toHaveLength(2)

    setActivePanelProject(first.id)
    const archived = await archivePanelProject(first.id)
    expect(archived?.archivedAt).toEqual(expect.any(String))
    expect(localStorage.getItem('openpanel.active-panel-id')).toBeNull()
    expect(await restorePanelProject(first.id)).toMatchObject({ id: first.id })
    expect(await savePanelProject(first.id, 'Saved again', state)).toMatchObject({ id: first.id, name: 'Saved again' })
    await deletePanelProject(first.id)
    expect(await loadPanelProject(first.id)).toBeNull()
    expect(await renamePanelProject('missing', 'Nope')).toBeNull()
    expect(await duplicatePanelProject('missing')).toBeNull()
    expect(await archivePanelProject('missing')).toBeNull()
    expect(await restorePanelProject('missing')).toBeNull()
    expect(await savePanelProject('new-id', 'New panel', state)).toMatchObject({ id: 'new-id', name: 'New panel' })
  })

  test('rejects duplicate fluorophore aliases before fallback persistence', async () => {
    const duplicateState = { ...state, slots: ['FITC', 'fit-c'] }

    await expect(createPanelProject('Duplicate', duplicateState)).rejects.toThrow(
      'duplicate fluorophore "fit-c" at project.slots[1]',
    )
    expect(localStorage.getItem('openpanel.panel-library.v1')).toBeNull()

    const panel = await createPanelProject('Valid', state)
    const storedBefore = localStorage.getItem('openpanel.panel-library.v1')
    await expect(savePanelProject(panel.id, 'Duplicate', duplicateState)).rejects.toThrow(
      'duplicate fluorophore "fit-c" at project.slots[1]',
    )
    expect(localStorage.getItem('openpanel.panel-library.v1')).toBe(storedBefore)
  })

  test('normalizes fallback records and respects active and archived selection', async () => {
    localStorage.setItem('openpanel.panel-library.v1', JSON.stringify([
      null,
      { id: 'missing-state', name: 'bad', state: null },
      { id: 'defaults', name: '  Defaults  ', state, archivedAt: 4 },
      { id: 'active', name: ' Active ', state, createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' },
      'wrong',
    ]))
    expect((await listPanelProjects()).map((panel) => panel.id)).toEqual(['active', 'defaults'])
    expect(await loadPanelProject('missing')).toBeNull()
    setActivePanelProject('missing')
    expect(await loadLastPanelProject()).toMatchObject({ id: 'active' })
    expect(localStorage.getItem('openpanel.active-panel-id')).toBe('active')

    localStorage.setItem('openpanel.panel-library.v1', JSON.stringify([
      { id: 'archived', name: 'Archived', state, archivedAt: '2025-01-01T00:00:00.000Z' },
    ]))
    localStorage.setItem('openpanel.active-panel-id', 'archived')
    expect(await loadLastPanelProject()).toBeNull()
    localStorage.setItem('openpanel.panel-library.v1', 'not json')
    expect(await listPanelProjects()).toEqual([])
    localStorage.setItem('openpanel.panel-library.v1', '{}')
    expect(await listPanelProjects()).toEqual([])
  })

  test('does not overwrite unreadable fallback panels through project actions', async () => {
    const rawPanel = {
      id: 'unreadable',
      name: 'Unreadable',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      state: { ...state, slots: Array.from({ length: 257 }, (_, index) => `Dye ${index}`) },
    }
    localStorage.setItem('openpanel.panel-library.v1', JSON.stringify([rawPanel]))

    await expect(renamePanelProject('unreadable', 'Renamed')).resolves.toMatchObject({ name: 'Unreadable', loadError: expect.any(String) })
    await expect(archivePanelProject('unreadable')).resolves.toMatchObject({ name: 'Unreadable', loadError: expect.any(String) })
    await expect(restorePanelProject('unreadable')).resolves.toMatchObject({ name: 'Unreadable', loadError: expect.any(String) })
    await expect(savePanelProject('unreadable', 'Saved', state)).resolves.toMatchObject({ name: 'Unreadable', loadError: expect.any(String) })
    expect(JSON.parse(localStorage.getItem('openpanel.panel-library.v1') ?? 'null')).toEqual([rawPanel])
    await expect(duplicatePanelProject('unreadable')).resolves.toBeNull()
  })

  test('surfaces an oversized legacy active record as a recoverable panel', async () => {
    const rawState = { ...state, slots: Array.from({ length: 257 }, (_, index) => `Dye ${index}`) }
    localStorage.setItem('openpanel.panel-builder.state.v1', JSON.stringify(rawState))

    await expect(loadActiveProject()).rejects.toThrow('project.slots contains 257 items')
    const recovered = await loadLastPanelProject()
    expect(recovered).toMatchObject({
      id: 'active',
      loadError: 'project.slots contains 257 items; maximum is 256.',
      state: { markers: { 0: 'CD3' } },
    })
    expect(recovered?.state.slots).toHaveLength(256)
    expect(recovered?.state.slots.slice(0, 2)).toEqual(['Dye 0', 'Dye 1'])
    await deletePanelProject('active')
    expect(localStorage.getItem('openpanel.panel-builder.state.v1')).toBeNull()
  })

  test('preserves valid slots and markers when a saved wizard subtree is oversized', async () => {
    const rawPanel = {
      id: 'wizard-overflow',
      name: 'Wizard overflow',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      state: {
        ...state,
        wizard: { markers: Array.from({ length: 257 }, (_, index) => ({ id: `m${index}` })) },
      },
    }
    localStorage.setItem('openpanel.panel-library.v1', JSON.stringify([rawPanel]))

    await expect(loadPanelProject(rawPanel.id)).resolves.toMatchObject({
      loadError: 'project.wizard.markers contains 257 items; maximum is 256.',
      state: { slots: ['FITC'], markers: { 0: 'CD3' }, wizard: null },
    })
  })

  test('recovers a populated legacy state only when the library is empty', async () => {
    localStorage.setItem('openpanel.panel-builder.state.v1', JSON.stringify({ ...state, slots: [''] }))
    expect(await loadLastPanelProject()).toBeNull()
    localStorage.setItem('openpanel.panel-builder.state.v1', JSON.stringify(state))
    const recovered = await loadLastPanelProject()
    expect(recovered?.name).toBe('Recovered panel')
    expect(await listPanelProjects()).toHaveLength(1)
  })

  test('does not resurrect legacy data when every stored panel is archived', async () => {
    localStorage.setItem('openpanel.panel-library.v1', JSON.stringify([
      { id: 'archived', name: 'Archived', state, archivedAt: '2025-01-01T00:00:00.000Z' },
    ]))
    localStorage.setItem('openpanel.panel-builder.state.v1', JSON.stringify(state))
    expect(await loadLastPanelProject()).toBeNull()
  })
})
