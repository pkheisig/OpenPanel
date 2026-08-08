// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ClearPanelConfirmation } from '../src/ClearPanelConfirmation'
import { DetectorSpectrumAxis } from '../src/DetectorSpectrumAxis'
import { ModuleLoadingState } from '../src/ModuleLoadingState'
import {
  canvasPixelRatio,
  drawMountedSpectrum,
  drawSpectrum,
  observeMountedSpectrum,
  releaseMountedSpectrum,
  SpectrumBandPlot,
} from '../src/SpectrumBandPlot'
import {
  chooseUiSelectOption,
  positionPortalMenu,
  positionPortalMenuFromRoot,
  UiSelect,
  uiSelectPortalTarget,
} from '../src/UiSelect'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const options = [
  { value: '', label: 'Choose one' },
  { value: 'alpha', label: 'Alpha' },
  { value: 'beta', label: 'Beta' },
]

describe('UiSelect', () => {
  test('guards detached option and portal-menu references', () => {
    const onChoose = vi.fn()
    chooseUiSelectOption([], 0, onChoose)
    chooseUiSelectOption([{ value: 'a', label: 'A' }], 0, onChoose)
    expect(onChoose).toHaveBeenCalledWith({ value: 'a', label: 'A' })
    const setStyle = vi.fn()
    positionPortalMenu(null, null, { width: 800, height: 600 }, setStyle)
    positionPortalMenuFromRoot(null, null, { width: 800, height: 600 }, setStyle)
    const trigger = document.createElement('button')
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      left: 10, right: 110, top: 10, bottom: 50, width: 100, height: 40,
      x: 10, y: 10, toJSON: () => ({}),
    })
    positionPortalMenu(trigger, null, { width: 800, height: 600 }, setStyle)
    const root = document.createElement('div')
    root.appendChild(trigger)
    positionPortalMenuFromRoot(root, null, { width: 800, height: 600 }, setStyle)
    expect(setStyle).toHaveBeenCalled()
  })

  test('chooses a containing panel root or the document body for portals', () => {
    const shell = document.createElement('div')
    shell.className = 'panel-builder'
    const child = document.createElement('button')
    shell.appendChild(child)
    document.body.appendChild(shell)
    expect(uiSelectPortalTarget(child)).toBe(shell)
    const bare = document.createElement('button')
    expect(uiSelectPortalTarget(bare)).toBe(document.body)
    shell.remove()
  })
  test('opens, chooses options, and supports trigger and option keyboard navigation', () => {
    const onChange = vi.fn()
    render(<UiSelect label="Mode" options={options} value="alpha" onChange={onChange} />)
    const trigger = screen.getByRole('combobox', { name: 'Mode' })
    expect(trigger.textContent).toContain('Alpha')
    fireEvent.click(trigger)
    expect(screen.getByRole('listbox')).not.toBeNull()
    expect(screen.getAllByRole('option')).toHaveLength(3)
    fireEvent.click(trigger)
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('option', { name: 'Beta' }))
    expect(onChange).toHaveBeenCalledWith('beta')

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('listbox')).not.toBeNull()
    const beta = screen.getByRole('option', { name: 'Beta' })
    fireEvent.keyDown(beta, { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('option', { name: 'Choose one' }), { key: 'ArrowUp' })
    fireEvent.keyDown(screen.getByRole('option', { name: 'Alpha' }), { key: 'Home' })
    fireEvent.keyDown(screen.getByRole('option', { name: 'Choose one' }), { key: 'End' })
    fireEvent.keyDown(screen.getByRole('option', { name: 'Beta' }), { key: ' ' })
    expect(onChange).toHaveBeenCalledWith('beta')
  })

  test('supports searchable ranking, custom values, empty results, and escape focus restore', () => {
    const onChange = vi.fn()
    const manyOptions = Array.from({ length: 130 }, (_, index) => ({ value: `option-${index}`, label: `Option ${index}` }))
    render(<UiSelect label="Search" options={manyOptions} value="option-129" onChange={onChange} searchable allowCustomValue />)
    const trigger = screen.getByRole('combobox', { name: 'Search' })
    fireEvent.click(trigger)
    const search = screen.getByRole('searchbox', { name: 'Search options' })
    expect(screen.getAllByRole('option').length).toBeLessThanOrEqual(120)
    fireEvent.change(search, { target: { value: 'brand-new' } })
    expect(screen.getByRole('option', { name: 'Use “brand-new”' })).not.toBeNull()
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('brand-new')

    fireEvent.click(trigger)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search options' }), { target: { value: 'option-1' } })
    expect(screen.getByRole('option', { name: 'Option 1' })).not.toBeNull()
    fireEvent.pointerDown(screen.getByRole('listbox'))

    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search options' }), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search options' }), { key: 'ArrowUp' })
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search options' }), { key: 'Escape' })
    expect(document.activeElement).toBe(trigger)

    render(<UiSelect label="Empty" options={[]} value="" onChange={onChange} searchable />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Empty' }))
    expect(screen.getByText('No matching options')).not.toBeNull()
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search options' }), { key: 'Enter' })
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search options' }), { key: 'Tab' })
  })

  test('handles non-navigation trigger keys without opening a non-portal menu', () => {
    const onChange = vi.fn()
    render(<UiSelect label="Plain" options={options} value="" onChange={onChange} />)
    const trigger = screen.getByRole('combobox', { name: 'Plain' })
    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('listbox')).not.toBeNull()
    fireEvent.keyDown(screen.getByRole('option', { name: 'Choose one' }), { key: 'Tab' })
  })

  test('closes on outside pointer and supports portal positioning', () => {
    const onChange = vi.fn()
    const { container } = render(
      <div className="launch-screen">
        <UiSelect label="Portal" options={options} value="" onChange={onChange} portalMenu />
      </div>,
    )
    const trigger = screen.getByRole('combobox', { name: 'Portal' })
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      left: 20, right: 120, top: 700, bottom: 740, width: 100, height: 40,
      x: 20, y: 700, toJSON: () => ({}),
    })
    fireEvent.click(trigger)
    expect(container.querySelector('.ui-select-options.is-portal')).not.toBeNull()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  test('resolves lazy options and supports custom portal roots and option escape', () => {
    const onChange = vi.fn()
    const resolveOptions = vi.fn(() => options)
    render(
      <div className="panel-builder">
        <UiSelect label="Lazy" options={resolveOptions} value="alpha" onChange={onChange} portalMenu allowCustomValue />
      </div>,
    )
    const trigger = screen.getByRole('combobox', { name: 'Lazy' })
    fireEvent.keyDown(trigger, { key: 'ArrowUp' })
    expect(resolveOptions).toHaveBeenCalled()
    const beta = screen.getByRole('option', { name: 'Beta' })
    fireEvent.keyDown(beta, { key: 'Escape' })
    expect(document.activeElement).toBe(trigger)
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('option', { name: 'Alpha' }), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('alpha')
  })

  test('covers empty navigation, searchable trigger opening, and upward portal placement', () => {
    const onChange = vi.fn()
    render(<UiSelect label="Searchable" options={options} value="" onChange={onChange} searchable />)
    const searchableTrigger = screen.getByRole('combobox', { name: 'Searchable' })
    fireEvent.keyDown(searchableTrigger, { key: 'ArrowDown' })
    expect(screen.getByRole('searchbox')).not.toBeNull()
    cleanup()

    render(<UiSelect label="Empty keyboard" options={[]} value="" onChange={onChange} searchable />)
    const emptyTrigger = screen.getByRole('combobox', { name: 'Empty keyboard' })
    fireEvent.click(emptyTrigger)
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'ArrowUp' })
    cleanup()

    const { container } = render(<UiSelect label="Bare portal" options={options} value="" onChange={onChange} portalMenu hideLabel menuClassName="custom-menu" />)
    const portalTrigger = container.querySelector('[role="combobox"]') as HTMLButtonElement
    vi.spyOn(portalTrigger, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 100, top: 700, bottom: 740, width: 100, height: 40,
      x: 0, y: 700, toJSON: () => ({}),
    })
    const offsetHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 300 })
    fireEvent.keyDown(portalTrigger, { key: 'ArrowDown' })
    expect(document.body.querySelector('.ui-select-options.is-portal.custom-menu')).not.toBeNull()
    fireEvent(window, new Event('resize'))
    fireEvent(window, new Event('scroll'))
    if (offsetHeightDescriptor) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeightDescriptor)
  })
})

describe('small presentational components', () => {
  test('renders loading state for both themes', () => {
    const { rerender } = render(<ModuleLoadingState label="Loading project" />)
    expect(screen.getByRole('status', { name: 'Loading project' }).classList.contains('theme-light')).toBe(true)
    rerender(<ModuleLoadingState label="Loading dark" theme="dark" />)
    expect(screen.getByRole('status', { name: 'Loading dark' }).classList.contains('theme-dark')).toBe(true)
    rerender(<ModuleLoadingState label="Loading default" theme={null} />)
    expect(screen.getByRole('status', { name: 'Loading default' }).classList.contains('theme-light')).toBe(true)
  })

  test('confirms or cancels panel clearing and blocks backdrop cancellation while busy', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const { rerender } = render(<ClearPanelConfirmation onCancel={onCancel} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear panel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const backdrop = screen.getByRole('presentation')
    fireEvent.pointerDown(backdrop)
    expect(onCancel).toHaveBeenCalledTimes(2)
    rerender(<ClearPanelConfirmation busy onCancel={onCancel} onConfirm={onConfirm} />)
    expect((screen.getByRole('button', { name: 'Clearing…' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.pointerDown(screen.getByRole('presentation'))
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  test('renders detector axis empty and populated states', () => {
    const baseProps = {
      cytometer: 'xenith', xForIndex: (index: number) => 50 + index * 60,
      left: 50, right: 170, plotTop: 10, baselineY: 100,
      gridColor: '#ddd', axisColor: '#111', textColor: '#222', gradientId: 'gradient-test',
    }
    const { container, rerender } = render(<svg><DetectorSpectrumAxis {...baseProps} entries={[]} /></svg>)
    expect(container.querySelector('.detector-spectrum-axis')).toBeNull()
    rerender(<svg><DetectorSpectrumAxis {...baseProps} entries={[{ detector: 'UV1-A' }, { detector: 'V1-A', label: 'V1-A' }]} /></svg>)
    expect(container.querySelectorAll('.detector-spectrum-axis > g')).toHaveLength(4)
    expect(container.querySelectorAll('stop')).toHaveLength(2)
    expect(container.querySelectorAll('.detector-laser-band')).toHaveLength(2)
    rerender(<svg><DetectorSpectrumAxis {...baseProps} cytometer={undefined} entries={[{ detector: 'B1-A' }]} /></svg>)
    expect(container.querySelectorAll('.detector-laser-band')).toHaveLength(1)
  })

  test('draws eager and lazy canvas spectrum plots', () => {
    const context = {
      setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(),
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fillText: vi.fn(),
      save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1,
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
    const observe = vi.fn()
    const disconnect = vi.fn()
    const callbacks: IntersectionObserverCallback[] = []
    class Observer {
      constructor(private readonly callback: IntersectionObserverCallback) { callbacks.push(callback) }
      observe = observe
      disconnect = disconnect
      trigger(entry: Partial<IntersectionObserverEntry>) { this.callback([entry as IntersectionObserverEntry], this as unknown as IntersectionObserver) }
    }
    vi.stubGlobal('IntersectionObserver', Observer)
    const row = { 'V1-A': 0.3, 'B1-A': 0.8 }
    const detectors = [
      { detector: 'V1-A', label: 'V1-A', laser: 'Violet', emission: 450, color: '#fff' },
      { detector: 'B1-A', label: 'B1-A', laser: 'Blue', emission: 530, color: '#fff' },
    ]
    const { rerender } = render(<SpectrumBandPlot fluorophore="PE" row={row} detectors={detectors} chartWidth={640} theme="light" eager />)
    expect(context.fillRect).toHaveBeenCalled()
    rerender(<SpectrumBandPlot fluorophore="PE" row={row} detectors={detectors} chartWidth={640} theme="dark" />)
    expect(observe).toHaveBeenCalled()
    callbacks[0]?.([{ isIntersecting: false } as IntersectionObserverEntry] as IntersectionObserverEntry[], {} as IntersectionObserver)
    callbacks[0]?.([{ isIntersecting: true } as IntersectionObserverEntry] as IntersectionObserverEntry[], {} as IntersectionObserver)
    rerender(<SpectrumBandPlot fluorophore="PE" row={row} detectors={detectors} chartWidth={640} theme="dark" eager />)
    expect(context.clearRect).toHaveBeenCalled()
    expect(disconnect).toHaveBeenCalled()
  })

  test('draws without an observer, handles empty detectors, and tolerates a missing canvas context', () => {
    const context = {
      setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(),
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fillText: vi.fn(),
      save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1,
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
    vi.stubGlobal('IntersectionObserver', undefined)
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 4 })
    const row = { fluorophore: 'Empty' }
    const { rerender } = render(<SpectrumBandPlot fluorophore="Empty" row={row} detectors={[]} chartWidth={320} theme="light" />)
    expect(context.setTransform).toHaveBeenCalledWith(3, 0, 0, 3, 0, 0)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    rerender(<SpectrumBandPlot fluorophore="Empty" row={row} detectors={[]} chartWidth={320} theme="dark" eager />)
    expect(screen.getByRole('img', { name: 'Empty spectrum' })).not.toBeNull()
  })

  test('covers server pixel fallback, zero device ratio, and direct canvas drawing guards', () => {
    const previousWindow = globalThis.window
    vi.stubGlobal('window', undefined)
    expect(canvasPixelRatio()).toBe(1)
    vi.stubGlobal('window', previousWindow)
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 0 })
    expect(canvasPixelRatio()).toBe(2)
    const canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'getContext').mockReturnValue(null)
    drawMountedSpectrum(null, { fluorophore: 'A' }, [], 320, 'light')
    releaseMountedSpectrum(null)
    const observer = { observe: vi.fn() } as unknown as IntersectionObserver
    observeMountedSpectrum(null, observer)
    observeMountedSpectrum(canvas, observer)
    expect(observer.observe).toHaveBeenCalledWith(canvas)
    drawSpectrum(canvas, { fluorophore: 'A' }, [], 320, 'light')
    expect(canvas.width).toBeGreaterThan(0)
  })
})
