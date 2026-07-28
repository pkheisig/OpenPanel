import { describe, expect, test } from 'vitest'
import { rankUiSelectOptions } from '../src/uiSelectSearch'

const cellTypes = [
  { value: '', label: 'Select cell type' },
  { value: 'T cells', label: 'T cells' },
  { value: 'CD4 T cells', label: 'CD4 T cells' },
  { value: 'CD8 T cells', label: 'CD8 T cells' },
  { value: 'Regulatory T cells', label: 'Regulatory T cells' },
  { value: 'NKT cells', label: 'NKT cells' },
  { value: 'Tumor cells', label: 'Tumor cells' },
]

describe('searchable select ranking', () => {
  test('ranks labels beginning with the query before later word and substring matches', () => {
    expect(rankUiSelectOptions(cellTypes, 't').map(({ label }) => label)).toEqual([
      'T cells',
      'Tumor cells',
      'CD4 T cells',
      'CD8 T cells',
      'Regulatory T cells',
      'NKT cells',
      'Select cell type',
    ])
  })

  test('keeps exact and normalized multi-token matches at the top', () => {
    const fluorophores = [
      { value: 'BV750', label: 'BV750' },
      { value: 'LIVE/DEAD Fixable Near-IR', label: 'LIVE/DEAD Fixable Near-IR' },
      { value: 'Zombie NIR', label: 'Zombie NIR' },
    ]

    expect(rankUiSelectOptions(fluorophores, 'live dead nir')[0]?.label)
      .toBe('LIVE/DEAD Fixable Near-IR')
    expect(rankUiSelectOptions(cellTypes, 'T cells')[0]?.label).toBe('T cells')
  })
})
