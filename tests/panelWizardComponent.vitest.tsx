// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PanelWizard } from '../src/PanelWizard'
import { responseMatrixProvenance } from '../src/panelBuilderShared'

const mocks = vi.hoisted(() => ({
  buildPanelPayload: vi.fn(),
  loadReferences: vi.fn(),
  generateResults: vi.fn(),
  isAllowed: vi.fn(() => true),
}))

vi.mock('../src/spectralEngine', () => ({ buildPanelPayload: mocks.buildPanelPayload }))
vi.mock('../src/panelWizardReferences', () => ({
  loadPanelWizardReferences: mocks.loadReferences,
  fluorophoreBrightnessKey: (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ''),
}))
vi.mock('../src/panelWizardEngine', () => ({
  coexpressionKey: (left: string, right: string) => [left, right].sort().join('::'),
  antigenDensityScore: (value: string) => ({ low: 20, medium: 55, high: 90 }[value] ?? 55),
  generateWizardResults: mocks.generateResults,
  isWizardFluorophoreAllowed: mocks.isAllowed,
}))

const resultRows = [
  {
    markerId: 'marker-0', markerName: 'CD3', slotIndex: 0, antigenDensity: 'medium' as const,
    fluorophore: 'FITC', brightnessLevel: 3, isExisting: true, peakLaser: 'Blue', spectralFit: 90,
    recommendedScore: 88, maxSimilarity: 0.2, closestFluorophore: 'PE', complexityDelta: 0.04,
    availabilityScore: 100, availabilityTier: 'Very common' as const, availabilityConfidence: 'Curated' as const,
  },
  {
    markerId: 'marker-1', markerName: 'CD4', slotIndex: 1, antigenDensity: 'high' as const,
    fluorophore: 'PE', brightnessLevel: null, isExisting: false, peakLaser: 'Blue', spectralFit: 80,
    recommendedScore: 72, maxSimilarity: 0.91, closestFluorophore: '', complexityDelta: -0.02,
    availabilityScore: 100, availabilityTier: 'Very common' as const, availabilityConfidence: 'Curated' as const,
  },
]

const wizardResults = {
  recommended: {
    kind: 'recommended' as const,
    rows: resultRows,
    alternatives: [{ ...resultRows[1], markerId: undefined, markerName: undefined, slotIndex: undefined, antigenDensity: undefined, fluorophore: 'APC' }],
    complexity: 1.2,
    previousComplexity: 1.1,
    maxSimilarity: 0.91,
    spectralRisk: 2,
    averageAvailability: 88,
  },
  bestFit: {
    kind: 'best-fit' as const,
    rows: resultRows.map((row) => ({ ...row, recommendedScore: row.recommendedScore - 4 })),
    alternatives: [],
    complexity: 1.05,
    previousComplexity: 1.1,
    maxSimilarity: 0.7,
    spectralRisk: 1,
    averageAvailability: 92,
  },
}

const basePayload = {
  cytometer: 'aurora',
  configuration: 'config',
  measurement_mode: 'spectral' as const,
  libraries: [],
  configurations: [],
  detectors: [{ detector: 'B1-A', label: 'B1-A', laser: 'Blue', emission: 488, color: '#2563eb' }],
  fluorophores: ['FITC', 'PE', 'APC'].map((fluorophore) => ({
    fluorophore, peak_detector: 'B1-A', peak_laser: 'Blue', peak_color: '#2563eb',
  })),
  selected: [],
  spectra: [],
  similarity: [],
  complexity_index: 1,
  peak_detectors: [],
  max_panel_size: 3,
}

beforeEach(() => {
  mocks.buildPanelPayload.mockReset()
  mocks.buildPanelPayload.mockResolvedValue(basePayload)
  mocks.loadReferences.mockReset()
  mocks.loadReferences.mockResolvedValue({
    brightnessByFluorophore: { fitc: 3, pe: 5 },
    antigenDensityByContext: {},
    markerOptions: [
      { value: '', label: 'Select marker' },
      { value: 'CD3', label: 'CD3' },
      { value: 'CD4', label: 'CD4' },
      { value: 'Live/Dead', label: 'Live/Dead' },
    ],
  })
  mocks.generateResults.mockReset()
  mocks.generateResults.mockReturnValue(wizardResults)
  mocks.isAllowed.mockReset()
  mocks.isAllowed.mockReturnValue(true)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderWizard(overrides: Partial<React.ComponentProps<typeof PanelWizard>> = {}) {
  const onStateChange = vi.fn()
  const onClearPanel = vi.fn(async () => undefined)
  const onClose = vi.fn()
  const onApply = vi.fn(async () => undefined)
  const view = render(
    <PanelWizard
      cytometer="aurora"
      configuration="config"
      configurationLabel="Aurora 5L: UV/V/B"
      availableFluorophores={['FITC', 'PE', 'APC']}
      maxPanelSize={3}
      measurementMode="spectral"
      slots={['FITC', '']}
      markerNames={{ 0: 'CD3' }}
      theme="light"
      initialState={null}
      onStateChange={onStateChange}
      onClearPanel={onClearPanel}
      onClose={onClose}
      onApply={onApply}
      {...overrides}
    />,
  )
  return { onStateChange, onClearPanel, onClose, onApply, ...view }
}

describe('PanelWizard component', () => {
  test('walks marker setup, co-expression, recommendations, sorting, and applying', async () => {
    const { onApply, onClose } = renderWizard()
    await waitFor(() => expect(mocks.loadReferences).toHaveBeenCalled())

    const marker2 = screen.getByRole('combobox', { name: 'Marker 2 name' })
    fireEvent.click(marker2)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search or enter marker' }), { target: { value: 'CD4' } })
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search or enter marker' }), { key: 'Enter' })
    const density2 = screen.getByRole('combobox', { name: 'Antigen density for marker 2' })
    fireEvent.click(density2)
    fireEvent.click(screen.getByRole('option', { name: 'High' }))

    fireEvent.click(screen.getByRole('button', { name: 'Increase panel size' }))
    fireEvent.click(screen.getByRole('button', { name: 'Decrease panel size' }))
    fireEvent.click(screen.getByRole('button', { name: /Co-expression/ }))
    expect(screen.getByRole('table', { name: '' })).not.toBeNull()
    const coexpression = screen.getAllByRole('button', { name: /co-expression:/ })[0]
    fireEvent.click(coexpression)
    fireEvent.click(screen.getByRole('button', { name: 'Auto-fill' }))
    expect(screen.getByRole('dialog', { name: 'Auto-fill co-expression' })).not.toBeNull()
    fireEvent.click(screen.getByRole('combobox', { name: 'Species' }))
    fireEvent.click(screen.getByRole('option', { name: 'Mouse' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Tissue' }))
    fireEvent.click(screen.getByRole('option', { name: 'Tumor' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Population' }))
    fireEvent.click(screen.getByRole('option', { name: 'T cells' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Condition' }))
    fireEvent.click(screen.getByRole('option', { name: 'Inflammatory' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fill matrix' }))

    fireEvent.click(screen.getByRole('button', { name: /Recommendations/ }))
    expect(screen.getByRole('button', { name: 'Calculate recommendations' })).not.toBeNull()
    await waitFor(() => expect((screen.getByRole('button', { name: 'Calculate recommendations' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Calculate recommendations' }))
    await waitFor(() => expect(screen.getByText('Recommended')).not.toBeNull(), { timeout: 2_000 })
    expect(mocks.generateResults).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Best spectral fit' }))

    const sort = screen.getByRole('combobox', { name: 'Sort ranked colors' })
    for (const label of ['Spectral fit', 'Availability', 'Lowest spectral similarity', 'Lowest complexity impact', 'Antigen density', 'Recommended score']) {
      fireEvent.click(sort)
      fireEvent.click(screen.getByRole('option', { name: label }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'How recommendation score is calculated' }))
    fireEvent.click(screen.getByText(/Other fluorophores/))
    fireEvent.click(screen.getByRole('button', { name: 'Recalculate' }))
    await waitFor(() => expect(mocks.generateResults).toHaveBeenCalledTimes(2), { timeout: 2_000 })
    fireEvent.click(screen.getByRole('button', { name: /Apply 2-color panel/ }))
    await waitFor(() => expect(onApply).toHaveBeenCalled())
    expect(onClose).toHaveBeenCalled()
  })

  test('covers clear confirmation, dialog escape, setup reset, and calculation/apply errors', async () => {
    const onClearPanel = vi.fn(async () => undefined)
    const onClose = vi.fn()
    const onApply = vi.fn(async () => { throw new Error('apply failed') })
    renderWizard({ onClearPanel, onClose, onApply })
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByRole('button', { name: 'Clear panel' })).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Clear panel' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear panel' }))
    await waitFor(() => expect(onClearPanel).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /Co-expression/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Auto-fill' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Auto-fill co-expression' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close panel wizard' }))
    expect(onClose).toHaveBeenCalled()

    cleanup()
    mocks.buildPanelPayload.mockRejectedValueOnce(new Error('calculation failed'))
    renderWizard({
      slots: ['', ''],
      markerNames: {},
      onApply: vi.fn(async () => { throw new Error('apply failed') }),
    })
    const marker1 = screen.getByRole('combobox', { name: 'Marker 1 name' })
    fireEvent.click(marker1)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search or enter marker' }), { target: { value: 'CD3' } })
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search or enter marker' }), { key: 'Enter' })
    const marker2 = screen.getByRole('combobox', { name: 'Marker 2 name' })
    fireEvent.click(marker2)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search or enter marker' }), { target: { value: 'CD4' } })
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search or enter marker' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: /Co-expression/ }))
    fireEvent.click(screen.getByRole('button', { name: /Recommendations/ }))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Calculate recommendations' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Calculate recommendations' }))
    await waitFor(() => expect(screen.getByRole('alert')).not.toBeNull(), { timeout: 2_000 })
    expect(screen.getByRole('alert').textContent).toContain('calculation failed')
  })

  test('surfaces bundled reference failures and clears stale results', async () => {
    mocks.loadReferences.mockRejectedValueOnce(new Error('panel_wizard_brightness.csv: malformed reference data'))
    renderWizard({
      slots: ['FITC', 'PE'], markerNames: { 0: 'CD3', 1: 'CD4' },
      initialState: {
        desiredSize: 2,
        markers: [
          { id: 'marker-0', slotIndex: 0, name: 'CD3', antigenDensity: 'medium', currentFluorophore: 'FITC' },
          { id: 'marker-1', slotIndex: 1, name: 'CD4', antigenDensity: 'high', currentFluorophore: 'PE' },
        ],
        coexpression: {}, coexpressionVisited: true, coexpressionCompleted: true,
        activeTab: 'recommendations', results: wizardResults, resultMode: 'recommended', resultSort: 'recommended', inputsChanged: true,
      },
    })
    await waitFor(() => expect(screen.getByRole('alert')).not.toBeNull())
    expect(screen.getByRole('alert').textContent).toContain('panel_wizard_brightness.csv')
    expect(mocks.generateResults).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Apply 2-color panel/ })).toBeNull()
  })

  test('retries reference loading from an in-wizard failure', async () => {
    mocks.loadReferences.mockRejectedValueOnce(new Error('panel_wizard_brightness.csv: temporary failure'))
    renderWizard({
      slots: ['FITC', 'PE'],
      markerNames: { 0: 'CD3', 1: 'CD4' },
      initialState: {
        desiredSize: 2,
        markers: [
          { id: 'marker-0', slotIndex: 0, name: 'CD3', antigenDensity: 'medium', currentFluorophore: 'FITC' },
          { id: 'marker-1', slotIndex: 1, name: 'CD4', antigenDensity: 'high', currentFluorophore: 'PE' },
        ],
        coexpression: {}, coexpressionVisited: true, coexpressionCompleted: true,
        activeTab: 'recommendations', results: null, resultMode: 'recommended', resultSort: 'recommended', inputsChanged: true,
      },
    })

    await waitFor(() => expect(screen.getByRole('alert')).not.toBeNull())
    const retry = screen.getByRole('button', { name: 'Retry loading reference data' })
    fireEvent.click(retry)
    await waitFor(() => expect(mocks.loadReferences).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect((screen.getByRole('button', { name: 'Calculate recommendations' }) as HTMLButtonElement).disabled).toBe(false)
  })

  test('clears calculation state when the cytometer context changes', async () => {
    let resolvePayload: ((payload: typeof basePayload) => void) | undefined
    mocks.buildPanelPayload.mockImplementationOnce(() => new Promise<typeof basePayload>((resolve) => {
      resolvePayload = resolve
    }))

    function ContextHarness() {
      const [cytometer, setCytometer] = React.useState('aurora')
      const initialState = {
        desiredSize: 2,
        markers: [
          { id: 'marker-0', slotIndex: 0, name: 'CD3', antigenDensity: 'medium' as const, currentFluorophore: 'FITC' },
          { id: 'marker-1', slotIndex: 1, name: 'CD4', antigenDensity: 'high' as const, currentFluorophore: 'PE' },
        ],
        coexpression: {}, coexpressionVisited: true, coexpressionCompleted: true,
        activeTab: 'recommendations' as const, results: null, resultMode: 'recommended' as const,
        resultSort: 'recommended' as const, inputsChanged: true,
      }
      return (
        <>
          <button type="button" onClick={() => setCytometer((current) => current === 'aurora' ? 'discover' : 'aurora')}>
            Switch cytometer context
          </button>
          <PanelWizard
            cytometer={cytometer}
            configuration="config"
            configurationLabel="Aurora 5L: UV/V/B"
            availableFluorophores={['FITC', 'PE', 'APC']}
            maxPanelSize={3}
            measurementMode="spectral"
            slots={['FITC', 'PE']}
            markerNames={{ 0: 'CD3', 1: 'CD4' }}
            theme="light"
            initialState={initialState}
            onStateChange={vi.fn()}
            onClearPanel={vi.fn(async () => undefined)}
            onClose={vi.fn()}
            onApply={vi.fn(async () => undefined)}
          />
        </>
      )
    }

    render(<ContextHarness />)
    await waitFor(() => expect(mocks.loadReferences).toHaveBeenCalledTimes(1))
    const calculate = () => screen.getByRole('button', { name: 'Calculate recommendations' }) as HTMLButtonElement
    await waitFor(() => expect(calculate().disabled).toBe(false))
    fireEvent.click(calculate())
    await waitFor(() => expect(screen.getByRole('button', { name: /Calculating panels/ })).not.toBeNull())
    await waitFor(() => expect(mocks.buildPanelPayload).toHaveBeenCalled())

    const switchContext = screen.getByRole('button', { name: 'Switch cytometer context' })
    fireEvent.click(switchContext)
    await waitFor(() => expect(mocks.loadReferences).toHaveBeenCalledTimes(2))
    fireEvent.click(switchContext)
    await waitFor(() => expect(mocks.loadReferences).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(calculate().disabled).toBe(false))

    resolvePayload?.(basePayload)
  })

  test('clears completed results when the cytometer context changes', async () => {
    function ContextHarness() {
      const [cytometer, setCytometer] = React.useState('aurora')
      const initialState = {
        desiredSize: 2,
        markers: [
          { id: 'marker-0', slotIndex: 0, name: 'CD3', antigenDensity: 'medium' as const, currentFluorophore: 'FITC' },
          { id: 'marker-1', slotIndex: 1, name: 'CD4', antigenDensity: 'high' as const, currentFluorophore: 'PE' },
        ],
        coexpression: {}, coexpressionVisited: true, coexpressionCompleted: true,
        activeTab: 'recommendations' as const, results: wizardResults, resultMode: 'recommended' as const,
        resultSort: 'recommended' as const, inputsChanged: true,
      }
      return (
        <>
          <button type="button" onClick={() => setCytometer('discover')}>Switch completed result context</button>
          <PanelWizard
            cytometer={cytometer}
            configuration="config"
            configurationLabel="Aurora 5L: UV/V/B"
            availableFluorophores={['FITC', 'PE', 'APC']}
            maxPanelSize={3}
            measurementMode="spectral"
            slots={['FITC', 'PE']}
            markerNames={{ 0: 'CD3', 1: 'CD4' }}
            theme="light"
            initialState={initialState}
            onStateChange={vi.fn()}
            onClearPanel={vi.fn(async () => undefined)}
            onClose={vi.fn()}
            onApply={vi.fn(async () => undefined)}
          />
        </>
      )
    }

    render(<ContextHarness />)
    await waitFor(() => expect(screen.getByText('Complexity')).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Switch completed result context' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Calculate recommendations' })).not.toBeNull())
    expect(screen.queryByText('Complexity')).toBeNull()
  })

  test('keeps the clear confirmation open while clearing is in progress', async () => {
    let resolveClear: (() => void) | undefined
    const onClearPanel = vi.fn(() => new Promise<void>((resolve) => { resolveClear = resolve }))
    renderWizard({ onClearPanel })
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear panel' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Clearing…' })).toBeTruthy())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Clearing…' })).toBeTruthy()
    resolveClear?.()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Clearing…' })).toBeNull())
  })

  test('renders existing results, conventional wording, and template imports', async () => {
    renderWizard({
      cytometer: 'fortessa',
      measurementMode: 'conventional',
      responseProvenance: responseMatrixProvenance('synthetic_filter_proxy'),
      initialState: {
        desiredSize: 2,
        markers: [
          { id: 'marker-0', slotIndex: 0, name: 'CD3', antigenDensity: 'medium', currentFluorophore: 'FITC' },
          { id: 'marker-1', slotIndex: 1, name: 'CD4', antigenDensity: 'high', currentFluorophore: 'PE' },
        ],
        coexpression: {}, coexpressionVisited: true, coexpressionCompleted: true,
        activeTab: 'recommendations', results: wizardResults, resultMode: 'recommended', resultSort: 'recommended',
      },
    })
    await waitFor(() => expect(screen.getByText('Recommended')).not.toBeNull())
    expect(screen.getByText(/detector-peak overlap/)).not.toBeNull()
    const sort = screen.getByRole('combobox', { name: 'Sort ranked colors' })
    fireEvent.click(sort)
    expect(screen.getByRole('option', { name: 'Detector-peak fit' })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'About panel wizard calculations' }))
    fireEvent.click(screen.getByRole('button', { name: 'Recommended' }))
    fireEvent.click(screen.getByRole('button', { name: 'Best detector-peak fit' }))
    expect(screen.getByText('Best detector-peak fit')).not.toBeNull()

    cleanup()
    renderWizard({
      initialTemplate: {
        markers: [{ name: 'CD3', fluorophore: 'FITC' }, { name: 'CD4', fluorophore: 'PE' }],
        context: { species: 'human', tissue: 'pbmc', population: 'all', condition: 'baseline' },
      },
    })
    expect(screen.getByText('Marker setup')).not.toBeNull()
  })

  test('covers direct controls, invalid existing colors, and dialog cleanup', async () => {
    const { onClose } = renderWizard()
    await waitFor(() => expect(mocks.loadReferences).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /Marker setup/ }))
    const size = screen.getByRole('spinbutton', { name: 'Panel size' })
    fireEvent.change(size, { target: { value: '2' } })
    fireEvent.change(size, { target: { value: '0' } })
    fireEvent.change(size, { target: { value: '1' } })
    fireEvent.change(size, { target: { value: '2' } })
    fireEvent.change(size, { target: { value: '2' } })
    const color = screen.getByRole('combobox', { name: 'Color for marker 1' })
    fireEvent.click(color)
    expect(screen.getByRole('option', { name: 'FITC' })).not.toBeNull()
    fireEvent.click(screen.getByRole('option', { name: 'FITC' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: /Co-expression/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Auto-fill' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()

    cleanup()
    mocks.isAllowed.mockReturnValue(false)
    renderWizard({
      initialState: {
        desiredSize: 1,
        markers: [{ id: 'marker-0', slotIndex: 0, name: '', antigenDensity: 'medium', currentFluorophore: 'FITC' }],
        coexpression: {}, coexpressionVisited: false, coexpressionCompleted: false,
        activeTab: 'frequency', results: null, resultMode: 'recommended', resultSort: 'recommended',
      },
      slots: ['FITC'], markerNames: { 0: 'CD3' },
    })
    expect(screen.getByRole('combobox', { name: 'Color for marker 1' })).not.toBeNull()
    fireEvent.click(screen.getByRole('combobox', { name: 'Marker 1 name' }))
    fireEvent.click(screen.getByRole('option', { name: 'CD4' }))
    cleanup()
    renderWizard({
      initialState: {
        desiredSize: 1,
        markers: [{ id: 'marker-0', slotIndex: 0, name: 'CD3', antigenDensity: 'medium', currentFluorophore: 'FITC' }],
        coexpression: {}, coexpressionVisited: false, coexpressionCompleted: false,
        activeTab: 'frequency', results: null, resultMode: 'recommended', resultSort: 'recommended',
      },
      slots: ['FITC'], markerNames: { 0: 'CD3' },
    })
    expect(screen.getByRole('combobox', { name: 'Color for marker 1' }).textContent).not.toContain('FITC')
  })

  test('covers calculation and apply fallback errors plus template fallback assignment', async () => {
    mocks.isAllowed.mockReturnValue(true)
    const template = {
      id: 'template', name: 'Template', summary: '', sourceUrl: '',
      context: { species: 'human' as const, tissue: 'pbmc' as const, population: 'all' as const, condition: 'baseline' as const },
      markers: [{ name: '', fluorophore: 'FITC' }, { name: 'CD4', fluorophore: 'FITC' }],
    }
    renderWizard({
      initialTemplate: { ...template, markers: [undefined as never, { name: 'CD4' }] },
      slots: [undefined as never, undefined as never], markerNames: {},
    })
    expect(screen.getByText('Marker setup')).not.toBeNull()
    cleanup()

    mocks.buildPanelPayload.mockRejectedValueOnce('calculation failed')
    renderWizard({
      slots: ['FITC', 'PE'], markerNames: { 0: 'CD3', 1: 'CD4' },
      initialState: {
        desiredSize: 2,
        markers: [
          { id: 'marker-0', slotIndex: 0, name: 'CD3', antigenDensity: 'medium', currentFluorophore: 'FITC' },
          { id: 'marker-1', slotIndex: 1, name: 'CD4', antigenDensity: 'high', currentFluorophore: 'PE' },
        ],
        coexpression: {}, coexpressionVisited: true, coexpressionCompleted: true,
        activeTab: 'recommendations', results: null, resultMode: 'recommended', resultSort: 'recommended', inputsChanged: true,
      },
    })
    await waitFor(() => expect((screen.getByRole('button', { name: 'Calculate recommendations' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Calculate recommendations' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('The panel recommendations could not be calculated.'))

    cleanup()
    const rejectingApply = vi.fn(async () => { throw 'apply failed' })
    renderWizard({
      onApply: rejectingApply,
      slots: ['FITC', 'PE'], markerNames: { 0: 'CD3', 1: 'CD4' },
      initialState: {
        desiredSize: 2,
        markers: [
          { id: 'marker-0', slotIndex: 0, name: 'CD3', antigenDensity: 'medium', currentFluorophore: 'FITC' },
          { id: 'marker-1', slotIndex: 1, name: 'CD4', antigenDensity: 'high', currentFluorophore: 'PE' },
        ],
        coexpression: {}, coexpressionVisited: true, coexpressionCompleted: true,
        activeTab: 'recommendations', results: wizardResults, resultMode: 'recommended', resultSort: 'recommended', inputsChanged: true,
      },
    })
    await waitFor(() => expect((screen.getByRole('button', { name: /Apply 2-color panel/ }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /Apply 2-color panel/ }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('The recommendations could not be applied.'))

    cleanup()
    const errorApply = vi.fn(async () => { throw new Error('apply failed with Error') })
    renderWizard({
      onApply: errorApply,
      slots: ['FITC', 'PE'], markerNames: { 0: 'CD3', 1: 'CD4' },
      initialState: {
        desiredSize: 2,
        markers: [
          { id: 'marker-0', slotIndex: 0, name: 'CD3', antigenDensity: 'medium', currentFluorophore: 'FITC' },
          { id: 'marker-1', slotIndex: 1, name: 'CD4', antigenDensity: 'high', currentFluorophore: 'PE' },
        ],
        coexpression: {}, coexpressionVisited: true, coexpressionCompleted: true,
        activeTab: 'recommendations', results: wizardResults, resultMode: 'recommended', resultSort: 'recommended', inputsChanged: true,
      },
    })
    await waitFor(() => expect((screen.getByRole('button', { name: /Apply 2-color panel/ }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /Apply 2-color panel/ }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('apply failed with Error'))

    cleanup()
    const edgeResults = {
      ...wizardResults,
      recommended: {
        ...wizardResults.recommended,
        rows: [{ ...resultRows[0], markerName: '', closestFluorophore: 'FITC', complexityDelta: 0.2 }, resultRows[1]],
        alternatives: [{ ...resultRows[1], fluorophore: 'APC', closestFluorophore: 'PE', complexityDelta: 0.2 }],
      },
    }
    renderWizard({
      slots: ['FITC', 'PE'], markerNames: { 0: 'CD3', 1: 'CD4' },
      initialState: {
        desiredSize: 2,
        markers: [
          { id: 'marker-0', slotIndex: 0, name: 'CD3', antigenDensity: 'medium', currentFluorophore: 'FITC' },
          { id: 'marker-1', slotIndex: 1, name: 'CD4', antigenDensity: 'high', currentFluorophore: 'PE' },
        ],
        coexpression: {}, coexpressionVisited: true, coexpressionCompleted: true,
        activeTab: 'recommendations', results: edgeResults, resultMode: 'recommended', resultSort: 'recommended', inputsChanged: true,
      },
    })
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByText('Other fluorophores'))
  })

  test('shows the unchanged-setup calculation explanation', () => {
    renderWizard({
      slots: ['FITC', undefined as never], markerNames: { 0: 'CD3', 1: '' },
      initialState: {
        desiredSize: 2,
        markers: [
          { id: 'marker-0', slotIndex: 0, name: 'CD3', antigenDensity: 'medium', currentFluorophore: 'FITC' },
          { id: 'marker-1', slotIndex: 1, name: '', antigenDensity: 'high', currentFluorophore: '' },
        ],
        coexpression: {}, coexpressionVisited: true, coexpressionCompleted: true,
        activeTab: 'recommendations', results: null, resultMode: 'recommended', resultSort: 'recommended', inputsChanged: false,
      },
    })
    expect(document.querySelector('#wizard-calculation-unavailable')?.textContent).toContain('This setup already matches the project')
    expect((screen.getByRole('button', { name: 'Calculate recommendations' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('blocks stale recommendation navigation and calculation while locked', async () => {
    renderWizard()
    const recommendations = screen.getByRole('button', { name: /Recommendations/ }) as HTMLButtonElement
    expect(recommendations.disabled).toBe(true)
    recommendations.removeAttribute('disabled')
    recommendations.disabled = false
    fireEvent.click(recommendations)
    expect(screen.getByText('Marker setup')).not.toBeNull()

    cleanup()
    mocks.buildPanelPayload.mockClear()
    renderWizard({
      slots: ['FITC', 'PE'],
      markerNames: { 0: 'CD3', 1: 'CD4' },
      initialState: {
        desiredSize: 2,
        markers: [
          { id: 'marker-0', slotIndex: 0, name: 'CD3', antigenDensity: 'medium', currentFluorophore: 'FITC' },
          { id: 'marker-1', slotIndex: 1, name: 'CD4', antigenDensity: 'high', currentFluorophore: 'PE' },
        ],
        coexpression: {}, coexpressionVisited: false, coexpressionCompleted: false,
        activeTab: 'recommendations', results: null, resultMode: 'recommended', resultSort: 'recommended', inputsChanged: true,
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Calculate recommendations' }))
    await waitFor(() => expect(mocks.buildPanelPayload).not.toHaveBeenCalled())
  })
})
