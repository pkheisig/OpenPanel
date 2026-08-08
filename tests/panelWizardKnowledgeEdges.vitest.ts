import { describe, expect, test } from 'vitest'
import {
  buildMarkerOptions,
  inferCoexpression,
  inferOmipCellTypes,
  markerOptionsForPanel,
  omipTemplateAssignmentsForPanel,
  omipTemplateAssignmentsForPanelBestEffort,
  omipMethod,
  omipSpecies,
} from '../src/panelWizardKnowledge'
import type { CoexpressionContext, OmipTemplate } from '../src/panelWizardKnowledge'

const humanContext: CoexpressionContext = {
  species: 'human', tissue: 'pbmc', population: 't-cells', condition: 'baseline',
}

describe('wizard knowledge edge cases', () => {
  test('merges marker dictionary aliases and ignores empty custom entries', () => {
    const options = buildMarkerOptions([
      { marker: ' CD3 ', aliases: 'T cell; CD3; ' },
      { marker: 'cd3', aliases: 'T-cell;Duplicate' },
      { marker: '  ', aliases: 'ignored' },
    ])
    const cd3 = options.find((option) => option.value === 'CD3')
    expect(cd3?.searchText).toContain('T cell')
    expect(cd3?.searchText).not.toContain('T-cell')
    expect(cd3?.searchText).toContain('Duplicate')
    expect(options.some((option) => option.value === '')).toBe(false)
  })

  test('prioritizes contextual and selected marker options for mouse and human', () => {
    const options = [
      { value: 'CD3', label: 'CD3' },
      { value: 'B220', label: 'B220' },
      { value: 'Unrelated', label: 'Unrelated' },
    ]
    const mouse = markerOptionsForPanel('b-cells', ['Unrelated'], 'mouse', options)
    expect(mouse.map((option) => option.value)).toEqual(['B220', 'CD3', 'Unrelated'])
    const human = markerOptionsForPanel('all', [], 'human', options)
    expect(human.map((option) => option.value)).toEqual(['B220', 'CD3', 'Unrelated'])
  })

  test('infers baseline, activated, viability, unknown, and mouse-specific coexpression', () => {
    const markers = [
      { id: 'a', slotIndex: 0, name: 'CD3', antigenDensity: 'medium' as const, currentFluorophore: '' },
      { id: 'b', slotIndex: 1, name: 'KI67', antigenDensity: 'medium' as const, currentFluorophore: '' },
      { id: 'c', slotIndex: 2, name: 'LIVE/DEAD', antigenDensity: 'medium' as const, currentFluorophore: '' },
      { id: 'd', slotIndex: 3, name: 'Unknown', antigenDensity: 'medium' as const, currentFluorophore: '' },
    ]
    const baseline = inferCoexpression(markers, humanContext, {})
    expect(Object.keys(baseline)).toHaveLength(3)
    const activated = inferCoexpression(markers, { ...humanContext, condition: 'inflammatory' }, baseline)
    expect(activated['a::b']).toBeGreaterThanOrEqual(baseline['a::b'] ?? 0)
    const mouse = inferCoexpression([
      markers[0],
      { ...markers[1], name: 'CD56', id: 'b' },
    ], { ...humanContext, species: 'mouse', population: 'nk-cells' }, {})
    expect(mouse).toEqual({})
    const contextual = inferCoexpression([
      { ...markers[0], id: 'live', name: 'Live/Dead' },
      { ...markers[1], id: 'ki', name: 'Ki67' },
      { ...markers[1], id: 'cd69', name: 'CD69' },
    ], { ...humanContext, condition: 'inflammatory' }, {})
    expect(Object.keys(contextual).length).toBe(3)
    const baselineContext = inferCoexpression([
      { ...markers[0], id: 'cd69', name: 'CD69' },
      { ...markers[1], id: 'pd1', name: 'PD-1' },
    ], { ...humanContext, condition: 'baseline' }, {})
    expect(Object.values(baselineContext).every((value) => value >= 0)).toBe(true)
  })

  test('enforces template size, names, availability, and duplicate policies', () => {
    const makeTemplate = (markers: OmipTemplate['markers'], allowDuplicateFluorophores?: boolean): OmipTemplate => ({
      id: 'test', name: 'Test', summary: '', sourceUrl: '', context: humanContext,
      markers, allowDuplicateFluorophores,
    })
    expect(omipTemplateAssignmentsForPanel(makeTemplate([]), ['FITC'])).toBeNull()
    expect(omipTemplateAssignmentsForPanel(makeTemplate([{ name: 'A', fluorophore: 'FITC' }], false), [], 1)).toBeNull()
    expect(omipTemplateAssignmentsForPanel(makeTemplate([{ name: 'A', fluorophore: 'FITC' }]), ['FITC'], 0)).toBeNull()
    expect(omipTemplateAssignmentsForPanel(makeTemplate([{ name: ' ', fluorophore: 'FITC' }]), ['FITC'])).toBeNull()
    expect(omipTemplateAssignmentsForPanel(makeTemplate([
      { name: 'A', fluorophore: 'FITC' }, { name: 'B', fluorophore: 'fitc' },
    ]), ['FITC'])).toBeNull()
    expect(omipTemplateAssignmentsForPanel(makeTemplate([
      { name: ' A ', fluorophore: 'FITC' }, { name: ' B ', fluorophore: 'FITC' },
    ], true), ['FITC'])).toEqual([{ marker: 'A', fluorophore: 'FITC' }, { marker: 'B', fluorophore: 'FITC' }])
    expect(omipTemplateAssignmentsForPanelBestEffort(makeTemplate([
      { name: 'A', fluorophore: 'FITC' }, { name: ' ', fluorophore: 'PE' }, { name: 'B' }, { name: 'C', fluorophore: 'PE' },
    ]), ['FITC'], 2)).toEqual([{ marker: 'A', fluorophore: 'FITC' }])
    expect(omipTemplateAssignmentsForPanelBestEffort(makeTemplate([{ name: 'B' }]), ['FITC']))
      .toEqual([{ marker: 'B', fluorophore: '' }])
  })

  test('classifies cell types across supported description vocabulary', () => {
    const description = 'T cells Tregs B-cells plasma cells natural killer dendritic monocytes macrophages neutrophils platelets innate lymphoid stem progenitor tumor cells cancer'
    expect(inferOmipCellTypes(description)).toEqual(expect.arrayContaining([
      'T cells', 'Regulatory T cells', 'B cells', 'NK cells', 'Dendritic cells',
      'Monocytes', 'Macrophages', 'Granulocytes', 'Platelets', 'Innate lymphoid cells',
      'Stem / progenitor cells', 'Tumor cells',
    ]))
    expect(inferOmipCellTypes('major immune cell landscape')).toContain('Mixed immune cells')
    expect(inferOmipCellTypes('unrelated assay')).toEqual(['Mixed immune cells'])
    expect(omipSpecies('macaque study', null)).toBe('non-human-primate')
    expect(omipSpecies('unknown study', null)).toBe('other')
    expect(omipSpecies('anything', { id: 'x', name: 'x', summary: '', sourceUrl: '', context: humanContext, markers: [] })).toBe('human')
    expect(omipMethod('imaging mass cytometry')).toBe('imaging')
    expect(omipMethod('CyTOF mass cytometry')).toBe('mass')
    expect(omipMethod('full-spectrum panel')).toBe('spectral')
    expect(omipMethod('flow cytometry')).toBe('conventional')
  })
})
