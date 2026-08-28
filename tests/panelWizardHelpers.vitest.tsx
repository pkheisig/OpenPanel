// @vitest-environment jsdom
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import {
  BrightnessIndicator,
  formatConfigurationLabel,
  formatCytometerLabel,
  formatMetric,
  initialMarkerSettings,
  resizeWizardMarkers,
  runWizardApplication,
  runWizardTabTransition,
  sortRows,
} from '../src/PanelWizard'
import type { WizardRecommendation } from '../src/panelWizardEngine'

const row = (overrides: Partial<WizardRecommendation>): WizardRecommendation => ({
  markerId: 'id', markerName: 'Marker', slotIndex: 0, antigenDensity: 'medium', fluorophore: 'FITC',
  brightnessLevel: null, isExisting: false, peakLaser: 'Blue', spectralFit: 50, recommendedScore: 50,
  maxSimilarity: 0.5, closestFluorophore: '', complexityDelta: 0, availabilityScore: 50,
  availabilityTier: 'Limited', availabilityConfidence: 'Estimated', ...overrides,
})

describe('panel wizard presentation helpers', () => {
  test('formats cytometer/configuration labels and marker defaults', () => {
    expect(formatCytometerLabel('aurora')).toBe('Aurora')
    expect(formatCytometerLabel('new instrument')).toBe('New Instrument')
    expect(formatConfigurationLabel('config', 'Aurora 5L: UV/V/B')).toBe('5L-UV-V-B')
    expect(formatConfigurationLabel('config', ': UV')).toBe('-UV')
    expect(formatConfigurationLabel('full', '')).toBe('Full detector set')
    expect(formatConfigurationLabel('3l_v_b_r', '')).toBe('3L-V-B-R')
    expect(formatMetric(1.234)).toBe('1.23')
    expect(formatMetric(Number.POSITIVE_INFINITY)).toBe('Non-identifiable')
    expect(formatMetric(Number.NaN)).toBe('NA')
    expect(initialMarkerSettings(3, ['FITC', '', 'PE'], { 1: 'CD4' })).toEqual([
      expect.objectContaining({ slotIndex: 0, currentFluorophore: 'FITC' }),
      expect.objectContaining({ slotIndex: 1, name: 'CD4' }),
      expect.objectContaining({ slotIndex: 2, currentFluorophore: 'PE' }),
    ])
    expect(initialMarkerSettings(2, ['FITC'], { 0: 'Viability' })[0].currentFluorophore).toBe('')
  })

  test('sorts existing recommendations ahead of every supported ranking', () => {
    const rows = [
      row({ markerId: 'a', isExisting: false, spectralFit: 90, availabilityScore: 40, maxSimilarity: 0.8, complexityDelta: 0.2, antigenDensity: 'low', recommendedScore: 30 }),
      row({ markerId: 'b', isExisting: true, spectralFit: 10, availabilityScore: 10, maxSimilarity: 0.2, complexityDelta: -0.1, antigenDensity: 'high', recommendedScore: 20 }),
      row({ markerId: 'c', isExisting: false, spectralFit: 70, availabilityScore: 90, maxSimilarity: 0.1, complexityDelta: -0.2, antigenDensity: 'medium', recommendedScore: 80 }),
    ]
    for (const sort of ['spectral', 'availability', 'similarity', 'complexity', 'marker', 'recommended'] as const) {
      expect(sortRows(rows, sort)[0].markerId).toBe('b')
    }
    expect(sortRows(rows, 'spectral').map((item) => item.markerId)).toEqual(['b', 'a', 'c'])
    expect(sortRows(rows, 'availability').map((item) => item.markerId)).toEqual(['b', 'c', 'a'])
  })

  test('renders brightness indicators for unavailable and clamped values', () => {
    render(<div><BrightnessIndicator level={null} /><BrightnessIndicator level={8} /></div>)
    expect(screen.getByRole('img', { name: 'Brightness unavailable' })).not.toBeNull()
    expect(screen.getByRole('img', { name: 'Brightness 5 of 5' })).not.toBeNull()
    expect(screen.getByRole('img', { name: 'Brightness 5 of 5' }).querySelectorAll('.is-filled')).toHaveLength(5)
  })

  test('resizes marker state without dropping occupied slots', () => {
    const current = initialMarkerSettings(2, ['FITC'], { 1: 'CD4' })
    expect(resizeWizardMarkers(current, 2, ['FITC'])).toBe(current)
    expect(resizeWizardMarkers(current, 1, ['FITC'])).toHaveLength(1)
    expect(resizeWizardMarkers(current, 4, ['FITC', 'PE', 'APC'])).toHaveLength(4)
  })

  test('skips stale application state and closes after a successful application', async () => {
    const onApply = vi.fn(async () => undefined)
    const onClose = vi.fn()
    await runWizardApplication(null, [], 0, onApply, onClose)
    expect(onApply).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()

    const activeResult = {
      kind: 'recommended' as const,
      rows: [row({ fluorophore: 'PE' })],
      alternatives: [],
      complexity: 1,
      previousComplexity: 1,
      maxSimilarity: 0,
      spectralRisk: 0,
      averageAvailability: 100,
    }
    const markers = initialMarkerSettings(1, ['FITC'], { 0: 'CD3' })
    await runWizardApplication(activeResult, markers, 1, onApply, onClose)
    expect(onApply).toHaveBeenCalledWith({ markers, recommendations: activeResult.rows, desiredSize: 1 })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('guards wizard tab transitions until recommendations are unlocked', () => {
    const visited = vi.fn()
    const completed = vi.fn()
    const setActive = vi.fn()
    runWizardTabTransition('recommendations', false, visited, completed, setActive)
    expect(visited).not.toHaveBeenCalled()
    expect(setActive).not.toHaveBeenCalled()
    runWizardTabTransition('coexpression', true, visited, completed, setActive)
    runWizardTabTransition('recommendations', true, visited, completed, setActive)
    expect(visited).toHaveBeenCalledTimes(1)
    expect(completed).toHaveBeenCalledTimes(1)
    expect(setActive).toHaveBeenNthCalledWith(1, 'coexpression')
    expect(setActive).toHaveBeenNthCalledWith(2, 'recommendations')
  })
})
