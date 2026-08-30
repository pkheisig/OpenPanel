// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

const fixtures = vi.hoisted(() => {
  const project = {
    id: 'panel-1', name: 'Existing', createdAt: '2026-01-01', updatedAt: '2026-01-02',
    state: { cytometer: 'aurora', configuration: '5l_uv_v_b_yg_r', slots: [], markers: {}, tab: 'panel', theme: 'light', sidebarWidth: 214, sidebarCollapsed: false, plotScale: 80, plotScaleMode: 'fit-width', wizard: null, cytometerPanels: {} },
  }
  return {
    project,
    restored: null as typeof project | null,
    surface: null as string | null,
    list: [] as typeof project[],
    calls: [] as string[],
  }
})

vi.mock('../src/LandingPage', () => ({
  LandingPage: (props: Record<string, (...args: never[]) => unknown>) => (
    <section aria-label="mock landing">
      <button type="button" onClick={() => void props.onStart({ name: 'Started', cytometer: 'aurora', configuration: '5l_uv_v_b_yg_r' })}>start</button>
      <button type="button" onClick={() => void props.onStart({ name: 'Configured', cytometer: 'aurora', configuration: '5l_uv_v_b_yg_r', slots: ['FITC'], markers: { 0: 'CD3' } })}>start configured</button>
      <button type="button" onClick={() => void Promise.resolve(props.onStart({ name: 'Blocked', cytometer: 'aurora', configuration: '5l_uv_v_b_yg_r' })).catch((error: Error) => { fixtures.calls.push(`start-error:${error.message}`) })}>start blocked</button>
      <button type="button" onClick={() => void props.onImport({ name: 'import.json', text: async () => '{}' })}>import</button>
      <button type="button" onClick={() => void Promise.resolve(props.onImport({ name: 'blocked.json', text: async () => '{}' })).catch((error: Error) => { fixtures.calls.push(`import-error:${error.message}`) })}>import blocked</button>
      <button type="button" onClick={() => void props.onExport(fixtures.project)}>export</button>
      <button type="button" onClick={() => void props.onRename(fixtures.project, 'Renamed')}>rename</button>
      <button type="button" onClick={() => void props.onDuplicate(fixtures.project)}>duplicate</button>
      <button type="button" onClick={() => void props.onArchive(fixtures.project)}>archive</button>
      <button type="button" onClick={() => void props.onRestore(fixtures.project)}>restore</button>
      <button type="button" onClick={() => void props.onDelete(fixtures.project)}>delete</button>
      <button type="button" onClick={() => void props.onRename({ ...fixtures.project, id: 'other-panel' }, 'Other rename')}>rename other</button>
      <button type="button" onClick={() => void props.onArchive({ ...fixtures.project, id: 'other-panel' })}>archive other</button>
      <button type="button" onClick={() => void props.onDelete({ ...fixtures.project, id: 'other-panel' })}>delete other</button>
      <button type="button" onClick={() => props.onOpen(fixtures.project)}>open</button>
      <button type="button" onClick={() => props.onOpen(fixtures.restored ?? fixtures.project)}>open recovery</button>
      {Array.isArray(props.panels) && (props.panels as Array<{ id: string }>).some((panel) => panel.id === 'active') && <span data-testid="recovery-present" />}
    </section>
  ),
}))

vi.mock('../src/PanelBuilder', () => ({
  default: (props: { onRequestExit: () => Promise<void> }) => (
    <section aria-label="mock editor"><button type="button" onClick={() => void props.onRequestExit()}>exit</button></section>
  ),
}))

vi.mock('../src/spectralEngine', () => ({
  PanelSelectionValidationError: class PanelSelectionValidationError extends Error {},
  buildPanelPayload: vi.fn(async () => ({ max_panel_size: 18, fluorophores: [] })),
  resolveKnownConfiguration: vi.fn(() => '5l_uv_v_b_yg_r'),
  validateRequestedFluorophores: vi.fn(async () => ({ accepted: [], diagnostics: [] })),
}))

vi.mock('../src/projectStore', () => ({
  DEFAULT_PLOT_SCALE: 80,
  PROJECT_RESOURCE_LIMITS: { maxProjectFileBytes: 5 * 1024 * 1024 },
  alignWizardFluorophores: vi.fn((wizard) => wizard),
  archivePanelProject: vi.fn(async (panel) => { fixtures.calls.push('archive'); return panel }),
  createPanelProject: vi.fn(async (name, state) => ({ ...fixtures.project, name, state })),
  deletePanelProject: vi.fn(async () => { fixtures.calls.push('delete') }),
  duplicatePanelProject: vi.fn(async () => { fixtures.calls.push('duplicate') }),
  listPanelProjects: vi.fn(async () => fixtures.list),
  loadLastPanelProject: vi.fn(async () => fixtures.restored),
  parseProject: vi.fn(() => fixtures.project.state),
  renamePanelProject: vi.fn(async (id, name) => ({ ...fixtures.project, id, name })),
  restorePanelProject: vi.fn(async (panel) => panel),
  serializeProject: vi.fn(() => '{}'),
  setActivePanelProject: vi.fn(),
}))

vi.mock('../src/browserFiles', () => ({
  projectJsonFilename: vi.fn(() => 'panel.json'),
  projectNameFromFilename: vi.fn(() => 'Imported'),
  readTextFileWithinLimit: vi.fn(async (file: File) => file.text()),
  saveBlob: vi.fn(async () => undefined),
}))

vi.mock('../src/browserStorage', () => ({
  readLocalStorage: vi.fn((key: string) => key === 'openpanel.current-surface' ? fixtures.surface : null),
  writeLocalStorage: vi.fn(),
}))

vi.mock('../src/themePreference', () => ({ readThemePreference: vi.fn(() => 'light') }))

import App from '../src/App'
import { createPanelProject, loadLastPanelProject } from '../src/projectStore'
import { readTextFileWithinLimit } from '../src/browserFiles'
import { validateRequestedFluorophores } from '../src/spectralEngine'

afterEach(() => {
  cleanup()
  fixtures.restored = null
  fixtures.surface = null
  fixtures.list = []
  fixtures.calls.length = 0
  vi.clearAllMocks()
})

describe('App surface restoration and handoff', () => {
  test('restores the landing surface, routes callbacks, and returns from the editor', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByRole('region', { name: 'mock landing' })).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'start' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'mock editor' })).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'exit' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'mock landing' })).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'mock editor' })).not.toBeNull())
  })

  test('opens a restored editor and exercises landing callback boundaries', async () => {
    fixtures.restored = fixtures.project
    fixtures.list = [fixtures.project]
    fixtures.surface = 'editor'
    render(<App />)
    await waitFor(() => expect(screen.getByRole('region', { name: 'mock editor' })).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'exit' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'mock landing' })).not.toBeNull())
    for (const name of ['import', 'export', 'rename', 'duplicate', 'archive', 'restore', 'delete']) {
      fireEvent.click(screen.getByRole('button', { name }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'rename other' }))
    fireEvent.click(screen.getByRole('button', { name: 'archive other' }))
    fireEvent.click(screen.getByRole('button', { name: 'delete other' }))
    await waitFor(() => expect(fixtures.calls).toContain('archive'))
    expect(vi.mocked(readTextFileWithinLimit)).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'import.json' }),
      5 * 1024 * 1024,
      'OpenPanel project',
    )
    expect(vi.mocked(validateRequestedFluorophores)).toHaveBeenCalledWith(
      'aurora',
      '5l_uv_v_b_yg_r',
      [],
    )
  })

  test('keeps a synthetic recovery panel visible after returning to the library', async () => {
    fixtures.restored = { ...fixtures.project, id: 'active', loadError: 'project is oversized.' }
    fixtures.surface = 'landing'
    render(<App />)
    await waitFor(() => expect(screen.getByRole('region', { name: 'mock landing' })).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'open recovery' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'mock editor' })).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'exit' }))
    await waitFor(() => expect(screen.getByTestId('recovery-present')).not.toBeNull())
  })

  test('blocks new projects from overwriting a legacy recovery record', async () => {
    fixtures.restored = { ...fixtures.project, id: 'active', loadError: 'project is oversized.' }
    fixtures.surface = 'landing'
    render(<App />)
    await waitFor(() => expect(screen.getByRole('region', { name: 'mock landing' })).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'start blocked' }))
    fireEvent.click(screen.getByRole('button', { name: 'import blocked' }))
    await waitFor(() => expect(fixtures.calls).toEqual([
      'start-error:Recover or delete the legacy panel before starting or importing another project.',
      'import-error:Recover or delete the legacy panel before starting or importing another project.',
    ]))
    expect(vi.mocked(createPanelProject)).not.toHaveBeenCalled()
    expect(vi.mocked(readTextFileWithinLimit)).not.toHaveBeenCalled()
  })

  test('canonicalizes accepted aliases before creating an imported panel', async () => {
    fixtures.surface = 'landing'
    const originalState = fixtures.project.state
    fixtures.project.state = { ...fixtures.project.state, slots: ['Alias', ''], markers: { 0: 'CD3' } }
    vi.mocked(validateRequestedFluorophores).mockResolvedValueOnce({ accepted: ['Canonical'], diagnostics: [] })
    render(<App />)
    await waitFor(() => expect(screen.getByRole('region', { name: 'mock landing' })).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'import' }))
    await waitFor(() => expect(vi.mocked(createPanelProject)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ slots: ['Canonical', ''], markers: { 0: 'CD3' } }),
    ))
    fixtures.project.state = originalState
  })

  test('rejects invalid fluorophores in inactive imported cytometer panels', async () => {
    fixtures.surface = 'landing'
    const originalState = fixtures.project.state
    fixtures.project.state = {
      ...fixtures.project.state,
      cytometerPanels: {
        discover: {
          configuration: '5l_uv_v_b_yg_r',
          slots: ['Unknown'],
          markers: {},
          wizard: null,
        },
      },
    }
    vi.mocked(validateRequestedFluorophores)
      .mockResolvedValueOnce({ accepted: [], diagnostics: [] })
      .mockResolvedValueOnce({ accepted: [], diagnostics: [] })
      .mockResolvedValueOnce({
        accepted: [],
        diagnostics: [{
          requested: 'Unknown',
          canonicalFluorophore: null,
          status: 'unrecognized',
          reason: 'Unknown fluorophore.',
        }],
      })
    render(<App />)
    await waitFor(() => expect(screen.getByRole('region', { name: 'mock landing' })).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'import blocked' }))
    await waitFor(() => expect(fixtures.calls.some((call) => call.startsWith('import-error:'))).toBe(true))
    expect(vi.mocked(createPanelProject)).not.toHaveBeenCalled()
    fixtures.project.state = originalState
  })

  test('passes configured slots and handles callbacks for the active landing panel', async () => {
    fixtures.restored = fixtures.project
    fixtures.list = [fixtures.project]
    fixtures.surface = 'landing'
    render(<App />)
    await waitFor(() => expect(screen.getByRole('region', { name: 'mock landing' })).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'start configured' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'mock editor' })).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'exit' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'mock landing' })).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'rename' }))
    await waitFor(() => expect(vi.mocked(loadLastPanelProject)).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'archive' }))
    await waitFor(() => expect(fixtures.calls).toContain('archive'))
  })

  test('does not update state when restoration resolves after unmount', async () => {
    let resolve: ((value: null) => void) | undefined
    vi.mocked(loadLastPanelProject).mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    const { unmount } = render(<App />)
    unmount()
    resolve?.(null)
    await Promise.resolve()
    expect(screen.queryByRole('region', { name: 'mock landing' })).toBeNull()
  })
})
