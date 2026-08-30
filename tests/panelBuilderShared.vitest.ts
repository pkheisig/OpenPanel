// @vitest-environment jsdom
import React from 'react'
import { render } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import {
  bandColor,
  assertPanelSlotsWithinCapacity,
  binEmission,
  buildFluorLookup,
  csvEscape,
  detectorColumnCenterX,
  detectorPointX,
  detectImportedPanelRows,
  formatMetric,
  getCytometerName,
  getSimilarityStyle,
  laserLabel,
  laserOrder,
  laserWavelength,
  linePath,
  mapDetectorToEmission,
  matchImportedFluor,
  normalizeMarkers,
  signatureBandBins,
  signatureY,
  toNumber,
  toSimilarityValue,
  unique,
  unboxGuiState,
  wavelengthToColor,
  PdfIcon,
  PanelImportValidationError,
  assertPanelMarkersWithinCapacity,
  validatePanelFluorophores,
} from '../src/panelBuilderShared'
import type { DetectorInfo, FluorInfo, NumericRow } from '../src/panelBuilderShared'

const detectors: DetectorInfo[] = [
  { detector: 'V1-A', label: 'V1-A', laser: 'Violet', emission: 450, color: '#123456' },
  { detector: 'B2-A', label: 'B2-A', laser: 'Blue', emission: 530, color: '#654321' },
]

const fluorophores: FluorInfo[] = [
  { fluorophore: 'Alexa Fluor 488', peak_detector: 'B2-A', peak_laser: 'Blue', peak_color: '#00ff00' },
  { fluorophore: 'PE (R-phycoerythrin)', peak_detector: 'B2-A', peak_laser: 'Blue', peak_color: '#ff8800' },
  { fluorophore: 'LIVE DEAD NIR', peak_detector: 'V1-A', peak_laser: 'Violet', peak_color: '#8800ff' },
]

describe('panel rendering helpers', () => {
  test('rejects occupied detector slots beyond the configuration capacity', () => {
    expect(() => assertPanelSlotsWithinCapacity(['A', '', 'B'], 2)).toThrow(
      'detector slot 3',
    )
    expect(() => assertPanelSlotsWithinCapacity(['A', '', ''], 2)).not.toThrow()
  })

  test('formats numeric values and clamps similarity inputs', () => {
    expect(formatMetric(1.234)).toBe('1.23')
    expect(formatMetric('2')).toBe('2.00')
    expect(formatMetric(undefined)).toBe('NA')
    expect(formatMetric('not-a-number')).toBe('NA')
    expect(toNumber(2)).toBe(2)
    expect(toNumber(Number.NaN)).toBe(0)
    expect(toNumber('4')).toBe(4)
    expect(toNumber('bad')).toBe(0)
    expect(toSimilarityValue(0.004)).toBe(0)
    expect(toSimilarityValue(-2)).toBe(0)
    expect(toSimilarityValue(2)).toBe(1)
    expect(toSimilarityValue(0.5)).toBe(0.5)
  })

  test('maps detector geometry, labels, lasers, and colors', () => {
    expect(detectorPointX(0, 1, 10, 80)).toBe(50)
    expect(detectorPointX(1, 3, 10, 80)).toBe(50)
    expect(detectorColumnCenterX(0, 0, 10, 80)).toBe(50)
    expect(detectorColumnCenterX(1, 2, 10, 80)).toBe(70)
    expect(linePath({ 'V1-A': 0.5, 'B2-A': '0.25' } as NumericRow, detectors, 100, 230, 10)).toBe('M10.0,107.0 L110.0,156.5')
    expect(linePath({} as NumericRow, [], 100, 230)).toBe('')
    expect(laserOrder).toContain('Other')
    expect(laserLabel('YellowGreen')).toBe('YG 561')
    expect(['Violet', 'Blue', 'Red', 'DeepUV', 'UV', 'IR'].map(laserLabel)).toEqual([
      'V 405', 'B 488', 'R 640', 'DUV 320', 'UV 355', 'IR 781',
    ])
    expect(laserLabel('Unknown')).toBe('Unknown')
    expect(laserWavelength('deepuv')).toBe(320)
    expect(['uv', 'violet', 'blue', 'yellowgreen', 'red', 'ir'].map(laserWavelength)).toEqual([
      355, 405, 488, 561, 640, 781,
    ])
    expect(laserWavelength('unknown')).toBe(0)
    expect(mapDetectorToEmission('B2-A')).toBeGreaterThan(0)
    expect(wavelengthToColor(320)).toMatch(/^rgb\(/)
    expect(wavelengthToColor(360)).toMatch(/^rgb\(/)
    expect(wavelengthToColor(460)).toMatch(/^rgb\(/)
    expect(wavelengthToColor(500)).toMatch(/^rgb\(/)
    expect(wavelengthToColor(550)).toMatch(/^rgb\(/)
    expect(wavelengthToColor(620)).toMatch(/^rgb\(/)
    expect(wavelengthToColor(720)).toMatch(/^rgb\(/)
    expect(wavelengthToColor(780)).toMatch(/^rgb\(/)
    expect(wavelengthToColor(900)).toMatch(/^rgb\(/)
  })

  test('handles generic values and nested GUI state', () => {
    expect(getCytometerName(undefined)).toBe('')
    expect(getCytometerName([])).toBe('')
    expect(getCytometerName(['aurora', 'ignored'])).toBe('aurora')
    expect(getCytometerName(42)).toBe('42')
    expect(binEmission(503, ['id7000'])).toBe(500)
    expect(binEmission(503, ['discover'])).toBe(510)
    expect(binEmission(503, 'other')).toBe(503)
    expect(unique([1, 1, 2])).toEqual([1, 2])
    expect(unboxGuiState([[[1]], { nested: ['x'] }])).toEqual([1, { nested: 'x' }])
    expect(normalizeMarkers({ 0: ['CD3'], 1: null, 2: ['CD4', 'ignored'] })).toEqual({ 0: 'CD3', 1: '', 2: 'CD4,ignored' })
    expect(normalizeMarkers([])).toEqual({})
    expect(csvEscape('a"b')).toBe('"a""b"')
    expect(signatureY(0, 22, 265)).toBeGreaterThan(22)
    expect(signatureBandBins(-1)).toHaveLength(13)
    expect(signatureBandBins(2).every((bin) => bin.density >= 0.05)).toBe(true)
    expect(bandColor(0)).toBe('rgb(0, 0, 255)')
    expect(bandColor(1)).toBe('rgb(255, 0, 0)')
    expect(getSimilarityStyle(0.8, false, 'light').textShadow).not.toBe('none')
    expect(getSimilarityStyle(0.2, false, 'dark').textShadow).toBe('none')
    expect(getSimilarityStyle(0.2, true, 'dark')).toEqual({ background: 'var(--bg-cell-diag)', color: '#fff' })
    expect(getSimilarityStyle(0.2, true, 'light')).toEqual({ background: 'var(--bg-cell-diag)', color: '#111' })
    const { container } = render(React.createElement(PdfIcon, { size: 24 }))
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('28')
  })

  test('detects common delimited panel exports and rejects unusable files', () => {
    const valid = detectImportedPanelRows('Marker,Fluorophore\nCD3,Alexa Fluor 488\nCD19,PE (R-phycoerythrin)', fluorophores)
    expect(valid.rows).toEqual([
      { marker: 'CD3', fluor: 'Alexa Fluor 488' },
      { marker: 'CD19', fluor: 'PE (R-phycoerythrin)' },
    ])
    expect(valid.diagnostics.every(diagnostic => diagnostic.status === 'accepted')).toBe(true)
    expect(detectImportedPanelRows('Alexa Fluor 488\nPE', fluorophores).rows).toEqual([
      { marker: '', fluor: 'Alexa Fluor 488' },
      { marker: '', fluor: 'PE (R-phycoerythrin)' },
    ])
    expect(matchImportedFluor('AF488', buildFluorLookup(fluorophores))).toBe('Alexa Fluor 488')
    expect(detectImportedPanelRows('\uFEFFTarget\tColor\r\nCD3\tAlexa Fluor 488\r\nCD4\tLIVE/DEAD Fixable Near-IR', fluorophores).rows).toEqual([
      { marker: 'CD3', fluor: 'Alexa Fluor 488' },
      { marker: 'CD4', fluor: 'LIVE DEAD NIR' },
    ])
    expect(() => detectImportedPanelRows('', fluorophores)).toThrow('empty')
    expect(() => detectImportedPanelRows('Marker,Fluorophore\nCD3,Unknown', fluorophores)).toThrow('No known fluorophores')
    expect(() => detectImportedPanelRows('Group,Unknown\nGroup-2,Alexa Fluor 488', fluorophores)).toThrow('row 1')
    expect(() => detectImportedPanelRows('Unknown,CD3\nAlexa Fluor 488,CD4', fluorophores)).toThrow('row 1')
    expect(() => detectImportedPanelRows('Fluorophore\n', fluorophores)).toThrow('No known fluorophores')
    expect(() => detectImportedPanelRows('foo,bar\nbaz,qux', fluorophores)).toThrow('No known fluorophores')
    expect(detectImportedPanelRows('Fluorophore,Marker\nAlexa Fluor 488', fluorophores).rows).toEqual([
      { marker: '', fluor: 'Alexa Fluor 488' },
    ])
    expect(() => detectImportedPanelRows('Fluorophore\n;PE', fluorophores)).toThrow('No known fluorophores')
    expect(matchImportedFluor(';Alexa Fluor 488', buildFluorLookup(fluorophores))).toBe('Alexa Fluor 488')
    expect(matchImportedFluor('', buildFluorLookup(fluorophores))).toBe('')
    expect(detectImportedPanelRows('Fluorophore\nAlexa Fluor 488', fluorophores).rows).toEqual([
      { marker: '', fluor: 'Alexa Fluor 488' },
    ])
    expect(detectImportedPanelRows('Fluorophore\n\nAlexa Fluor 488', fluorophores).rows).toEqual([
      { marker: '', fluor: 'Alexa Fluor 488' },
    ])
    expect(detectImportedPanelRows('Fluorophore,Marker\nAlexa Fluor 488,', fluorophores).rows).toEqual([
      { marker: '', fluor: 'Alexa Fluor 488' },
    ])
    expect(detectImportedPanelRows('Sample,Fluorophore\nwell-1,Alexa Fluor 488', fluorophores).rows).toEqual([
      { marker: 'well-1', fluor: 'Alexa Fluor 488' },
    ])
    expect(detectImportedPanelRows('Fluorophore,Clone\nAlexa Fluor 488,UCHT1', fluorophores).rows).toEqual([
      { marker: 'UCHT1', fluor: 'Alexa Fluor 488' },
    ])
    expect(detectImportedPanelRows('Dye,Antibody\nPE (R-phycoerythrin),CD4', fluorophores).rows).toEqual([
      { marker: 'CD4', fluor: 'PE (R-phycoerythrin)' },
    ])
    expect(detectImportedPanelRows('"Fluorophore"\n"PE (R-phycoerythrin)"', fluorophores).rows).toEqual([
      { marker: '', fluor: 'PE (R-phycoerythrin)' },
    ])
    expect(detectImportedPanelRows('"Fluorophore","Marker"\n"PE (R-phycoerythrin)","CD""4"', fluorophores).rows).toEqual([
      { marker: 'CD"4', fluor: 'PE (R-phycoerythrin)' },
    ])
    expect(() => detectImportedPanelRows(`Marker,Fluorophore\n${'x'.repeat(8193)},Alexa Fluor 488`, fluorophores, 8192)).toThrow('marker name')
    expect(() => detectImportedPanelRows('Marker,Fluorophore\nCD3,Unknown', [])).toThrow('No known fluorophores')
  })

  test('reports every rejected panel row without mutating accepted rows', () => {
    let error: unknown
    try {
      detectImportedPanelRows(
        'Marker,Fluorophore\nCD3,Alexa Fluor 488\nCD4,Unknown dye\nCD8,Alexa Fluor 488',
        fluorophores,
      )
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(PanelImportValidationError)
    expect(error).toMatchObject({
      rows: [{ marker: 'CD3', fluor: 'Alexa Fluor 488' }],
      diagnostics: [
        { sourceRow: 2, status: 'accepted' },
        { sourceRow: 3, rawFluorophore: 'Unknown dye', status: 'unsupported' },
        { sourceRow: 4, rawFluorophore: 'Alexa Fluor 488', status: 'duplicate' },
      ],
    })
    expect((error as Error).message).toContain('row 3')
    expect((error as Error).message).toContain('row 4')
  })

  test('identifies project fluorophores unavailable to a selected payload', () => {
    expect(validatePanelFluorophores(
      ['Alexa Fluor 488', 'Unknown dye', ''],
      fluorophores,
    )).toEqual({
      accepted: ['Alexa Fluor 488'],
      diagnostics: [{
        requested: 'Unknown dye',
        canonicalFluorophore: null,
        status: 'unrecognized',
        reason: 'The fluorophore is not available for the selected cytometer configuration.',
      }],
    })
  })

  test('rejects markers beyond detector capacity even when their slots are empty', () => {
    expect(() => assertPanelMarkersWithinCapacity({ 17: 'CD3' }, 18)).not.toThrow()
    expect(() => assertPanelMarkersWithinCapacity({ 18: 'CD4' }, 18)).toThrow('marker slot 19')
  })

  test('uses the bundled alias when detecting duplicate project fluorophores', () => {
    expect(validatePanelFluorophores(
      ['AF488', 'Alexa Fluor 488'],
      fluorophores,
    )).toEqual({
      accepted: ['Alexa Fluor 488'],
      diagnostics: [{
        requested: 'Alexa Fluor 488',
        canonicalFluorophore: 'Alexa Fluor 488',
        status: 'duplicate',
        reason: 'This fluorophore duplicates "AF488".',
      }],
    })
  })
})
