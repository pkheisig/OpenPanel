// @vitest-environment jsdom
import React, { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  entriesForLaser,
  observeSpectrumPlot,
  PanelVisualizations,
  resolveSpectrumHover,
  withSpectrumPlotResizeTarget,
} from '../src/PanelVisualizations'
import type { DetectorInfo, NumericRow, PanelPayload } from '../src/panelBuilderShared'
import { responseMatrixProvenance } from '../src/panelBuilderShared'

vi.mock('../src/SpectrumBandPlot', () => ({
  SpectrumBandPlot: ({ fluorophore }: { fluorophore: string }) => (
    <div data-testid={`signature-${fluorophore}`}>signature {fluorophore}</div>
  ),
}))

const detectors: DetectorInfo[] = [
  { detector: 'V1-A', label: 'V1-A', laser: 'Violet', emission: 405, color: '#a21caf' },
  { detector: 'B1-A', label: 'B1-A', laser: 'Blue', emission: 488, color: '#2563eb' },
]

const rows: NumericRow[] = [
  { fluorophore: 'A', 'V1-A': 0.2, 'B1-A': 0.8 },
  { fluorophore: 'B', 'V1-A': 0.7, 'B1-A': 0.1 },
]

const payload = {
  cytometer: 'aurora',
  configuration: 'config',
  measurement_mode: 'spectral',
  libraries: [{ id: 'aurora', label: 'Aurora', measurement_mode: 'spectral' }],
  configurations: [{ id: 'config', label: 'Aurora config', description: 'test' }],
  detectors,
  fluorophores: [
    { fluorophore: 'A', peak_detector: 'V1-A', peak_laser: 'Violet', peak_color: '#f00' },
    { fluorophore: 'B', peak_detector: 'B1-A', peak_laser: 'Blue', peak_color: '#00f' },
  ],
  selected: ['A', 'B'],
  spectra: rows,
  similarity: [
    { fluorophore: 'A', A: 1, B: 0.4 },
    { fluorophore: 'B', A: 0.4, B: 1 },
  ],
  collinearity: {
    endmembers: ['A', 'B'],
    gramMatrix: [[1, 0.4], [0.4, 1]],
    hotspotMatrix: [[1.09, 0.69], [0.69, 1.09]],
    sifByEndmember: [1.09, 1.09],
    maxSif: 1.09,
    maxSifEndmember: 'A',
    rank: 2,
    singularValues: [1.4, 0.6],
    status: 'ok',
  },
  complexity_index: 1.23,
  peak_detectors: ['V1-A', 'B1-A'],
  max_panel_size: 4,
} as unknown as PanelPayload

// eslint-disable-next-line react-refresh/only-export-components -- test fixture component intentionally lives with its assertions
function Wrapper({
  initialTab = 'panel',
  selected = ['A', 'B', 'Missing'],
  mode = 'spectral',
  selectedEntries = [
    { fluor: 'A', slotIndex: 0, marker: 'CD3', color: '#f00', peakLaser: 'Violet', peakEmission: 405 },
    { fluor: 'B', slotIndex: 1, marker: '', color: '#00f', peakLaser: 'Blue', peakEmission: 488 },
  ],
  emissions = mode === 'conventional' ? [405, 488, 600] : [405, 488],
  lasers = ['Violet', 'Blue'],
  hoveredFluor = null,
  colors,
}: {
  initialTab?: 'panel' | 'similarity' | 'signatures'
  selected?: string[]
  mode?: 'spectral' | 'conventional'
  selectedEntries?: Array<{ fluor: string; slotIndex: number; marker: string; color: string; peakLaser: string; peakEmission: number }>
  emissions?: number[]
  lasers?: string[]
  hoveredFluor?: string | null
  colors?: Map<string, string>
}) {
  const [tab, setTab] = useState<typeof initialTab>(initialTab)
  const [scale, setScale] = useState(100)
  const activePayload = mode === 'conventional'
    ? {
      ...payload,
      cytometer: 'fortessa',
      measurement_mode: 'conventional' as const,
      response_provenance: responseMatrixProvenance('synthetic_filter_proxy'),
    }
    : payload
  return (
    <PanelVisualizations
      payload={activePayload}
      selected={selected}
      selectedEntries={selectedEntries}
      emissions={emissions}
      lasers={lasers}
      tab={tab}
      setTab={setTab}
      onMarkerChange={vi.fn()}
      spectraByName={new Map(rows.map((row) => [row.fluorophore, row]))}
      similarityByName={new Map(payload.similarity.map((row) => [row.fluorophore, row]))}
      colorByFluor={colors ?? new Map([['A', '#f00'], ['B', '#00f']])}
      hoveredFluor={hoveredFluor}
      theme="light"
      error="A recoverable panel warning"
      plotScale={scale}
      onPlotScaleChange={setScale}
    />
  )
}

beforeEach(() => {
  HTMLElement.prototype.scrollTo = vi.fn()
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

describe('PanelVisualizations', () => {
  test('handles an unavailable plot ref and measures a mounted plot', () => {
    const onWidth = vi.fn()
    expect(observeSpectrumPlot(null, onWidth)).toBeUndefined()
    const plot = document.createElement('div')
    vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 420, top: 0, bottom: 200, width: 420, height: 200,
      x: 0, y: 0, toJSON: () => ({}),
    })
    const stopObserving = observeSpectrumPlot(plot, onWidth)
    stopObserving?.()
    expect(onWidth).toHaveBeenCalledWith(420)
    const onReady = vi.fn()
    withSpectrumPlotResizeTarget(null, onReady)
    withSpectrumPlotResizeTarget(plot, onReady)
    expect(onReady).toHaveBeenCalledWith(plot)
  })

  test('resolves hover and laser-entry fallbacks', () => {
    expect(resolveSpectrumHover(null, 'B')).toBe('B')
    expect(resolveSpectrumHover(undefined as never, 'B')).toBe('B')
    expect(resolveSpectrumHover({ fluor: 'A' }, 'B')).toBe('A')
    expect(entriesForLaser(new Map([['Violet', [{ id: 1 }]]]), 'Violet')).toEqual([{ id: 1 }])
    expect(entriesForLaser(new Map([['Violet', [{ id: 1 }]]]), 'Blue')).toEqual([])
  })

  test('renders panel matrix, tooltips, marker edits, tabs, and conventional labels', () => {
    const { container } = render(<Wrapper selected={['A', 'B']} />)
    expect(screen.getByRole('img', { name: 'Combined spectra' })).not.toBeNull()
    expect(screen.getByText('A recoverable panel warning')).not.toBeNull()
    expect(screen.getAllByRole('separator')).toHaveLength(2)
    const marker = screen.getByDisplayValue('CD3') as HTMLInputElement
    fireEvent.change(marker, { target: { value: 'CD4' } })

    const hit = container.querySelector('.spectrum-hit-target') as SVGPathElement
    fireEvent.pointerEnter(hit, { clientX: 95, clientY: 20 })
    expect(screen.getByRole('tooltip').textContent).toContain('A')
    fireEvent.pointerMove(hit, { clientX: 20, clientY: 40 })
    fireEvent.pointerLeave(hit)
    expect(screen.queryByRole('tooltip')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'SIMILARITY' }))
    expect(screen.getByText('0.40')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Hotspot' }))
    expect(screen.getAllByText('1.09')).toHaveLength(2)
    expect(screen.getByText('Max SIF 1.09 · A')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'SPECTRA' }))
    expect(screen.getByTestId('signature-A')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'PANEL' }))
    expect(screen.getByDisplayValue('CD3')).not.toBeNull()

    cleanup()
    const { unmount } = render(<Wrapper mode="conventional" />)
    expect(screen.getByRole('img', { name: 'Combined detector peaks' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'PEAKS' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Hotspot' })).toBeNull()
    unmount()
  })

  test('supports empty tabs and keyboard/pointer plot resizing', () => {
    render(<Wrapper selected={[]} initialTab="similarity" />)
    expect(screen.getByText('Select fluorophores to calculate similarity.')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'SPECTRA' }))
    expect(screen.getByText('Select fluorophores to view spectra.')).not.toBeNull()

    cleanup()
    render(<Wrapper />)
    const [left, right] = screen.getAllByRole('separator')
    fireEvent.keyDown(left, { key: 'ArrowRight' })
    fireEvent.keyDown(left, { key: 'ArrowLeft' })
    fireEvent.keyDown(right, { key: 'ArrowRight' })
    fireEvent.keyDown(right, { key: 'ArrowLeft' })
    fireEvent.keyDown(right, { key: 'Home' })
    fireEvent.keyDown(right, { key: 'End' })
    fireEvent.keyDown(right, { key: 'PageDown' })

    fireEvent.pointerDown(right, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(right, { clientX: 180, pointerId: 1 })
    fireEvent.pointerUp(right, { clientX: 180, pointerId: 1 })
    fireEvent.pointerDown(left, { clientX: 100, pointerId: 2 })
    fireEvent.pointerCancel(left, { clientX: 40, pointerId: 2 })
  })

  test('tracks measured width, deferred pointer resizing, and occupied impossible cells', () => {
    const observers: Array<() => void> = []
    class Observer {
      constructor(private readonly callback: ResizeObserverCallback) { observers.push(() => callback([], this as unknown as ResizeObserver)) }
      observe = vi.fn()
      disconnect = vi.fn()
    }
    vi.stubGlobal('ResizeObserver', Observer)
    let queued: FrameRequestCallback | null = null
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queued = callback
      return 7
    })
    const { container } = render(<Wrapper />)
    const shell = container.querySelector('.spectrum-plot-shell') as HTMLDivElement
    vi.spyOn(shell, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 600, top: 0, bottom: 240, width: 600, height: 240,
      x: 0, y: 0, toJSON: () => ({}),
    })
    observers.forEach((notify) => { notify(); notify() })
    const right = screen.getByRole('separator', { name: 'Resize spectrum plot from right edge' })
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => true)
    fireEvent.pointerDown(right, { clientX: 100, pointerId: 9 })
    fireEvent.pointerMove(right, { clientX: 120, pointerId: 9 })
    fireEvent.pointerMove(right, { clientX: 140, pointerId: 9 })
    expect(queued).not.toBeNull()
    fireEvent.pointerUp(right, { clientX: 140, pointerId: 9 })
    expect(vi.mocked(window.cancelAnimationFrame)).toHaveBeenCalledWith(7)
    fireEvent.pointerDown(screen.getByRole('separator', { name: 'Resize spectrum plot from left edge' }), { clientX: 100, pointerId: 10 })
    fireEvent.pointerMove(screen.getByRole('separator', { name: 'Resize spectrum plot from left edge' }), { clientX: 80, pointerId: 10 })
    fireEvent.pointerCancel(screen.getByRole('separator', { name: 'Resize spectrum plot from left edge' }), { clientX: 80, pointerId: 10 })

    cleanup()
    render(<Wrapper selected={['A', 'B']} hoveredFluor="B" lasers={['Violet', 'Unlisted']} />)
    expect(screen.getByRole('img', { name: 'Combined spectra' })).not.toBeNull()

    cleanup()
    render(
      <Wrapper
        selected={['A', 'A2']}
        selectedEntries={[
          { fluor: 'A', slotIndex: 0, marker: 'CD3', color: '#f00', peakLaser: 'Violet', peakEmission: 300 },
          { fluor: 'A2', slotIndex: 1, marker: 'CD4', color: '#0f0', peakLaser: 'Violet', peakEmission: 300 },
        ]}
        emissions={[300]}
      />,
    )
    expect(document.querySelectorAll('.matrix-marker-input')).toHaveLength(0)
    expect(document.querySelectorAll('.impossible-region')).toHaveLength(4)
  })

  test('falls back to the default spectrum color when a selected dye has no color mapping', () => {
    const { container } = render(<Wrapper selected={['A']} colors={new Map()} />)
    expect((container.querySelector('.spectrum-visible-line') as SVGPathElement).getAttribute('stroke')).toBe('#2688e8')
  })
})
