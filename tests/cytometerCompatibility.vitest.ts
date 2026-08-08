import { describe, expect, test } from 'vitest'
import {
  canonicalizeOmipCytometerLabel,
  baseLabel,
  isCytometerSetupMatch,
  normalizedChannelLayout,
} from '../src/cytometerCompatibility'
import { OMIP_CATALOG } from '../src/panelWizardKnowledge'
import { isOmipDesignedForActiveSetup } from '../src/omipSorting'
import {
  getSpectralPanelConfigurations,
  getSpectralPanelLibraries,
} from '../src/spectralEngine'

describe('cytometer compatibility normalization', () => {
  test('canonicalizes published instrument names and preserves reported configurations', () => {
    expect(canonicalizeOmipCytometerLabel('')).toBe('')
    expect(canonicalizeOmipCytometerLabel('BD LSRFortessa')).toBe('BD LSRFortessa')
    expect(canonicalizeOmipCytometerLabel('BD LSR Fortessa')).toBe('BD LSRFortessa')
    expect(canonicalizeOmipCytometerLabel('BD LSR Fortessa X20')).toBe('BD LSRFortessa X-20')
    expect(canonicalizeOmipCytometerLabel('BD LSR Fortessa 3L')).toBe('BD LSRFortessa 3L')
    expect(canonicalizeOmipCytometerLabel('Beckman Coulter CytoFLEX')).toBe('Beckman Coulter CytoFLEX')
    expect(baseLabel('cytoflex', 'CytoFLEX')).toBe('Beckman Coulter CytoFLEX')
    expect(normalizedChannelLayout('3-blue 4-red')).toBe('3-4')
    expect(normalizedChannelLayout('3-4 12/13')).toBe('12/13')
    expect(canonicalizeOmipCytometerLabel('Cytek Aurora 5L (UV-V-B-YG-R)'))
      .toBe('Cytek Aurora 5L: UV/V/B/YG/R')
    expect(canonicalizeOmipCytometerLabel('BD FACSDiscover S8 5L')).toBe('BD FACSDiscover S8 (5L)')
    expect(canonicalizeOmipCytometerLabel('BD FACSymphony A5')).toBe('BD FACSymphony A5 SE')
    expect(canonicalizeOmipCytometerLabel('BD LSR2')).toBe('BD LSR II')
    expect(canonicalizeOmipCytometerLabel('BD FACSCelesta: Blue/Violet/UV'))
      .toBe('BD FACSCelesta: Blue/Violet/UV')
    expect(canonicalizeOmipCytometerLabel('Thermo Fisher Attune CytPix: BYRV6'))
      .toBe('Thermo Fisher Attune CytPix: BYRV6')
    expect(canonicalizeOmipCytometerLabel('Miltenyi MACSQuant Analyzer 16'))
      .toBe('Miltenyi MACSQuant: Analyzer 16')
    expect(canonicalizeOmipCytometerLabel('Thermo Fisher Attune Xenith full detector set'))
      .toBe('Thermo Fisher Attune Xenith: full detector set')
    expect(canonicalizeOmipCytometerLabel('Agilent NovoCyte Quanteon 4025'))
      .toBe('Agilent NovoCyte Quanteon: 4025')
    expect(canonicalizeOmipCytometerLabel('Thermo Fisher Attune CytPix BYRV6 3-blue 4-red'))
      .toContain('BYRV6')
  })

  test('matches configurations by explicit model, laser, and detector-layout signatures', () => {
    expect(isCytometerSetupMatch(
      'BD LSR Fortessa',
      'BD LSRFortessa',
      'BD LSRFortessa 3L: V/B/R',
    )).toBe(true)
    expect(isCytometerSetupMatch(
      'BD LSR Fortessa',
      'BD LSRFortessa',
      'BD LSRFortessa 4L: V/B/YG/R',
    )).toBe(true)
    expect(isCytometerSetupMatch(
      'BD LSR Fortessa 3L',
      'BD LSRFortessa',
      'BD LSRFortessa 4L: V/B/YG/R',
    )).toBe(false)
    expect(isCytometerSetupMatch(
      'BD LSR Fortessa X-20',
      'BD LSRFortessa',
      'BD LSRFortessa 4L: V/B/YG/R',
    )).toBe(false)
    expect(isCytometerSetupMatch(
      'BD FACSDiscover S8 5L',
      'BD FACSDiscover',
      'FACSDiscover S8: UV/V/B/YG/R',
    )).toBe(true)
    expect(isCytometerSetupMatch(
      'BD FACSDiscover S8 5L',
      'BD FACSDiscover',
      'FACSDiscover A8: UV/V/B/YG/R',
    )).toBe(false)
    expect(isCytometerSetupMatch(
      'Sony ID7000 7L',
      'Sony ID7000',
      'ID7000 5L: UV/V/B/YG/R',
    )).toBe(false)
    expect(isCytometerSetupMatch(
      'Cytek Aurora 3L (V-B-R)',
      'Cytek Aurora',
      'Aurora 3L: V/B/R',
    )).toBe(true)
    expect(isCytometerSetupMatch(
      'Cytek Aurora 3L (V-B-R)',
      'Cytek Aurora',
      'Aurora 5L: UV/V/B/YG/R',
    )).toBe(false)
    expect(isCytometerSetupMatch(
      'Cytek Aurora 4L (UV-V-B-R)',
      'Cytek Aurora',
      'Aurora 4L: V/B/YG/R',
    )).toBe(false)
    expect(isCytometerSetupMatch(
      'BD FACSymphony A5',
      'BD FACSymphony A5 SE',
      'BD FACSymphony A5 SE: UV/V/B/YG/R',
    )).toBe(true)
    expect(isCytometerSetupMatch(
      'BD FACSAria Fusion SORP',
      'BD FACSAria Fusion',
      'BD FACSAria Fusion: BUV-optimized facility configuration',
    )).toBe(true)
    expect(isCytometerSetupMatch(
      'Beckman Coulter CytoFLEX S V4-B2-Y4-R3',
      'Beckman Coulter CytoFLEX LX',
      'CytoFLEX LX: UV3-V5-B3-Y5-R3-I0',
    )).toBe(false)
    expect(isCytometerSetupMatch(
      'BD FACSCelesta: Blue/Violet/Red',
      'BD FACSCelesta',
      'BD FACSCelesta: Blue/Violet/UV',
    )).toBe(false)
  })

  test('matches every offered detector configuration to its own cytometer', () => {
    for (const library of getSpectralPanelLibraries()) {
      for (const configuration of getSpectralPanelConfigurations(library.id)) {
        expect(isCytometerSetupMatch(library.label, library.label, configuration.label))
          .toBe(true)
      }
    }
  })

  test('stores canonical labels in the imported OMIP catalog', () => {
    const labels = OMIP_CATALOG.flatMap((entry) => entry.cytometers)
    expect(labels.some((label) => /LSR Fortessa\b/.test(label))).toBe(false)
    expect(labels).toContain('BD LSRFortessa')
    expect(labels).toContain('BD LSRFortessa X-20')
    expect(labels).toContain('Cytek Aurora 5L: UV/V/B/YG/R')
    expect(labels).toContain('BD FACSDiscover S8 (5L)')
    const fortessaOmip = OMIP_CATALOG.find((entry) => entry.name === 'OMIP-065')
    expect(fortessaOmip).toBeDefined()
    expect(isOmipDesignedForActiveSetup(
      fortessaOmip!,
      'BD LSRFortessa',
      'BD LSRFortessa 3L: V/B/R',
    )).toBe(true)
    expect(isOmipDesignedForActiveSetup(
      fortessaOmip!,
      'BD LSRFortessa',
      'BD LSRFortessa 4L: V/B/YG/R',
    )).toBe(true)
  })
})
