// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const fakeDb = vi.hoisted(() => {
  const records = new Map<string, unknown>()
  return {
    records,
    get: vi.fn(async (_store: string, key: string) => records.get(key)),
    put: vi.fn(async (_store: string, value: unknown, key: string) => { records.set(key, value); return key }),
    getAllKeys: vi.fn(async () => [...records.keys()]),
    getAll: vi.fn(async () => [...records.values()]),
    delete: vi.fn(async (_store: string, key: string) => { records.delete(key) }),
    contains: vi.fn(() => false),
  }
})

vi.mock('idb', () => ({
  openDB: vi.fn(async (_name: string, _version: number, options: { upgrade?: (db: unknown) => void }) => {
    options.upgrade?.({
      objectStoreNames: { contains: fakeDb.contains },
      createObjectStore: vi.fn(),
    })
    return fakeDb
  }),
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
  renamePanelProject,
  restorePanelProject,
  saveActiveProject,
  savePanelProject,
  setActivePanelProject,
} from '../src/projectStore'
import type { ProjectState } from '../src/projectStore'

const state: ProjectState = {
  cytometer: 'aurora', configuration: '5l_uv_v_b_yg_r', slots: ['FITC'], markers: { 0: 'CD3' },
  tab: 'panel', theme: 'light', sidebarWidth: 214, sidebarCollapsed: false, plotScale: 80,
  plotScaleMode: 'fit-width', wizard: null, cytometerPanels: {},
}

beforeEach(() => {
  fakeDb.records.clear()
  localStorage.clear()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('IndexedDB project persistence', () => {
  test('handles an existing object store and an empty active record', async () => {
    fakeDb.contains.mockReturnValueOnce(true)
    await expect(loadActiveProject()).resolves.toBeNull()
    expect(fakeDb.contains).toHaveBeenCalledWith('projects')
  })

  test('uses the database for active and library persistence', async () => {
    await saveActiveProject(state)
    expect(await loadActiveProject()).toMatchObject({ cytometer: 'aurora', slots: ['FITC'] })

    const first = await createPanelProject(' First ', state)
    expect(await loadPanelProject(first.id)).toMatchObject({ name: 'First' })
    expect(await listPanelProjects()).toHaveLength(1)
    expect(await loadLastPanelProject()).toMatchObject({ id: first.id })

    const saved = await savePanelProject(first.id, 'Saved', state)
    expect(saved.name).toBe('Saved')
    const duplicate = await duplicatePanelProject(first.id)
    expect(duplicate?.name).toBe('Saved copy')
    expect(await listPanelProjects()).toHaveLength(2)

    const archived = await archivePanelProject(first.id)
    expect(archived?.archivedAt).toEqual(expect.any(String))
    expect(await restorePanelProject(first.id)).toMatchObject({ id: first.id })
    await deletePanelProject(first.id)
    expect(await loadPanelProject(first.id)).toBeNull()
    expect(await renamePanelProject('missing', 'Nope')).toBeNull()
  })

  test('rejects duplicate fluorophore aliases before database persistence', async () => {
    const duplicateState = { ...state, slots: ['FITC', 'fit-c'] }

    await expect(createPanelProject('Duplicate', duplicateState)).rejects.toThrow(
      'duplicate fluorophore "fit-c" at project.slots[1]',
    )
    expect(fakeDb.records).toEqual(new Map())

    const panel = await createPanelProject('Valid', state)
    const recordsBefore = new Map(fakeDb.records)
    await expect(savePanelProject(panel.id, 'Duplicate', duplicateState)).rejects.toThrow(
      'duplicate fluorophore "fit-c" at project.slots[1]',
    )
    expect(fakeDb.records).toEqual(recordsBefore)

    await expect(saveActiveProject(duplicateState)).rejects.toThrow(
      'duplicate fluorophore "fit-c" at project.slots[1]',
    )
    expect(fakeDb.records).toEqual(recordsBefore)
  })

  test('rejects oversized aggregate state before database persistence', async () => {
    const oversizedState = {
      ...state,
      cytometerPanels: Object.fromEntries(
        Array.from({ length: 63 }, (_, panelIndex) => [
          `panel-${panelIndex}`,
          {
            configuration: state.configuration,
            slots: Array(18).fill(''),
            markers: Object.fromEntries(Array.from({ length: 256 }, (_, markerIndex) => [markerIndex, 'x'.repeat(512)])),
            wizard: null,
          },
        ]),
      ),
    }

    await expect(saveActiveProject(oversizedState)).rejects.toThrow('OpenPanel project is too large')
    expect(fakeDb.records).toEqual(new Map())
  })

  test('surfaces duplicate active slots without normalizing them away', async () => {
    const rawState = { ...state, slots: ['FITC', 'FITC', ''] }
    fakeDb.records.set('active', rawState)

    await expect(loadActiveProject()).rejects.toThrow('duplicate fluorophore "FITC"')
    const recovered = await loadLastPanelProject()
    expect(recovered).toMatchObject({
      id: 'active',
      loadError: 'OpenPanel project contains duplicate fluorophore "FITC" at project.slots[1] (first used at project.slots[0]).',
      state: { slots: ['FITC', 'FITC', ''] },
    })
    expect(fakeDb.records.get('active')).toEqual(rawState)
  })

  test('keeps duplicate saved slots visible with a recovery error', async () => {
    const rawPanel = {
      id: 'duplicate',
      name: 'Duplicate',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      state: { ...state, slots: ['FITC', 'fit-c'] },
    }
    fakeDb.records.set('panel:duplicate', rawPanel)

    await expect(loadPanelProject('duplicate')).resolves.toMatchObject({
      loadError: 'OpenPanel project contains duplicate fluorophore "fit-c" at project.slots[1] (first used at project.slots[0]).',
      state: { slots: ['FITC', 'fit-c'] },
    })
    expect(fakeDb.records.get('panel:duplicate')).toEqual(rawPanel)
  })

  test('keeps oversized saved panels visible with a recovery error', async () => {
    fakeDb.records.set('panel:oversized', {
      id: 'oversized',
      name: 'Oversized',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      state: { ...state, slots: Array.from({ length: 257 }, (_, index) => `Dye ${index}`) },
    })

    const panels = await listPanelProjects()
    expect(panels).toHaveLength(1)
    expect(panels[0]).toMatchObject({
      id: 'oversized',
      loadError: 'project.slots contains 257 items; maximum is 256.',
    })
    expect(panels[0].state.slots).toHaveLength(256)
    expect(panels[0].state.slots.slice(0, 2)).toEqual(['Dye 0', 'Dye 1'])
  })

  test('does not overwrite unreadable saved panels through project actions', async () => {
    const rawPanel = {
      id: 'unreadable',
      name: 'Unreadable',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      state: { ...state, slots: Array.from({ length: 257 }, (_, index) => `Dye ${index}`) },
    }
    fakeDb.records.set('panel:unreadable', rawPanel)

    await expect(renamePanelProject('unreadable', 'Renamed')).resolves.toMatchObject({ name: 'Unreadable', loadError: expect.any(String) })
    await expect(archivePanelProject('unreadable')).resolves.toMatchObject({ name: 'Unreadable', loadError: expect.any(String) })
    await expect(restorePanelProject('unreadable')).resolves.toMatchObject({ name: 'Unreadable', loadError: expect.any(String) })
    await expect(savePanelProject('unreadable', 'Saved', state)).resolves.toMatchObject({ name: 'Unreadable', loadError: expect.any(String) })
    expect(fakeDb.records.get('panel:unreadable')).toEqual(rawPanel)
    await expect(duplicatePanelProject('unreadable')).resolves.toBeNull()
  })

  test('surfaces an oversized active record as a recoverable panel', async () => {
    const rawState = { ...state, slots: Array.from({ length: 257 }, (_, index) => `Dye ${index}`) }
    fakeDb.records.set('active', rawState)

    await expect(loadActiveProject()).rejects.toThrow('project.slots contains 257 items')
    const recovered = await loadLastPanelProject()
    expect(recovered).toMatchObject({
      id: 'active',
      loadError: 'project.slots contains 257 items; maximum is 256.',
    })
    expect(recovered?.state.slots).toHaveLength(256)
    expect(recovered?.state.slots.slice(0, 2)).toEqual(['Dye 0', 'Dye 1'])
    expect(fakeDb.records.get('active')).toEqual(rawState)
    await deletePanelProject('active')
    expect(fakeDb.records.has('active')).toBe(false)
  })

  test('keeps active project selection and ignores non-panel records', async () => {
    const panel = await createPanelProject('Active', state)
    fakeDb.records.set('other', { id: 'other', state })
    expect((await listPanelProjects()).map((item) => item.id)).toEqual([panel.id])
    expect(await loadLastPanelProject()).toMatchObject({ id: panel.id })
    await archivePanelProject(panel.id)
    expect(await loadLastPanelProject()).toBeNull()

    const other = await createPanelProject('Other', state)
    setActivePanelProject(other.id)
    await archivePanelProject(panel.id)
    expect(localStorage.getItem('openpanel.active-panel-id')).toBe(other.id)
  })
})
