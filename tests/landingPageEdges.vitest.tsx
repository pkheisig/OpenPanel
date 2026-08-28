// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  buildPanelPayload: vi.fn(),
  assignments: vi.fn(),
  bestEffort: vi.fn(),
}))

vi.mock('../src/spectralEngine', async () => ({
  ...(await vi.importActual<typeof import('../src/spectralEngine')>('../src/spectralEngine')),
  buildPanelPayload: mocks.buildPanelPayload,
}))
vi.mock('../src/panelWizardKnowledge', async () => ({
  ...(await vi.importActual<typeof import('../src/panelWizardKnowledge')>('../src/panelWizardKnowledge')),
  omipTemplateAssignmentsForPanel: mocks.assignments,
  omipTemplateAssignmentsForPanelBestEffort: mocks.bestEffort,
}))
vi.mock('../src/OmipLibrary', () => ({
  OmipLibrary: (props: {
    onClose: () => void
    onApplyTemplate: (template: unknown) => void
    onUseRecommendedConfiguration?: (template: unknown, entry: unknown) => void
    canUseRecommendedConfiguration?: (entry: unknown) => boolean
  }) => {
    const template = { name: 'OMIP edge template' }
    const supported = { cytometers: ['Sony ID7000 4L'] }
    const unsupported = { cytometers: ['Unknown instrument'] }
    return (
      <div role="dialog" aria-label="mock OMIP library">
        <button type="button" onClick={() => props.onApplyTemplate(template)}>Apply OMIP</button>
        <button type="button" onClick={() => props.onUseRecommendedConfiguration?.(template, supported)}>Use recommended</button>
        <button type="button" onClick={() => props.onUseRecommendedConfiguration?.(template, unsupported)}>Use unsupported</button>
        <button type="button" onClick={() => props.canUseRecommendedConfiguration?.(supported)}>Check supported</button>
        <button type="button" onClick={() => props.canUseRecommendedConfiguration?.(unsupported)}>Check unsupported</button>
        <button type="button" onClick={props.onClose}>Close OMIP</button>
      </div>
    )
  },
}))

import { LandingPage } from '../src/LandingPage'
import type { StoredPanelProject } from '../src/projectStore'

const payload = {
  cytometer: 'aurora',
  configuration: '5l_uv_v_b_yg_r',
  measurement_mode: 'spectral' as const,
  libraries: [],
  configurations: [{ id: '5l_uv_v_b_yg_r', label: 'Aurora 5L' }],
  detectors: [
    { detector: 'V1-A', label: 'V1-A', laser: 'Violet', emission: 405, color: '#700' },
    { detector: 'B1-A', label: 'B1-A', laser: 'Blue', emission: 488, color: '#070' },
  ],
  fluorophores: [
    { fluorophore: 'FITC', peak_detector: 'V1-A', peak_laser: 'Violet', peak_color: '', mapping_confidence: 'estimated' as const },
    { fluorophore: 'PE', peak_detector: 'B1-A', peak_laser: 'Blue', peak_color: '#f00' },
  ],
  selected: ['FITC'],
  spectra: [
    { fluorophore: 'FITC', 'V1-A': Number.NaN, 'B1-A': 0.5 },
    { fluorophore: 'PE', 'V1-A': 0.2, 'B1-A': 0.8 },
  ],
  similarity: [],
  complexity_index: null,
  peak_detectors: ['V1-A'],
  max_panel_size: 2,
}

const panel = (overrides: Partial<StoredPanelProject> = {}): StoredPanelProject => ({
  id: 'edge-panel', name: 'Edge panel', createdAt: '2026-01-01', updatedAt: '2026-01-02',
  state: {
    cytometer: 'aurora', configuration: '5l_uv_v_b_yg_r', slots: ['FITC', ''], markers: {},
    tab: 'panel', theme: 'light', sidebarWidth: 214, sidebarCollapsed: false, plotScale: 80,
    plotScaleMode: 'fit-width', wizard: null, cytometerPanels: {},
  },
  ...overrides,
})

const callbacks = () => ({
  onStart: vi.fn(async () => undefined), onOpen: vi.fn(), onImport: vi.fn(async () => undefined),
  onExport: vi.fn(async () => undefined), onRename: vi.fn(async () => undefined),
  onDuplicate: vi.fn(async () => undefined), onArchive: vi.fn(async () => undefined),
  onRestore: vi.fn(async () => undefined), onDelete: vi.fn(async () => undefined),
})

function chooseAurora() {
  fireEvent.click(screen.getByRole('combobox', { name: 'CYTOMETER' }))
  fireEvent.click(screen.getByRole('option', { name: /Aurora/ }))
  fireEvent.click(screen.getByRole('combobox', { name: 'DETECTOR CONFIGURATION' }))
  fireEvent.click(screen.getByRole('option', { name: /Aurora 5L/ }))
}

beforeEach(() => {
  mocks.buildPanelPayload.mockReset()
  mocks.buildPanelPayload.mockResolvedValue(payload)
  mocks.assignments.mockReset()
  mocks.bestEffort.mockReset()
  mocks.assignments.mockReturnValue(null)
  mocks.bestEffort.mockReturnValue([{ marker: 'CD3', fluorophore: 'FITC' }])
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn() })),
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('LandingPage defensive and boundary workflows', () => {
  test('handles start, import, and OMIP errors with fallback messages', async () => {
    const props = callbacks()
    render(<LandingPage panels={[]} {...props} />)
    fireEvent.submit(screen.getByRole('form', { name: 'Panel configuration' }))
    chooseAurora()
    props.onStart.mockRejectedValueOnce(new Error('start failed'))
    fireEvent.submit(screen.getByRole('form', { name: 'Panel configuration' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('start failed'))

    props.onStart.mockRejectedValueOnce('not an Error')
    fireEvent.submit(screen.getByRole('form', { name: 'Panel configuration' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Could not open the panel workspace.'))

    props.onImport.mockRejectedValueOnce(new Error('import failed'))
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.click(screen.getByRole('button', { name: 'Import project' }))
    fireEvent.change(input, { target: { files: [new File(['{}'], 'bad.json')] } })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('import failed'))
    props.onImport.mockRejectedValueOnce('not an Error')
    fireEvent.change(input, { target: { files: [new File(['{}'], 'bad.json')] } })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Could not import this OpenPanel project.'))

    fireEvent.click(screen.getByRole('button', { name: /Use OMIP/ }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'mock OMIP library' })).not.toBeNull())
    mocks.assignments.mockReturnValueOnce([])
    fireEvent.click(screen.getByRole('button', { name: 'Apply OMIP' }))
    await waitFor(() => expect(props.onStart).toHaveBeenCalledTimes(2))

    mocks.assignments.mockReturnValueOnce(null)
    mocks.bestEffort.mockReturnValueOnce([{ marker: 'CD4', fluorophore: 'PE' }])
    props.onStart.mockRejectedValueOnce(new Error('OMIP failed'))
    fireEvent.click(screen.getByRole('button', { name: 'Apply OMIP' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('OMIP failed'))
    fireEvent.click(screen.getByRole('button', { name: 'Close OMIP' }))
  })

  test('covers OMIP payload rejection and idle-loader fallback', async () => {
    const props = callbacks()
    const idle = Object.getOwnPropertyDescriptor(window, 'requestIdleCallback')
    Object.defineProperty(window, 'requestIdleCallback', { configurable: true, value: undefined })
    const deferred = new Promise<never>(() => undefined)
    mocks.buildPanelPayload.mockReturnValueOnce(deferred)
    render(<LandingPage panels={[]} {...props} />)
    await new Promise((resolve) => setTimeout(resolve, 0))
    chooseAurora()
    fireEvent.click(screen.getByRole('button', { name: /Use OMIP/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply OMIP' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close OMIP' }))
    mocks.buildPanelPayload.mockRejectedValueOnce(new Error('OMIP payload unavailable'))
    fireEvent.click(screen.getByRole('button', { name: /Use OMIP/ }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'mock OMIP library' })).not.toBeNull())
    await waitFor(() => expect(mocks.buildPanelPayload).toHaveBeenCalled())
    if (idle) Object.defineProperty(window, 'requestIdleCallback', idle)
  })

  test('returns cleanly when OMIP payload is not available yet', async () => {
    const props = callbacks()
    mocks.buildPanelPayload.mockResolvedValueOnce(null)
    render(<LandingPage panels={[]} {...props} />)
    chooseAurora()
    fireEvent.click(screen.getByRole('button', { name: /Use OMIP/ }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'mock OMIP library' })).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Apply OMIP' }))
    expect(props.onStart).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close OMIP' }))
  })

  test('returns cleanly when a recommended setup payload is unavailable', async () => {
    const props = callbacks()
    mocks.buildPanelPayload.mockResolvedValueOnce(payload).mockResolvedValueOnce(null)
    render(<LandingPage panels={[]} {...props} />)
    chooseAurora()
    fireEvent.click(screen.getByRole('button', { name: /Use OMIP/ }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'mock OMIP library' })).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Use recommended' }))
    await Promise.resolve()
    expect(props.onStart).not.toHaveBeenCalled()
  })

  test('covers recommended OMIP setup, no payload, cancellation, and project menu edges', async () => {
    const props = callbacks()
    const archived = panel({ id: 'archived-edge', name: 'Archived edge', archivedAt: '2026-01-03' })
    const empty = panel({ id: 'empty-edge', name: 'Empty edge', state: { ...panel().state, slots: [] } })
    render(<LandingPage panels={[panel(), archived, empty]} {...props} />)
    chooseAurora()
    fireEvent.click(screen.getByRole('button', { name: /Use OMIP/ }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'mock OMIP library' })).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Use recommended' }))
    await waitFor(() => expect(props.onStart).toHaveBeenCalledWith(expect.objectContaining({ name: 'OMIP edge template' })))
    fireEvent.click(screen.getByRole('button', { name: 'Check supported' }))
    fireEvent.click(screen.getByRole('button', { name: 'Check unsupported' }))
    fireEvent.click(screen.getByRole('button', { name: 'Use unsupported' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close OMIP' }))

    const activeCard = document.querySelector('.panel-library-card:not(.archived)') as HTMLElement
    fireEvent.contextMenu(activeCard, { clientX: 1000, clientY: 1000 })
    expect(screen.getByRole('menu', { name: 'Edge panel actions' })).not.toBeNull()
    fireEvent.pointerDown(screen.getByRole('menu', { name: 'Edge panel actions' }))
    fireEvent.keyDown(document, { key: 'Enter' })
    fireEvent.contextMenu(screen.getByRole('menu'), { clientX: 1, clientY: 1 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export project' }))
    await waitFor(() => expect(props.onExport).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Project actions for Edge panel' }))
    vi.spyOn(window, 'prompt').mockReturnValue('Edge panel')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Project actions for Edge panel' }))
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(document.querySelector('.archive-disclosure') as HTMLButtonElement)
    expect(screen.getByRole('button', { name: 'Open Archived edge' })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open Archived edge' }))
    expect(props.onOpen).toHaveBeenCalled()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: 'Project actions for Archived edge' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Project actions for Archived edge' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(props.onDelete).not.toHaveBeenCalled()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [] } })
  })

  test('surfaces saved-project action failures in the landing page', async () => {
    const props = callbacks()
    props.onArchive.mockRejectedValueOnce(new Error('archive failed'))
    render(<LandingPage panels={[panel()]} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Project actions for Edge panel' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('archive failed'))
  })

  test('renders successful and failed saved-project spectrum previews', async () => {
    const props = callbacks()
    let resolveCancelled: ((value: typeof payload) => void) | undefined
    let rejectCancelled: ((reason?: unknown) => void) | undefined
    const deferred = new Promise<typeof payload>((resolve, reject) => {
      resolveCancelled = resolve
      rejectCancelled = reject
    })
    mocks.buildPanelPayload.mockReturnValueOnce(deferred)
    const { unmount } = render(<LandingPage panels={[panel()]} {...props} />)
    await waitFor(() => expect(mocks.buildPanelPayload).toHaveBeenCalled())
    unmount()
    resolveCancelled?.(payload)
    await Promise.resolve()

    mocks.buildPanelPayload.mockReturnValueOnce(new Promise<typeof payload>((_resolve, reject) => {
      rejectCancelled = reject
    }))
    const pendingUnmount = render(<LandingPage panels={[panel({ id: 'preview-cancel-reject' })]} {...props} />)
    await waitFor(() => expect(mocks.buildPanelPayload).toHaveBeenCalledTimes(2))
    pendingUnmount.unmount()
    rejectCancelled?.(new Error('late preview failure'))
    await Promise.resolve()

    mocks.buildPanelPayload.mockResolvedValueOnce({
      ...payload,
      spectra: [...payload.spectra, { fluorophore: 'Unknown', 'V1-A': 0.4, 'B1-A': 0.2 }],
      complexity_index: 1.23,
    })
    render(<LandingPage panels={[panel({ id: 'preview-success' })]} {...props} />)
    await waitFor(() => expect(screen.getAllByLabelText('Complexity index 1.23').length).toBeGreaterThan(0))
    expect(screen.getByRole('img', { name: 'Saved panel spectrum preview' }).querySelector('path')?.getAttribute('stroke')).toBe('#157e7c')

    mocks.buildPanelPayload.mockResolvedValueOnce({ ...payload, selected: ['FITC', 'PE'], complexity_index: null })
    render(<LandingPage panels={[panel({ id: 'preview-non-identifiable', state: { ...panel().state, slots: ['FITC', 'PE'] } })]} {...props} />)
    await waitFor(() => expect(screen.getByLabelText('Complexity index Non-identifiable')).not.toBeNull())

    render(<LandingPage panels={[panel({ id: 'preview-unsupported', state: { ...panel().state, configuration: 'unknown', slots: ['FITC'] } })]} {...props} />)
    await waitFor(() => expect(screen.getByLabelText('Complexity index Unsupported setup')).not.toBeNull())

    mocks.buildPanelPayload.mockRejectedValueOnce(new Error('preview unavailable'))
    render(<LandingPage panels={[panel({ id: 'preview-error-2' })]} {...props} />)
    await waitFor(() => expect(screen.getByLabelText('Complexity index …')).not.toBeNull())
    expect(screen.getAllByLabelText('Saved panel spectrum preview').length).toBeGreaterThan(0)
  })

  test('ignores OMIP payload completion after the library closes', async () => {
    const props = callbacks()
    render(<LandingPage panels={[]} {...props} />)
    chooseAurora()
    mocks.buildPanelPayload.mockClear()
    let resolvePayload: ((value: typeof payload) => void) | undefined
    let rejectPayload: ((reason?: unknown) => void) | undefined
    const pending = new Promise<typeof payload>((resolve, reject) => {
      resolvePayload = resolve
      rejectPayload = reject
    })
    mocks.buildPanelPayload.mockReturnValueOnce(pending)
    fireEvent.click(screen.getByRole('button', { name: /Use OMIP/ }))
    await waitFor(() => expect(mocks.buildPanelPayload).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Close OMIP' }))
    resolvePayload?.(payload)
    await Promise.resolve()

    mocks.buildPanelPayload.mockClear()
    const pendingRejected = new Promise<typeof payload>((_resolve, reject) => { rejectPayload = reject })
    mocks.buildPanelPayload.mockReturnValueOnce(pendingRejected)
    fireEvent.click(screen.getByRole('button', { name: /Use OMIP/ }))
    await waitFor(() => expect(mocks.buildPanelPayload).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Close OMIP' }))
    rejectPayload?.(new Error('late OMIP failure'))
    await Promise.resolve()
  })
})
