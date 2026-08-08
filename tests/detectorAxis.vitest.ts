import { describe, expect, test } from 'vitest'
import {
  DETECTOR_LABEL_ROTATION,
  compactDetectorLabel,
  detectorAxisChartWidth,
  detectorAxisDisplayWidth,
  detectorAxisFooterHeight,
  detectorLaserKey,
  detectorLaserMeta,
  detectorLaserSegments,
  detectorSignatureChartWidth,
  detectorSpectralColors,
  mapDetectorToEmission,
  wavelengthToColor,
} from '../src/detectorAxis'

describe('detector axis helpers', () => {
  test('groups detector names and metadata into contiguous segments', () => {
    expect(detectorLaserSegments(['UV1-A', 'UV2-A', 'V1-A', 'B1-A', 'YG1-A', 'R1-A', 'IR1-A', 'Other'])).toEqual([
      expect.objectContaining({ key: 'UV', startIndex: 0, endIndex: 1 }),
      expect.objectContaining({ key: 'V', startIndex: 2, endIndex: 2 }),
      expect.objectContaining({ key: 'B', startIndex: 3, endIndex: 3 }),
      expect.objectContaining({ key: 'YG', startIndex: 4, endIndex: 4 }),
      expect.objectContaining({ key: 'R', startIndex: 5, endIndex: 5 }),
      expect.objectContaining({ key: 'IR', startIndex: 6, endIndex: 6 }),
      expect.objectContaining({ key: 'Other', startIndex: 7, endIndex: 7 }),
    ])
    expect(detectorLaserSegments([])).toEqual([])
    expect(detectorLaserKey({ detector: 'FL1-A', laser: 'Violet' })).toBe('V')
    expect(detectorLaserKey({ detector: 'FL1-A', laser: 'ultraviolet' })).toBe('UV')
    expect(detectorLaserKey({ detector: 'FL1-A', laser: '349' })).toBe('UV')
    expect(detectorLaserKey({ detector: 'FL1-A', laser: 'yellow-green' })).toBe('YG')
    expect(detectorLaserKey({ detector: 'FL1-A', laser: '637' })).toBe('R')
    expect(detectorLaserKey({ detector: 'FL1-A', laser: 'infrared' })).toBe('IR')
    expect(detectorLaserKey({ detector: 'FL1-A', laser: 'other' })).toBe('Other')
    expect(detectorLaserKey('320CH1-A')).toBe('DeepUV')
    expect(detectorLaserKey('355NM1-A')).toBe('UV')
    expect(detectorLaserKey('405CH1-A')).toBe('V')
    expect(detectorLaserKey('488CH4-A')).toBe('B')
    expect(detectorLaserKey('561CH10-A')).toBe('YG')
    expect(detectorLaserKey('637CH17-A')).toBe('R')
    expect(detectorLaserKey('781CH1-A')).toBe('IR')
    expect(detectorLaserKey('DUV1-A')).toBe('DeepUV')
    expect(detectorLaserKey('UV1-A')).toBe('UV')
    expect(detectorLaserKey('V1-A')).toBe('V')
    expect(detectorLaserKey('B1-A')).toBe('B')
    expect(detectorLaserKey('YG1-A')).toBe('YG')
    expect(detectorLaserKey('R1-A')).toBe('R')
    expect(detectorLaserKey('IR1-A')).toBe('IR')
    expect(detectorLaserKey({ detector: 'FL1-A', label: '808CH1' })).toBe('IR')
    expect(detectorLaserKey('unknown')).toBe('Other')
  })

  test('applies cytometer metadata and computes display dimensions', () => {
    expect(detectorLaserMeta('UV', 'xenith').wavelength).toBe('349 nm')
    expect(detectorLaserMeta('R', ['discover']).wavelength).toBe('637 nm')
    expect(detectorLaserMeta('R', 'id7000').wavelength).toBe('637 nm')
    expect(detectorLaserMeta('IR', 'xenith').wavelength).toBe('781 nm')
    expect(detectorLaserMeta('B', null).wavelength).toBe('488 nm')
    expect(detectorAxisChartWidth(1)).toBe(1040)
    expect(detectorAxisChartWidth(100)).toBe(1800)
    expect(detectorSignatureChartWidth(0)).toBe(680)
    expect(detectorSignatureChartWidth(100)).toBe(1800)
    expect(detectorAxisDisplayWidth(0, 'conventional')).toBe(640)
    expect(detectorAxisDisplayWidth(14, 'conventional')).toBe(804)
    expect(detectorAxisDisplayWidth(100, 'conventional')).toBe(1800)
    expect(detectorAxisDisplayWidth(14, 'spectral')).toBeNull()
    expect(detectorAxisFooterHeight([{ detector: 'UV1-A' }])).toBe(64)
    expect(detectorAxisFooterHeight([{ detector: 'B1-A', label: '' }])).toBe(64)
    expect(detectorAxisFooterHeight(['B1-A'])).toBe(64)
    expect(detectorAxisFooterHeight([{ detector: 'FL1-A', label: 'a'.repeat(40) }])).toBe(140)
  })

  test('maps filter and channel names to emission wavelengths', () => {
    expect(mapDetectorToEmission('Filter - 525/20-A')).toBe(525)
    expect(mapDetectorToEmission('UV1 (375)-A')).toBe(375)
    expect(mapDetectorToEmission('320CH1-A')).toBe(350)
    expect(mapDetectorToEmission('488CH4-A')).toBe(500)
    expect(mapDetectorToEmission('561CH10-A')).toBe(570)
    expect(mapDetectorToEmission('637CH17-A')).toBe(660)
    expect(mapDetectorToEmission('808CH36-A')).toBe(810)
    expect(mapDetectorToEmission('V1-A')).toBe(420)
    expect(mapDetectorToEmission('B14-A')).toBe(780)
    expect(mapDetectorToEmission('YG10-A')).toBe(780)
    expect(mapDetectorToEmission('R8-A')).toBe(800)
    expect(mapDetectorToEmission('IR6-A')).toBe(885)
    expect(mapDetectorToEmission('unknown')).toBe(0)
  })

  test('produces colors for every wavelength band and detector fallback', () => {
    for (const wavelength of [349, 350, 419, 420, 439, 440, 489, 490, 509, 510, 579, 580, 644, 645, 700, 780, 781, 900]) {
      expect(wavelengthToColor(wavelength)).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
    }
    const entries = [
      'V1-A',
      { detector: 'custom-a', emission: 530 },
      { detector: 'custom-b', emission: Number.NaN },
      { detector: 'custom-c', label: 'unknown' },
    ]
    const colors = detectorSpectralColors(entries)
    expect(colors).toHaveLength(4)
    expect(new Set(colors).size).toBeGreaterThan(1)
    expect(compactDetectorLabel(' UV12-A ')).toBe('UV12')
    expect(DETECTOR_LABEL_ROTATION).toBe(-90)
  })
})
