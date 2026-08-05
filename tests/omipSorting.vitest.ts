import { describe, expect, test } from 'vitest'
import { isOmipDesignedForActiveSetup, sortOmipEntriesForActiveSetup } from '../src/omipSorting'
import type { OmipCatalogEntry } from '../src/panelWizardKnowledge'

const entries: OmipCatalogEntry[] = [
  {
    id: 'omip-120',
    name: 'OMIP-120',
    summary: '',
    year: '2026',
    cytometers: ['Cytek Aurora 4L (UV-V-B-R)'],
    species: 'mouse',
    cellTypes: [],
    method: 'spectral',
    sourceUrl: '',
    template: null,
  },
  {
    id: 'omip-119',
    name: 'OMIP-119',
    summary: '',
    year: '2025',
    cytometers: ['Cytek Aurora 5L (UV-V-B-YG-R)'],
    species: 'human',
    cellTypes: [],
    method: 'spectral',
    sourceUrl: '',
    template: null,
  },
  {
    id: 'omip-118',
    name: 'OMIP-118',
    summary: '',
    year: '2025',
    cytometers: ['Cytek Aurora 5L (UV-V-B-YG-R)'],
    species: 'human',
    cellTypes: [],
    method: 'spectral',
    sourceUrl: '',
    template: null,
  },
  {
    id: 'omip-101',
    name: 'OMIP-101',
    summary: '',
    year: '2024',
    cytometers: ['BD FACSymphony A5'],
    species: 'human',
    cellTypes: [],
    method: 'conventional',
    sourceUrl: '',
    template: null,
  },
]

describe('OMIP catalog sorting', () => {
  test('puts matching cytometer/configuration panels first, newest first within the group', () => {
    expect(sortOmipEntriesForActiveSetup(
      entries,
      'Cytek Aurora',
      'Aurora 5L: UV/V/B/YG/R',
    ).map((entry) => entry.name)).toEqual([
      'OMIP-119',
      'OMIP-118',
      'OMIP-120',
      'OMIP-101',
    ])
  })

  test('keeps all entries newest first when no active cytometer is selected', () => {
    expect(sortOmipEntriesForActiveSetup(entries).map((entry) => entry.name)).toEqual([
      'OMIP-120',
      'OMIP-119',
      'OMIP-118',
      'OMIP-101',
    ])
    expect(isOmipDesignedForActiveSetup(entries[1], 'Cytek Aurora', 'Aurora 5L: UV/V/B/YG/R')).toBe(true)
    expect(isOmipDesignedForActiveSetup(entries[0], 'Cytek Aurora', 'Aurora 5L: UV/V/B/YG/R')).toBe(false)
  })
})
