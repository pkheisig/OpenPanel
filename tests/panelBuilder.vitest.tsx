// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ProjectState } from '../src/projectStore'

const mocks = vi.hoisted(() => ({
  buildPanelPayload: vi.fn(),
  saveActiveProject: vi.fn(async () => undefined),
  savePanelProject: vi.fn(async () => undefined),
  serializeProject: vi.fn((state: unknown) => JSON.stringify(state)),
  parseProject: vi.fn(),
  saveBlob: vi.fn(async () => undefined),
  createPanelOverviewPdf: vi.fn(() => new Blob(['pdf'], { type: 'application/pdf' })),
  openTextFile: vi.fn(),
  readTextFileWithinLimit: vi.fn(async (file: File) => file.text()),
  writeLocalStorage: vi.fn(),
  readThemePreference: vi.fn(() => 'light'),
  saveThemePreference: vi.fn(),
}))

let uniqueMarkerCounter = 0

vi.mock('../src/spectralEngine', () => ({ buildPanelPayload: mocks.buildPanelPayload }))
vi.mock('../src/projectStore', () => ({
  DEFAULT_PLOT_SCALE: 80,
  MIN_PLOT_SCALE: 40,
  MAX_PLOT_SCALE: 180,
  PROJECT_RESOURCE_LIMITS: { maxProjectFileBytes: 5 * 1024 * 1024 },
  saveActiveProject: mocks.saveActiveProject,
  savePanelProject: mocks.savePanelProject,
  serializeProject: mocks.serializeProject,
  parseProject: mocks.parseProject,
}))
vi.mock('../src/browserFiles', () => ({
  saveBlob: mocks.saveBlob,
  openTextFile: mocks.openTextFile,
  readTextFileWithinLimit: mocks.readTextFileWithinLimit,
  projectJsonFilename: (name: string) => `${name || 'Untitled'}_OpenPanel.json`,
}))
vi.mock('../src/pdfExport', () => ({ createPanelOverviewPdf: mocks.createPanelOverviewPdf }))
vi.mock('../src/browserStorage', () => ({ writeLocalStorage: mocks.writeLocalStorage }))
vi.mock('../src/themePreference', () => ({
  readThemePreference: mocks.readThemePreference,
  saveThemePreference: mocks.saveThemePreference,
}))
vi.mock('../src/PanelVisualizations', () => ({
  PanelVisualizations: ({
    setTab,
    onMarkerChange,
    error,
  }: {
    setTab: (tab: 'panel' | 'similarity' | 'signatures') => void
    onMarkerChange: (slot: number, value: string) => void
    error: string
  }) => (
    <div data-testid="mock-visualizations">
      <button type="button" onClick={() => setTab('similarity')}>Mock similarity</button>
      <button type="button" onClick={() => setTab('signatures')}>Mock signatures</button>
      <button type="button" onClick={() => onMarkerChange(0, 'CD4')}>Mock marker</button>
      <button type="button" onClick={() => onMarkerChange(0, '')}>Mock clear marker</button>
      <button type="button" onClick={() => onMarkerChange(0, `CD${++uniqueMarkerCounter}`)}>Mock unique marker</button>
      <span>{error}</span>
    </div>
  ),
}))
vi.mock('../src/PanelWizard', () => ({
  PanelWizard: ({
    onApply,
    onClose,
    onClearPanel,
    onStateChange,
  }: {
    onApply: (value: unknown) => Promise<void>
    onClose: () => void
    onClearPanel: () => Promise<void>
    onStateChange: (value: unknown) => void
  }) => {
    const [applyError, setApplyError] = React.useState('')
    return (
    <div role="dialog" aria-label="Mock panel wizard">
      <button type="button" onClick={() => void onApply({
        markers: [{ id: 'm1', slotIndex: 0, name: 'CD3', currentFluorophore: 'A' }],
        recommendations: [],
        desiredSize: 1,
      })}>Apply wizard</button>
      <button type="button" onClick={() => onStateChange({
        desiredSize: 3, markers: [
          { id: 'm1', slotIndex: 0, name: 'CD3', antigenDensity: 'medium', currentFluorophore: 'A' },
          { id: 'm2', slotIndex: 1, name: 'CD4', antigenDensity: 'high', currentFluorophore: 'C' },
        ],
        coexpression: {}, coexpressionVisited: false, coexpressionCompleted: false, inputsChanged: true,
        activeTab: 'frequency', results: null, resultMode: 'recommended', resultSort: 'recommended',
      })}>Change wizard</button>
      <button type="button" onClick={() => void onApply({
        markers: [{ id: 'm1', slotIndex: 0, name: 'CD3', currentFluorophore: '' }],
        recommendations: [], desiredSize: 2,
      }).catch((error) => {
        setApplyError(error instanceof Error ? error.message : 'The recommendations could not be applied.')
      })}>Apply padded wizard</button>
      <button type="button" onClick={() => void onApply({
        markers: [{ id: 'm1', slotIndex: 0, name: '', currentFluorophore: '' }],
        recommendations: [], desiredSize: 1,
      }).catch(() => undefined)}>Apply blank marker wizard</button>
      <button type="button" onClick={() => void onApply({
        markers: [{ id: 'm1', slotIndex: 0, name: 'CD3', currentFluorophore: '' }],
        recommendations: [{ markerId: 'm1', fluorophore: 'B' }], desiredSize: 2,
      }).catch(() => undefined)}>Apply recommended wizard</button>
      <button type="button" onClick={() => void onApply({
        markers: [{ id: 'm1', slotIndex: 0, name: 'CD3', currentFluorophore: '' }],
        recommendations: [], desiredSize: 4,
      }).catch(() => undefined)}>Apply oversized wizard</button>
      <button type="button" onClick={() => void onClearPanel()}>Wizard clear</button>
      <button type="button" onClick={onClose}>Close wizard</button>
      {applyError && <span>{applyError}</span>}
    </div>
    )
  },
}))

import PanelBuilder, {
  appendPanelSlot,
  assertPanelPayload,
  canBeginSidebarResize,
  createPanelBuilderProjectState,
  ensureBootPromise,
  filterPanelOptions,
  hasSelectedFile,
  panelErrorMessage,
  panelFilterValues,
  panelOutsideClickActions,
  popHistorySnapshot,
  reindexRemovedSlot,
  resetFileInputValue,
  resolvePanelBuilderTheme,
  runHistoryAction,
  selectorDisplayValue,
  shouldDismissClearConfirmation,
  synchronizeWizardPanelState,
  bootErrorLabel,
  shouldSkipSlotUpdate,
  trimInitialPanel,
  withSidebarResizeTarget,
} from '../src/PanelBuilder'

const basePayload = {
  cytometer: 'aurora',
  configuration: 'config',
  measurement_mode: 'spectral' as const,
  libraries: [{ id: 'aurora', label: 'Aurora', measurement_mode: 'spectral' as const }],
  configurations: [{ id: 'config', label: 'Aurora config', description: 'test' }],
  detectors: [
    { detector: 'V1-A', label: 'V1-A', laser: 'Violet', emission: 405, color: '#a21caf' },
    { detector: 'B1-A', label: 'B1-A', laser: 'Blue', emission: 488, color: '#2563eb' },
    { detector: 'R1-A', label: 'R1-A', laser: 'Red', emission: 640, color: '#ef3e36' },
  ],
  fluorophores: [
    { fluorophore: 'A', peak_detector: 'V1-A', peak_laser: 'Violet', peak_color: '#f00', mapping_confidence: 'estimated' as const, mapping_note: 'estimated' },
    { fluorophore: 'B', peak_detector: 'B1-A', peak_laser: 'Blue', peak_color: '#00f' },
    { fluorophore: 'C', peak_detector: 'R1-A', peak_laser: 'Red', peak_color: '#0f0' },
  ],
  selected: [],
  spectra: [
    { fluorophore: 'A', 'V1-A': 0.2, 'B1-A': 0.8, 'R1-A': 0.1 },
    { fluorophore: 'B', 'V1-A': 0.7, 'B1-A': 0.1, 'R1-A': 0.4 },
    { fluorophore: 'C', 'V1-A': 0.1, 'B1-A': 0.3, 'R1-A': 0.9 },
  ],
  similarity: [
    { fluorophore: 'A', A: 1, B: 0.4, C: 0.1 },
    { fluorophore: 'B', A: 0.4, B: 1, C: 0.2 },
    { fluorophore: 'C', A: 0.1, B: 0.2, C: 1 },
  ],
  complexity_index: 1.2,
  peak_detectors: ['V1-A', 'B1-A', 'R1-A'],
  max_panel_size: 3,
}

const project: ProjectState = {
  cytometer: 'aurora',
  configuration: 'config',
  theme: 'light',
  slots: ['A', ''],
  markers: { 0: 'CD3' },
  tab: 'panel',
  sidebarWidth: 214,
  sidebarCollapsed: false,
  plotScale: 80,
  plotScaleMode: 'fit-width',
  wizard: null,
  cytometerPanels: {},
}

function fileWithText(text: string): File {
  return { name: 'fixture.txt', text: async () => text } as unknown as File
}

beforeEach(() => {
  uniqueMarkerCounter = 0
  mocks.buildPanelPayload.mockReset()
  mocks.buildPanelPayload.mockImplementation(async (_cytometer: string, _configuration: string, selected: string[]) => ({
    ...basePayload,
    selected,
  }))
  mocks.parseProject.mockReset()
  mocks.parseProject.mockReturnValue({ ...project, slots: ['B', ''], markers: { 0: 'CD4' } })
  mocks.openTextFile.mockReset()
  mocks.saveBlob.mockClear()
  mocks.createPanelOverviewPdf.mockReset()
  mocks.createPanelOverviewPdf.mockImplementation(() => new Blob(['pdf'], { type: 'application/pdf' }))
  mocks.saveActiveProject.mockClear()
  mocks.savePanelProject.mockClear()
  mocks.writeLocalStorage.mockClear()
  mocks.readThemePreference.mockReturnValue('light')
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('PanelBuilder', () => {
  test('boots and exercises editing, history, resize, file actions, PDF, wizard, and clearing', async () => {
    const onRequestExit = vi.fn()
    render(<PanelBuilder initialProject={project} projectId="panel-1" projectName="My panel" onRequestExit={onRequestExit} />)
    await waitFor(() => expect(screen.getByTestId('mock-visualizations')).not.toBeNull())

    const name = screen.getByRole('textbox', { name: 'Panel name' }) as HTMLInputElement
    fireEvent.change(name, { target: { value: '' } })
    fireEvent.blur(name)
    expect(name.value).toBe('Untitled panel')
    fireEvent.change(name, { target: { value: 'Named panel' } })
    fireEvent.blur(name)
    expect(name.value).toBe('Named panel')

    fireEvent.click(screen.getByRole('button', { name: 'Mock marker' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mock marker' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mock clear marker' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mock similarity' }))
    const selectors = screen.getAllByPlaceholderText('Select fluorophore') as HTMLInputElement[]
    fireEvent.focus(selectors[1])
    fireEvent.change(selectors[1], { target: { value: 'B' } })
    fireEvent.keyDown(selectors[1], { key: 'Enter' })
    await waitFor(() => expect(mocks.buildPanelPayload).toHaveBeenCalled())
    fireEvent.focus(selectors[0])
    fireEvent.keyDown(selectors[0], { key: 'Enter' })

    const add = screen.getByRole('button', { name: /Add fluorophore row/ })
    fireEvent.click(add)
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove fluorophore row' })[0])
    await waitFor(() => expect(mocks.savePanelProject).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Undo last edit' }))
    await waitFor(() => expect(mocks.buildPanelPayload.mock.calls.length).toBeGreaterThan(1))
    fireEvent.click(screen.getByRole('button', { name: 'Redo last edit' }))
    await waitFor(() => expect(mocks.buildPanelPayload.mock.calls.length).toBeGreaterThan(2))

    const sidebarToggle = screen.getByRole('button', { name: 'Hide fluorophore sidebar' })
    fireEvent.click(sidebarToggle)
    fireEvent.click(screen.getByRole('button', { name: 'Show fluorophore sidebar' }))
    const separator = screen.getByRole('separator', { name: 'Resize fluorophore sidebar' })
    fireEvent.keyDown(separator, { key: 'Home' })
    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    fireEvent.keyDown(separator, { key: 'End' })
    fireEvent.keyDown(separator, { key: 'ArrowLeft' })
    fireEvent.keyDown(separator, { key: 'PageDown' })
    fireEvent.pointerDown(separator, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(separator, { clientX: 300, pointerId: 1 })
    fireEvent.pointerUp(separator, { clientX: 300, pointerId: 1 })
    fireEvent.mouseDown(document.body)

    fireEvent.click(screen.getByRole('button', { name: 'Decrease plot size' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase plot size' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }))

    fireEvent.keyDown(document, { key: 'Escape' })

    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Export panel/ }))
    await waitFor(() => expect(mocks.saveBlob).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Export project/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Import' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    mocks.openTextFile.mockResolvedValueOnce(fileWithText('Marker,Fluorophore\nCD4,B\n'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Import panel/ }))
    await waitFor(() => expect(mocks.buildPanelPayload.mock.calls.length).toBeGreaterThan(3))

    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    mocks.openTextFile.mockResolvedValueOnce(fileWithText('{}'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Import project/ }))
    await waitFor(() => expect(mocks.parseProject).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Export overview PDF' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Export overview PDF' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate PDF' }))
    await waitFor(() => expect(mocks.saveBlob).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Open panel wizard' }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Mock panel wizard' })).not.toBeNull())
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Change wizard' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply recommended wizard' }))
    await waitFor(() => expect(mocks.buildPanelPayload).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Apply wizard' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply blank marker wizard' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close wizard' }))

    fireEvent.click(screen.getByRole('button', { name: 'Clear project panel' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Clear project panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear panel' }))
    await waitFor(() => expect(mocks.savePanelProject).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Open panel library' }))
    await waitFor(() => expect(onRequestExit).toHaveBeenCalled())
    fireEvent.keyDown(document, { key: 'Escape' })
  })

  test('shows a boot failure, supports retry/return, and respects embedded theme', async () => {
    mocks.buildPanelPayload.mockRejectedValueOnce(new Error('bundled data unavailable'))
    const onRequestExit = vi.fn()
    render(<PanelBuilder embedded cockpitTheme="dark" onRequestExit={onRequestExit} />)
    await waitFor(() => expect(screen.getByRole('alert')).not.toBeNull())
    expect(screen.getByText('bundled data unavailable')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Return to cockpit' }))
    expect(onRequestExit).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByTestId('mock-visualizations')).not.toBeNull())
    expect(screen.queryByRole('button', { name: 'Toggle theme' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close panel builder and return to cockpit' }))
    expect(onRequestExit).toHaveBeenCalledTimes(2)
  })

  test('handles non-Error boot failures and selector/file fallbacks', async () => {
    mocks.buildPanelPayload.mockRejectedValueOnce('bundled data unavailable')
    render(<PanelBuilder initialProject={{ ...project, slots: [''] }} />)
    await waitFor(() => expect(screen.getByRole('alert')).not.toBeNull())
    expect(screen.getByText('Could not load bundled spectral libraries.')).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })

    cleanup()
    mocks.buildPanelPayload.mockResolvedValueOnce({
      ...basePayload,
      selected: [],
      fluorophores: [{ ...basePayload.fluorophores[0], peak_color: '', mapping_note: undefined }],
    })
    render(<PanelBuilder initialProject={{ ...project, slots: [''] }} projectId="selector-fallback" />)
    await waitFor(() => expect(screen.getByTestId('mock-visualizations')).not.toBeNull())
    const selector = screen.getByPlaceholderText('Select fluorophore') as HTMLInputElement
    fireEvent.focus(selector)
    fireEvent.change(selector, { target: { value: 'does-not-exist' } })
    fireEvent.keyDown(selector, { key: 'Enter' })
    fireEvent.change(selector, { target: { value: 'A' } })
    expect(screen.getByTitle('Estimated from public fluorophore emission data and detector filters.')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    let resolveText: ((text: string) => void) | undefined
    const pendingFile = {
      name: 'pending.csv',
      text: () => new Promise<string>((resolve) => { resolveText = resolve }),
    } as unknown as File
    mocks.openTextFile.mockResolvedValueOnce(pendingFile)
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Import panel/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Importing file' })).not.toBeNull())
    resolveText?.('Marker,Fluorophore\n,B\n')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Import' })).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    mocks.openTextFile.mockResolvedValueOnce(null)
    fireEvent.click(screen.getByRole('menuitem', { name: /Import panel/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    mocks.openTextFile.mockResolvedValueOnce(null)
    fireEvent.click(screen.getByRole('menuitem', { name: /Import project/ }))
  })

  test('surfaces wizard apply failures from the panel refresh', async () => {
    render(<PanelBuilder initialProject={project} />)
    await waitFor(() => expect(screen.getByTestId('mock-visualizations')).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Open panel wizard' }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Mock panel wizard' })).not.toBeNull())
    mocks.buildPanelPayload.mockRejectedValueOnce('wizard apply failed')
    fireEvent.click(screen.getByRole('button', { name: 'Apply padded wizard' }))
    await waitFor(() => expect(screen.getByText('Could not apply the panel recommendations.')).not.toBeNull())
  })

  test('keeps the clear confirmation open while clearing is in flight', async () => {
    render(<PanelBuilder initialProject={{ ...project, slots: ['A'] }} />)
    await waitFor(() => expect(screen.getByTestId('mock-visualizations')).not.toBeNull())
    let resolveClear: ((value: typeof basePayload) => void) | undefined
    const pendingClear = new Promise<typeof basePayload>((resolve) => { resolveClear = resolve })
    mocks.buildPanelPayload.mockReturnValueOnce(pendingClear)
    fireEvent.click(screen.getByRole('button', { name: 'Clear project panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear panel' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Clearing…' })).not.toBeNull()
    resolveClear?.({ ...basePayload, selected: [] })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Clear panel' })).toBeNull())
  })

  test('reports panel capacity errors and import failures without crashing', async () => {
    mocks.buildPanelPayload.mockImplementation(async (_cytometer: string, _configuration: string, selected: string[]) => ({
      ...basePayload,
      max_panel_size: 1,
      selected,
    }))
    const overfull = { ...project, slots: ['A', 'B'], markers: {} }
    render(<PanelBuilder initialProject={overfull} />)
    await waitFor(() => expect(screen.getByTestId('mock-visualizations')).not.toBeNull())
    expect(screen.getByText(/only 1 detectors/)).not.toBeNull()
    expect((screen.getByRole('button', { name: 'Open panel wizard' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    mocks.openTextFile.mockResolvedValueOnce(fileWithText('Marker,Fluorophore\nCD3,Unknown\n'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Import panel/ }))
    await waitFor(() => expect(screen.getByText(/No known fluorophores/)).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    mocks.openTextFile.mockResolvedValueOnce(fileWithText('Marker,Fluorophore\nCD3,A\nCD4,B\n'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Import panel/ }))
    await waitFor(() => expect(screen.getByText(/imported panel contains/)).not.toBeNull())
  })

  test('rejects a project with an unavailable fluorophore without applying partial state', async () => {
    render(<PanelBuilder initialProject={{ ...project, slots: ['A', ''] }} />)
    await waitFor(() => expect(screen.getByTestId('mock-visualizations')).not.toBeNull())
    mocks.parseProject.mockReturnValueOnce({ ...project, slots: ['A', 'Unknown dye'], markers: { 0: 'CD3', 1: 'CD4' } })
    mocks.openTextFile.mockResolvedValueOnce(fileWithText('{}'))
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Import project/ }))
    await waitFor(() => expect(screen.getByText(/OpenPanel project import rejected/)).not.toBeNull())
    expect(document.body.textContent).toContain('1 color')
  })

  test('covers conventional rendering, embedded persistence, no-op actions, and empty exports', async () => {
    const conventional = { ...basePayload, cytometer: 'fortessa', configuration: 'fortessa_3l', measurement_mode: 'conventional' as const,
      detectors: basePayload.detectors.map((detector, index) => ({ ...detector, emission: [530, 585, 670][index] })), max_panel_size: 3 }
    mocks.buildPanelPayload.mockResolvedValue(conventional)
    const { rerender } = render(<PanelBuilder embedded cockpitTheme="dark" initialCytometer="fortessa" initialConfiguration="fortessa_3l" initialProject={{ ...project, cytometer: 'fortessa', configuration: 'fortessa_3l', slots: ['A', '', ''], cytometerPanels: {} }} />)
    await waitFor(() => expect(screen.getByTestId('mock-visualizations')).not.toBeNull())
    expect(screen.queryByRole('button', { name: 'Toggle theme' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Mock similarity' }))
    const selector = screen.getAllByPlaceholderText('Select fluorophore')[0]
    fireEvent.focus(selector)
    fireEvent.keyDown(selector, { key: 'Escape' })
    fireEvent.mouseEnter(selector.parentElement?.parentElement as HTMLElement)
    fireEvent.mouseLeave(selector.parentElement?.parentElement as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Clear project panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear project panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear panel' }))
    await waitFor(() => expect(mocks.saveActiveProject).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Export panel/ }))
    expect(screen.getByText(/Select at least one fluorophore/)).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Export overview PDF' }))
    expect(screen.getByText(/Select at least one fluorophore/)).not.toBeNull()
    rerender(<PanelBuilder initialProject={{ ...project, slots: [] }} />)
    await waitFor(() => expect(screen.getByTestId('mock-visualizations')).not.toBeNull())
    const hiddenInputs = document.querySelectorAll('input[type="file"]')
    fireEvent.change(hiddenInputs[0], { target: { files: [] } })
    fireEvent.change(hiddenInputs[1], { target: { files: [] } })
  })

  test('covers wizard synchronization, unique edit history, option clicks, and resize cleanup', async () => {
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => true)
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    render(<PanelBuilder initialProject={{ ...project, slots: ['A', ''], markers: {} }} />)
    await waitFor(() => expect(screen.getByTestId('mock-visualizations')).not.toBeNull())

    const pointerSeparator = screen.getByRole('separator', { name: 'Resize fluorophore sidebar' })
    fireEvent.pointerDown(pointerSeparator, { clientX: 100, pointerId: 11 })
    fireEvent.pointerMove(pointerSeparator, { clientX: 140, pointerId: 11 })
    fireEvent.pointerMove(pointerSeparator, { clientX: 160, pointerId: 11 })
    fireEvent.pointerUp(pointerSeparator, { clientX: 140, pointerId: 11 })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })
    fireEvent.pointerDown(pointerSeparator, { clientX: 100, pointerId: 12 })
    fireEvent.pointerMove(pointerSeparator, { clientX: 120, pointerId: 12 })
    fireEvent.pointerUp(pointerSeparator, { clientX: 120, pointerId: 12 })

    fireEvent.click(screen.getByRole('button', { name: 'Open panel wizard' }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Mock panel wizard' })).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Change wizard' }))
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Open panel wizard' }))
    fireEvent.pointerOver(screen.getByRole('button', { name: 'Open panel wizard' }))
    fireEvent.focusIn(screen.getByRole('button', { name: 'Open panel wizard' }))
    const selectors = screen.getAllByPlaceholderText('Select fluorophore') as HTMLInputElement[]
    fireEvent.focus(selectors[1])
    fireEvent.change(selectors[1], { target: { value: 'C' } })
    const option = await waitFor(() => {
      const element = document.querySelector('.fluor-dropdown .fluor-option')
      if (!element) throw new Error('fluorophore option not rendered')
      return element as HTMLElement
    })
    fireEvent.mouseDown(option)
    fireEvent.click(option)
    await waitFor(() => expect(mocks.buildPanelPayload.mock.calls.length).toBeGreaterThan(1))
    fireEvent.focus(selectors[0])
    fireEvent.keyDown(selectors[0], { key: 'Enter' })

    fireEvent.click(screen.getByRole('button', { name: 'Close wizard' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove fluorophore row' })[0])

    for (let index = 0; index < 102; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Mock unique marker' }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Add fluorophore row' }))
    mocks.buildPanelPayload.mockRejectedValueOnce('remove failed string')
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove fluorophore row' })[1])
    await waitFor(() => expect(screen.getByText('Could not update panel.')).not.toBeNull())
    const redo = screen.getByRole('button', { name: 'Redo last edit' }) as HTMLButtonElement
    mocks.buildPanelPayload.mockRejectedValue('restore failed string')
    fireEvent.click(screen.getByRole('button', { name: 'Undo last edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo last edit' }))
    await waitFor(() => expect(screen.getByText('Could not restore panel edit.')).not.toBeNull())
    mocks.buildPanelPayload.mockImplementation(async (_cytometer: string, _configuration: string, selected: string[]) => ({ ...basePayload, selected }))
    redo.removeAttribute('disabled')
    fireEvent.click(redo)
    fireEvent.click(redo)
    fireEvent.keyDown(document, { key: 'Escape' })
  })

  test('covers disabled guard paths, clear/PDF/import fallbacks, and modal interactions', async () => {
    const projectWithNoContent = { ...project, slots: [], markers: {} }
    render(<PanelBuilder initialProject={projectWithNoContent} />)
    await waitFor(() => expect(screen.getByTestId('mock-visualizations')).not.toBeNull())

    const undo = screen.getByRole('button', { name: 'Undo last edit' }) as HTMLButtonElement
    const redo = screen.getByRole('button', { name: 'Redo last edit' }) as HTMLButtonElement
    undo.removeAttribute('disabled')
    redo.removeAttribute('disabled')
    fireEvent.click(undo)
    fireEvent.click(redo)

    const add = screen.getByRole('button', { name: /Add fluorophore row/ }) as HTMLButtonElement
    add.removeAttribute('disabled')
    fireEvent.click(add)
    add.removeAttribute('disabled')
    fireEvent.click(add)
    fireEvent.click(screen.getByRole('button', { name: 'Open panel wizard' }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Mock panel wizard' })).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Wizard clear' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close wizard' }))

    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    mocks.openTextFile.mockResolvedValueOnce(fileWithText('Marker,Fluorophore\nCD3,A\n'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Import panel/ }))
    await waitFor(() => expect(mocks.buildPanelPayload).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    mocks.openTextFile.mockResolvedValueOnce(fileWithText('Marker,Fluorophore\n,B\n'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Import panel/ }))
    await waitFor(() => expect(mocks.buildPanelPayload).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    mocks.parseProject.mockImplementationOnce(() => { throw 'bad project' })
    mocks.openTextFile.mockResolvedValueOnce(fileWithText('{}'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Import project/ }))
    await waitFor(() => expect(screen.getByText('Could not import this OpenPanel project.')).not.toBeNull())
  })

  test('covers import capacity/errors and PDF confirmation cancel/error handling', async () => {
    mocks.buildPanelPayload.mockImplementation(async (_cytometer: string, _configuration: string, selected: string[]) => ({
      ...basePayload, selected, max_panel_size: 1,
    }))
    render(<PanelBuilder initialProject={{ ...project, slots: ['A'] }} />)
    await waitFor(() => expect(screen.getByTestId('mock-visualizations')).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    mocks.parseProject.mockReturnValueOnce({ ...project, slots: ['A', 'B'], markers: {} })
    mocks.openTextFile.mockResolvedValueOnce(fileWithText('{}'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Import project/ }))
    await waitFor(() => expect(screen.getByText(/only 1 detectors/)).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Open panel wizard' }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Mock panel wizard' })).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Apply oversized wizard' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close wizard' }))

    fireEvent.click(screen.getByRole('button', { name: 'Export overview PDF' }))
    const overlay = document.querySelector('.panel-confirm-overlay') as HTMLElement
    const modal = document.querySelector('.panel-confirm-modal') as HTMLElement
    fireEvent.mouseDown(modal)
    fireEvent.mouseDown(overlay)
    fireEvent.click(screen.getByRole('button', { name: 'Export overview PDF' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Export overview PDF' }))
    mocks.createPanelOverviewPdf.mockImplementationOnce(() => { throw new Error('PDF failed') })
    fireEvent.click(screen.getByRole('button', { name: 'Generate PDF' }))
    await waitFor(() => expect(screen.getByText('PDF failed')).not.toBeNull())
  })

  test('covers idle preloading, update/clear fallback errors, and null project imports', async () => {
    const idleCallback = vi.fn((callback: IdleRequestCallback) => {
      callback({ didTimeout: false, timeRemaining: () => 1 } as IdleDeadline)
      return 1
    })
    vi.stubGlobal('requestIdleCallback', idleCallback)
    vi.stubGlobal('cancelIdleCallback', vi.fn())
    render(<PanelBuilder initialProject={{ ...project, slots: ['A', ''] }} />)
    await waitFor(() => expect(screen.getByTestId('mock-visualizations')).not.toBeNull())
    await new Promise((resolve) => setTimeout(resolve, 700))
    await waitFor(() => expect(mocks.saveActiveProject).toHaveBeenCalled())

    const selectors = screen.getAllByPlaceholderText('Select fluorophore') as HTMLInputElement[]
    mocks.buildPanelPayload.mockRejectedValueOnce(new Error('update failed'))
    fireEvent.focus(selectors[1])
    fireEvent.change(selectors[1], { target: { value: 'B' } })
    fireEvent.keyDown(selectors[1], { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('update failed')).not.toBeNull())
    mocks.buildPanelPayload.mockRejectedValueOnce('update failed string')
    fireEvent.focus(selectors[1])
    fireEvent.change(selectors[1], { target: { value: 'C' } })
    fireEvent.keyDown(selectors[1], { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('Could not update panel.')).not.toBeNull())

    mocks.buildPanelPayload.mockRejectedValueOnce('clear failed string')
    fireEvent.click(screen.getByRole('button', { name: 'Clear project panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear panel' }))
    await waitFor(() => expect(screen.getByText('Could not clear the panel.')).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    mocks.parseProject.mockReturnValueOnce({ ...project, slots: ['A'] })
    mocks.buildPanelPayload.mockResolvedValueOnce(null)
    mocks.openTextFile.mockResolvedValueOnce(fileWithText('{}'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Import project/ }))
    await waitFor(() => expect(mocks.parseProject).toHaveBeenCalled())
  })

  test('covers delayed persistence rejection, stale refreshes, and null project payloads', async () => {
    mocks.saveActiveProject.mockRejectedValueOnce(new Error('delayed persistence failed'))
    render(<PanelBuilder initialProject={{ ...project, slots: ['A', ''] }} />)
    await waitFor(() => expect(screen.getByTestId('mock-visualizations')).not.toBeNull())
    await new Promise((resolve) => setTimeout(resolve, 650))

    let resolveStale: ((value: typeof basePayload) => void) | undefined
    const stale = new Promise<typeof basePayload>((resolve) => { resolveStale = resolve })
    mocks.buildPanelPayload.mockClear()
    mocks.buildPanelPayload.mockImplementationOnce(() => stale)
    mocks.buildPanelPayload.mockImplementationOnce(async (_cytometer: string, _configuration: string, selected: string[]) => ({ ...basePayload, selected }))
    const selectors = screen.getAllByPlaceholderText('Select fluorophore') as HTMLInputElement[]
    for (const value of ['B', 'C']) {
      fireEvent.focus(selectors[1])
      fireEvent.change(selectors[1], { target: { value } })
      fireEvent.keyDown(selectors[1], { key: 'Enter' })
    }
    await waitFor(() => expect(mocks.buildPanelPayload).toHaveBeenCalledTimes(2))
    resolveStale?.(basePayload)

    let rejectStale: ((reason?: unknown) => void) | undefined
    const staleRejected = new Promise<typeof basePayload>((_resolve, reject) => { rejectStale = reject })
    mocks.buildPanelPayload.mockClear()
    mocks.buildPanelPayload.mockImplementationOnce(() => staleRejected)
    mocks.buildPanelPayload.mockImplementationOnce(async (_cytometer: string, _configuration: string, selected: string[]) => ({ ...basePayload, selected }))
    for (const value of ['B', 'C']) {
      fireEvent.focus(selectors[1])
      fireEvent.change(selectors[1], { target: { value } })
      fireEvent.keyDown(selectors[1], { key: 'Enter' })
    }
    await waitFor(() => expect(mocks.buildPanelPayload).toHaveBeenCalledTimes(2))
    rejectStale?.(new Error('stale failure'))
    await Promise.resolve()

    mocks.parseProject.mockReturnValueOnce({ ...project, slots: ['A'] })
    mocks.buildPanelPayload.mockResolvedValueOnce(null)
    mocks.openTextFile.mockResolvedValueOnce(fileWithText('{}'))
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Import project/ }))
    await waitFor(() => expect(mocks.parseProject).toHaveBeenCalled())
  })

  test('covers panel builder pure guards and normalization helpers', async () => {
    expect(resolvePanelBuilderTheme(true, 'dark', 'light')).toBe('dark')
    expect(resolvePanelBuilderTheme(false, 'dark', 'light')).toBe('light')
    expect(createPanelBuilderProjectState(
      'aurora', 'config', 'light', ['A'], { 0: 'CD3' }, 'panel', 214, false, 80, null, {},
    )).toMatchObject({ cytometer: 'aurora', configuration: 'config', slots: ['A'], markers: { 0: 'CD3' } })
    expect(synchronizeWizardPanelState(null, ['A'])).toBeNull()
    const wizard = {
      desiredSize: 3,
      markers: [{ id: 'm1', slotIndex: 0, name: 'CD3', antigenDensity: 'medium', currentFluorophore: 'A' }],
      coexpression: {}, coexpressionVisited: false, coexpressionCompleted: false,
      activeTab: 'frequency', results: {
        recommended: { kind: 'recommended', rows: [], alternatives: [] },
        bestFit: { kind: 'best-fit', rows: [], alternatives: [] },
      }, resultMode: 'recommended', resultSort: 'recommended',
    } as never
    expect(synchronizeWizardPanelState(wizard, ['A'])).toBeNull()
    expect(synchronizeWizardPanelState(wizard, ['B'], undefined, true)?.results).toBeNull()
    expect(synchronizeWizardPanelState(wizard, ['A'], 0, false)?.desiredSize).toBe(1)
    expect(panelFilterValues({}, [], 4)).toEqual({ query: '', currentSlot: '' })
    const boot = vi.fn(async () => undefined)
    const existingBoot = Promise.resolve(undefined)
    expect(ensureBootPromise(null, boot)).not.toBeNull()
    expect(ensureBootPromise(existingBoot, boot)).toBe(existingBoot)
    expect(boot).toHaveBeenCalledTimes(1)
    expect(panelOutsideClickActions(null, false)).toEqual({ clearActiveSlot: false, clearFileMenu: false })
    expect(panelOutsideClickActions(document.body, false)).toEqual({ clearActiveSlot: true, clearFileMenu: true })
    const selectorRow = document.createElement('div')
    selectorRow.className = 'selector-row'
    document.body.append(selectorRow)
    expect(panelOutsideClickActions(selectorRow, true)).toEqual({ clearActiveSlot: false, clearFileMenu: false })
    expect(shouldDismissClearConfirmation(false)).toBe(true)
    expect(shouldDismissClearConfirmation(true)).toBe(false)
    expect(hasSelectedFile(null)).toBe(false)
    expect(hasSelectedFile(fileWithText(''))).toBe(true)
    const input = document.createElement('input')
    input.value = 'stale'
    resetFileInputValue(input)
    resetFileInputValue(null)
    expect(input.value).toBe('')
    expect(bootErrorLabel('')).toContain('bundled spectral data')
    expect(bootErrorLabel('specific failure')).toBe('specific failure')
    expect(selectorDisplayValue(null, 0, {}, 'A')).toBe('A')
    expect(selectorDisplayValue(0, 0, {}, 'A')).toBe('A')
    expect(selectorDisplayValue(0, 0, { 0: 'B' }, 'A')).toBe('B')
    expect(reindexRemovedSlot(2, 1)).toBe(1)
    expect(reindexRemovedSlot(1, 1)).toBe(1)
    selectorRow.remove()
    expect(shouldSkipSlotUpdate(['A', 'B'], 0, 'B')).toBe(true)
    expect(shouldSkipSlotUpdate(['A', 'B'], 0, 'A')).toBe(true)
    expect(shouldSkipSlotUpdate(['A', 'B'], 0, 'C')).toBe(false)
    expect(shouldSkipSlotUpdate(['Alexa Fluor 488', ''], 1, 'AF488')).toBe(true)
    expect(panelErrorMessage(new Error('message'), 'fallback')).toBe('message')
    expect(panelErrorMessage('unknown', 'fallback')).toBe('fallback')
    const history = [1]
    expect(popHistorySnapshot(true, history)).toBeNull()
    expect(popHistorySnapshot(false, history)).toBe(1)
    expect(popHistorySnapshot(false, history)).toBeNull()
    const historyAction = vi.fn()
    await runHistoryAction(true, [1], historyAction)
    await runHistoryAction(false, [1], historyAction)
    expect(historyAction).toHaveBeenCalledWith(1)
    expect(assertPanelPayload(basePayload as never)).toBe(basePayload)
    expect(() => assertPanelPayload(null)).toThrow('Panel data is not ready.')
    expect(filterPanelOptions(null, '', new Set(), '')).toEqual([])
    expect(filterPanelOptions(basePayload as never, 'B', new Set(['A']), '')[0].fluorophore).toBe('B')
    expect(canBeginSidebarResize(true, document.body)).toBe(false)
    expect(canBeginSidebarResize(false, null)).toBe(false)
    expect(canBeginSidebarResize(false, document.body)).toBe(true)
    const resizeReady = vi.fn()
    withSidebarResizeTarget(true, document.body, resizeReady)
    withSidebarResizeTarget(false, null, resizeReady)
    withSidebarResizeTarget(false, document.body, resizeReady)
    expect(resizeReady).toHaveBeenCalledWith(document.body)
    const capacityError = vi.fn()
    const appended = vi.fn()
    appendPanelSlot(basePayload as never, ['A', 'B', 'C'], capacityError, appended)
    expect(appended).not.toHaveBeenCalled()
    expect(capacityError).toHaveBeenCalledWith('The selected configuration supports a maximum of 3 colors because it has 3 detectors.')
    appendPanelSlot(basePayload as never, ['A'], capacityError, appended)
    appendPanelSlot(null, [], capacityError, appended)
    expect(appended).toHaveBeenNthCalledWith(1, ['A', ''])
    expect(appended).toHaveBeenNthCalledWith(2, [''])
    expect(trimInitialPanel(['A', '', 'B'], { 0: 'CD3', 2: 'CD4' }, 2)).toEqual({
      slots: ['A', ''], markers: { 0: 'CD3' },
    })
    expect(trimInitialPanel(['A', 'B'], {}, 1)).toBeNull()
    expect(trimInitialPanel(['A'], {}, 2)).toBeNull()
  })
})
