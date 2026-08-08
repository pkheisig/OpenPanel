import { describe, expect, test, vi } from 'vitest'

vi.mock('ml-matrix', async () => {
  const actual = await vi.importActual<typeof import('ml-matrix')>('ml-matrix')
  return {
    ...actual,
    inverse: vi.fn(() => {
      throw new Error('singular matrix')
    }),
  }
})

import { generateWizardResults } from '../src/panelWizardEngine'

describe('wizard engine numerical failure handling', () => {
  test('uses the conservative spreading risk when matrix inversion fails', () => {
    const payload = {
      cytometer: 'aurora', configuration: 'config', measurement_mode: 'spectral',
      libraries: [], configurations: [],
      detectors: [{ detector: 'V1-A' }, { detector: 'B1-A' }],
      fluorophores: [
        { fluorophore: 'FITC', peak_laser: 'Violet' },
        { fluorophore: 'PE', peak_laser: 'Blue' },
      ],
      selected: ['FITC', 'PE'],
      spectra: [
        { fluorophore: 'FITC', 'V1-A': 1, 'B1-A': 0 },
        { fluorophore: 'PE', 'V1-A': 0, 'B1-A': 1 },
      ],
      similarity: [], complexity_index: null, peak_detectors: [], max_panel_size: 2,
    } as never
    const results = generateWizardResults(payload, [
      { id: 'a', slotIndex: 0, name: 'CD3', antigenDensity: 'medium', currentFluorophore: '' },
      { id: 'b', slotIndex: 1, name: 'CD4', antigenDensity: 'medium', currentFluorophore: '' },
    ], {}, 2)
    expect(results.recommended.rows).toHaveLength(2)
    expect(results.recommended.spectralRisk).toBeGreaterThan(100)
  })
})
