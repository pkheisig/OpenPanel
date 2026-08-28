// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  archivePanelProject,
  createPanelProject,
  deletePanelProject,
  duplicatePanelProject,
  listPanelProjects,
  loadActiveProject,
  loadLastPanelProject,
  loadPanelProject,
  parseProject,
  renamePanelProject,
  restorePanelProject,
  saveActiveProject,
  savePanelProject,
  setActivePanelProject,
} from '../src/projectStore'
import type { ProjectState } from '../src/projectStore'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

const state: ProjectState = {
  cytometer: 'aurora',
  configuration: '5l_uv_v_b_yg_r',
  slots: ['Alexa Fluor 488', '', ''],
  markers: { 0: 'CD3' },
  tab: 'panel',
  theme: 'light',
  sidebarWidth: 214,
  sidebarCollapsed: false,
  plotScale: 80,
  plotScaleMode: 'fit-width',
  wizard: null,
  cytometerPanels: {},
}

describe('panel library fallback persistence', () => {
  test('saves and loads the active project when IndexedDB is unavailable', async () => {
    await saveActiveProject(state)
    await expect(loadActiveProject()).resolves.toMatchObject({
      cytometer: 'aurora',
      slots: ['Alexa Fluor 488', '', ''],
    })
    localStorage.setItem('openpanel.panel-builder.state.v1', 'not json')
    await expect(loadActiveProject()).resolves.toBeNull()
  })

  test('creates, lists, loads, renames, duplicates, archives, restores, and deletes panels', async () => {
    const first = await createPanelProject('  First   panel  ', state)
    expect(first.name).toBe('First panel')
    expect(localStorage.getItem('openpanel.active-panel-id')).toBe(first.id)
    await expect(loadPanelProject(first.id)).resolves.toMatchObject({ id: first.id, name: 'First panel' })
    expect(await listPanelProjects()).toHaveLength(1)

    const renamed = await renamePanelProject(first.id, ' Renamed ')
    expect(renamed?.name).toBe('Renamed')
    const duplicate = await duplicatePanelProject(first.id)
    expect(duplicate?.name).toBe('Renamed copy')
    expect(duplicate?.id).not.toBe(first.id)
    expect(await listPanelProjects()).toHaveLength(2)

    const archived = await archivePanelProject(first.id)
    expect(archived?.archivedAt).toEqual(expect.any(String))
    expect(localStorage.getItem('openpanel.active-panel-id')).toBeNull()
    const restored = await restorePanelProject(first.id)
    expect(restored?.archivedAt).toBeUndefined()
    expect(await savePanelProject(first.id, 'Saved again', state)).toMatchObject({ name: 'Saved again', id: first.id })
    await deletePanelProject(first.id)
    expect(await loadPanelProject(first.id)).toBeNull()
    expect(await renamePanelProject('missing', 'Nope')).toBeNull()
    expect(await duplicatePanelProject('missing')).toBeNull()
    expect(await archivePanelProject('missing')).toBeNull()
    expect(await restorePanelProject('missing')).toBeNull()
  })

  test('keeps archived libraries authoritative and recovers legacy active panels only when needed', async () => {
    const panel = await createPanelProject('Archived', state)
    await archivePanelProject(panel.id)
    setActivePanelProject(panel.id)
    expect(await loadLastPanelProject()).toBeNull()

    localStorage.clear()
    await saveActiveProject({ ...state, slots: [''] })
    expect(await loadLastPanelProject()).toBeNull()
    await saveActiveProject(state)
    const recovered = await loadLastPanelProject()
    expect(recovered?.name).toBe('Recovered panel')
    expect(await listPanelProjects()).toHaveLength(1)
  })

  test('normalizes malformed stored library records and project defaults', async () => {
    localStorage.setItem('openpanel.panel-library.v1', JSON.stringify([
      null,
      { id: 'bad', name: '  Valid  ', state },
      { id: 'invalid' },
      'wrong',
    ]))
    expect((await listPanelProjects()).map((panel) => panel.name)).toEqual(['Valid'])
    expect(parseProject('{"sidebarWidth": "bad", "plotHeight": 460, "slots": ["LIVE/DEAD Near-IR"]}')).toMatchObject({
      sidebarWidth: 214,
      plotScale: 80,
      slots: ['LIVE DEAD NIR'],
    })
  })

  test('keeps incompatible saved panels visible for library management', async () => {
    const incompatible = { ...state, cytometer: 'future-cytometer', configuration: 'future-config' }
    localStorage.setItem('openpanel.panel-library.v1', JSON.stringify([{
      id: 'future-panel', name: 'Future panel', createdAt: '2026-01-01', updatedAt: '2026-01-02', state: incompatible,
    }]))

    await expect(listPanelProjects()).resolves.toMatchObject([
      expect.objectContaining({ id: 'future-panel', state: incompatible }),
    ])
    await expect(loadLastPanelProject()).resolves.toBeNull()

    await expect(renamePanelProject('future-panel', 'Future renamed')).resolves.toMatchObject({ name: 'Future renamed' })
    await expect(deletePanelProject('future-panel')).resolves.toBeUndefined()
    await expect(listPanelProjects()).resolves.toEqual([])
  })
})
