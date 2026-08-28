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
  serializeProject,
  setActivePanelProject,
  ProjectPersistenceError,
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
  vi.unstubAllGlobals()
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
    expect(fakeDb.records.get(`deleted:${first.id}`)).toMatchObject({ id: first.id })
    expect(await renamePanelProject('missing', 'Nope')).toBeNull()
  })

  test('keeps the fallback backend usable when an IndexedDB write fails', async () => {
    fakeDb.put.mockRejectedValueOnce(new Error('panel write failed'))
    const panel = await createPanelProject('Fallback copy', state)

    expect(await loadPanelProject(panel.id)).toMatchObject({ id: panel.id, name: 'Fallback copy' })
    expect(await listPanelProjects()).toEqual([
      expect.objectContaining({ id: panel.id, name: 'Fallback copy' }),
    ])
    expect(await loadActiveProject()).toMatchObject({ slots: ['FITC'] })
  })

  test('rejects deletion when a retained fallback copy cannot be changed', async () => {
    const panel = await createPanelProject('Retained fallback', state)
    const storage = localStorage
    const readOnlyStorage = {
      getItem: (key: string) => storage.getItem(key),
      setItem: () => { throw new Error('localStorage is read-only') },
      removeItem: () => { throw new Error('localStorage is read-only') },
    }
    vi.stubGlobal('window', { localStorage: readOnlyStorage })
    fakeDb.put.mockRejectedValueOnce(new Error('tombstone write failed'))

    await expect(deletePanelProject(panel.id)).rejects.toBeInstanceOf(ProjectPersistenceError)
    expect(await loadPanelProject(panel.id)).toMatchObject({ id: panel.id, name: 'Retained fallback' })
  })

  test('preserves legacy IndexedDB active precedence during migration', async () => {
    fakeDb.records.set('active', state)
    localStorage.setItem(
      'openpanel.panel-builder.state.v1',
      serializeProject({ ...state, slots: ['PE'] }, '2026-08-28T09:00:00.000Z'),
    )

    await expect(loadActiveProject()).resolves.toMatchObject({ slots: ['FITC'] })
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
